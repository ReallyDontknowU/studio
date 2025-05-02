
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import BarcodeScanner from '@/components/barcode-scanner';
import { useToast } from '@/hooks/use-toast';
import type { Student, EntryLog, EntryType } from '@/lib/types';
import { extractBarcodeData } from '@/ai/flows/extract-barcode-data';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, LogIn, LogOut, AlertCircle, UserCheck, UserX, ImageOff, Camera } from 'lucide-react'; // Added Camera icon
import { MIN_LIBRARY_INTERVAL_SECONDS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import Image from 'next/image';

// Helper function to get student data (replace with actual API call)
const getStudentById = (id: string): Student | null => {
  try {
      const students: Student[] = JSON.parse(localStorage.getItem('students') || '[]');
      // Ensure case-insensitive matching and trim whitespace
      const trimmedId = id.trim().toLowerCase();
      return students.find(s => s.id.trim().toLowerCase() === trimmedId) || null;
  } catch (e) {
      console.error("Error reading students from localStorage:", e);
      return null;
  }
};

// Helper function to get last entry/exit log for a student (replace with actual API call)
const getLastLogForStudent = (studentId: string): EntryLog | null => {
  try {
      const logs: EntryLog[] = JSON.parse(localStorage.getItem('entryLogs') || '[]');
      const trimmedStudentId = studentId.trim().toLowerCase();
      const studentLogs = logs
          .filter(log => log.studentId.trim().toLowerCase() === trimmedStudentId)
          .map(log => ({ ...log, timestamp: new Date(log.timestamp) }))
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      return studentLogs.length > 0 ? studentLogs[0] : null;
   } catch (e) {
      console.error("Error reading entryLogs from localStorage:", e);
      return null;
   }
};


// Helper function to save entry log (replace with actual API call)
const saveEntryLog = (log: EntryLog): void => {
   try {
       const logs: EntryLog[] = JSON.parse(localStorage.getItem('entryLogs') || '[]');
       logs.push(log);
       localStorage.setItem('entryLogs', JSON.stringify(logs));
   } catch (e) {
       console.error("Error saving entryLog to localStorage:", e);
       // Potentially show an error toast to the user
        toast({
            title: "Storage Error",
            description: "Could not save the log entry.",
            variant: "destructive",
        });
   }
   // TODO: Also save to Excel/SQLite
};

// Simplified image comparison (for demonstration)
const compareImagesRoughly = (imageUri1?: string, imageUri2?: string): boolean => {
    if (!imageUri1 || !imageUri2) return false;
    // Compare based on length and a significant portion to avoid trivial matches/mismatches
    if (Math.abs(imageUri1.length - imageUri2.length) > 100) return false; // Quick check for large size differences
    const segmentLength = Math.min(200, imageUri1.length, imageUri2.length); // Increased segment length
    const segment1 = imageUri1.substring(imageUri1.length - segmentLength);
    const segment2 = imageUri2.substring(imageUri2.length - segmentLength);
    return segment1 === segment2;
}

export default function AdminScanPage() {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false); // True while AI is processing or saving log
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [lastScanResult, setLastScanResult] = useState<{
    student: Partial<Student>;
    log: Partial<EntryLog> & { type: EntryType | 'Error' };
    scannedImageUri?: string;
    imageMatch?: boolean;
  } | null>(null);
  const [isScannerActive, setIsScannerActive] = useState(false); // Controls if scanner UI should be rendered and attempting to start camera
  const scannerRef = useRef<HTMLDivElement>(null); // Ref to containing div

  // --- Scan Processing Logic ---
  const processDetectedBarcode = useCallback(async (imageDataUri: string) => {
    if (isProcessing) {
        console.log("[AdminScan] processDetectedBarcode: Already processing, skipping.");
        return; // Prevent concurrent processing
    }

    console.log("[AdminScan] processDetectedBarcode: Initiated.");
    setIsProcessing(true); // Indicate start of AI processing/saving phase
    setProcessingError(null);
    // Keep scanner UI visible but disabled during this phase
    // setLastScanResult(null); // Clear previous result? Maybe not, let user see last result until next scan starts

    let extractedId: string | null = null;
    let student: Student | null = null;
    let imageMatchResult: boolean | undefined = undefined;
    const now = new Date();
    let scanSuccessful = false;

    try {
      console.log("[AdminScan] Calling extractBarcodeData...");
      const extractionResult = await extractBarcodeData({ barcodeImage: imageDataUri });
      console.log("[AdminScan] Extraction result:", extractionResult);

      if (!extractionResult || !extractionResult.idNumber || extractionResult.idNumber.trim() === "") {
        throw new Error("Could not extract a valid ID number from the barcode image.");
      }

      extractedId = extractionResult.idNumber.trim().toLowerCase(); // Trim and normalize
      console.log(`[AdminScan] Extracted ID: ${extractedId}`);

      student = getStudentById(extractedId);
      console.log(`[AdminScan] Student lookup result for ID ${extractedId}:`, student);
      if (!student) {
        throw new Error(`Student with ID ${extractedId.toUpperCase()} not found. Please register first.`);
      }

      // Compare images if stored image exists
      if (student.idCardImageUri) {
        imageMatchResult = compareImagesRoughly(student.idCardImageUri, imageDataUri);
        console.log(`[AdminScan] Image comparison result for ${student.name}: ${imageMatchResult}`);
        if (!imageMatchResult) {
          toast({
            title: "Image Mismatch Warning",
            description: `Scanned ID image may differ from the registered image for ${student.name}. Please verify.`,
            variant: "destructive", // Use destructive for higher visibility
            duration: 7000, // Longer duration
          });
        }
      } else {
        console.log(`[AdminScan] No registered ID card image found for ${student.name} to compare.`);
        toast({
          title: "Info: No Registered Image",
          description: `No ID image on file for ${student.name} to compare against.`,
          variant: "default",
          duration: 4000,
        });
      }

      // Determine Entry or Exit, check rate limit
      const lastLog = getLastLogForStudent(extractedId);
      let currentAction: EntryType = 'Entry';

      if (lastLog) {
        const timeDiffSeconds = (now.getTime() - lastLog.timestamp.getTime()) / 1000;
        console.log(`[AdminScan] Last log for ${student.name}: Type ${lastLog.type}, Time diff: ${timeDiffSeconds}s`);

        if (timeDiffSeconds < MIN_LIBRARY_INTERVAL_SECONDS) {
          throw new Error(`Please wait ${Math.ceil(MIN_LIBRARY_INTERVAL_SECONDS - timeDiffSeconds)}s before scanning ${student.name} again.`);
        }
        currentAction = lastLog.type === 'Entry' ? 'Exit' : 'Entry';
      } else {
        console.log(`[AdminScan] No previous log found for ${student.name}. Defaulting to Entry.`);
      }

      // Create and Save Log
      const newLog: EntryLog = {
        id: `log_${now.getTime()}_${extractedId}`, // Use extractedId for consistency before saving
        studentId: student.id, // Use canonical ID from found student object
        studentName: student.name,
        branch: student.branch,
        timestamp: now,
        type: currentAction,
      };
      console.log("[AdminScan] Saving new log entry:", newLog);
      saveEntryLog(newLog);
      scanSuccessful = true; // Mark as successful for final state update

      // Display Success
      setLastScanResult({ student, log: newLog, scannedImageUri: imageDataUri, imageMatch: imageMatchResult });
      toast({
        title: `${currentAction} Recorded`,
        description: `${student.name} (${student.id.toUpperCase()}) recorded as ${currentAction.toLowerCase()} at ${format(now, 'Pp')}.`,
        variant: 'default',
      });
      console.log(`[AdminScan] Success - ${student.name} recorded as ${currentAction}.`);

    } catch (error: any) {
      console.error('[AdminScan] Error processing scan:', error);
      const errorMessage = error.message || 'An unknown error occurred.';
      setProcessingError(errorMessage);
      toast({
        title: 'Scan Processing Error',
        description: errorMessage,
        variant: 'destructive',
      });

      // Prepare error display data
      let errorStudentData: Partial<Student> = { id: extractedId || "Unknown", name: "Unknown" };
      if (student) { // Student found before error (e.g., rate limit)
        errorStudentData = student;
      } else if (extractedId) { // ID extracted, but student not found
        errorStudentData = { id: extractedId.toUpperCase(), name: "Not Registered" };
      }

      setLastScanResult({
        student: errorStudentData,
        log: { type: 'Error', timestamp: now },
        scannedImageUri: imageDataUri, // Include scanned image even on error
        imageMatch: imageMatchResult, // Include image match result if comparison happened
      });
      scanSuccessful = false; // Explicitly mark as failed

    } finally {
      console.log("[AdminScan] processDetectedBarcode: Finalizing.");
      setIsProcessing(false); // Finished AI/saving phase
      setIsScannerActive(false); // Stop the scanner and show the "Start Scanning" button again
      console.log("[AdminScan] Scanner deactivated after processing.");
    }
  }, [isProcessing, toast]); // Dependencies: isProcessing, toast

  // --- Scanner Error Handling (from component) ---
  const handleScanError = useCallback((error: Error) => {
    console.error("[AdminScan] Scanner component error:", error);
    // Avoid overly generic messages if possible
    let errMsg = `Scanner Error: ${error.message}. Check camera permissions and ensure it's not in use. Try refreshing the page.`;
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
         errMsg = 'Camera permission denied. Please allow access in browser settings and refresh.';
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
         errMsg = 'No camera found. Ensure it is connected and enabled.';
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
         errMsg = 'Camera is already in use or could not be started. Close other apps/tabs using the camera and refresh.';
    }
    setProcessingError(errMsg);
    toast({
      title: 'Scanner Hardware/Permission Issue',
      description: errMsg,
      variant: 'destructive',
    });
    setIsScannerActive(false); // Stop trying to use the scanner
    setIsProcessing(false); // Ensure processing is also marked false
  }, [toast]);

  // --- Manual Start ---
  const startScannerSession = () => {
      console.log(`[AdminScan] startScannerSession called manually.`);
      setLastScanResult(null); // Clear previous result display on manual start
      setProcessingError(null);
      setIsProcessing(false); // Ensure processing is false before starting
      setIsScannerActive(true); // Set intent to have scanner active
      // The BarcodeScanner component's effect will attempt to start the camera
  };

  // --- Stop Scanning (Called by BarcodeScanner's cleanup or error handlers implicitly) ---
  // We don't need an explicit stop button if we stop after each scan attempt


  return (
    <div className="container mx-auto px-4 py-8 flex flex-col items-center gap-8">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">Record Entry/Exit</CardTitle>
          <CardDescription>Scan student ID barcodes to log library visits.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6" ref={scannerRef}>

          {/* Scanner Component or Start Button */}
          {isScannerActive ? (
             // Render scanner component when active intent is set
             <BarcodeScanner
               onScanSuccess={processDetectedBarcode}
               onScanError={handleScanError}
               scanPrompt="Position barcode..."
               disabled={isProcessing} // Disable scanner interactions *during* AI processing
               autoStartScanLoop={true} // Auto loop frames while active
             />
          ) : (
            // Show button to start scanning session
            <Button onClick={startScannerSession} className="transition-subtle" disabled={isProcessing}>
              <Camera className="mr-2 h-4 w-4" /> Start Scanning Session
            </Button>
          )}

          {/* Processing Indicator (during AI/Save phase) */}
          {isProcessing && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground mt-4">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Processing scan...</span>
            </div>
          )}

          {/* Last Scan Result Display */}
          {/* Show last result even if scanner is inactive (until next scan starts) */}
          {lastScanResult && (
             <Card className={`w-full max-w-md mt-4 border-2 ${
                lastScanResult.log.type === 'Error' ? 'border-destructive bg-destructive/10' :
                lastScanResult.log.type === 'Entry' ? 'border-green-500 bg-green-500/10' :
                'border-red-500 bg-red-500/10'
                // Add specific yellow border if image mismatch occurred *and* it wasn't an error log type
                } ${lastScanResult.imageMatch === false && lastScanResult.log.type !== 'Error' ? '!border-yellow-500 !border-2' : ''}`}>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                    {lastScanResult.log.type === 'Error' ? <><UserX className="text-destructive" /> Scan Error</> :
                    lastScanResult.log.type === 'Entry' ? <><UserCheck className="text-green-600" /> Entry Recorded</> :
                    <><LogOut className="text-red-600" /> Exit Recorded</>}
                    </CardTitle>
                    <CardDescription>
                     {/* Display specific error message if it was an error */}
                     {lastScanResult.log.type === 'Error' && processingError ? processingError :
                        lastScanResult.log.timestamp ? `Scan Time: ${format(lastScanResult.log.timestamp, 'Pp')}` : "Details unavailable"}
                    </CardDescription>
                </CardHeader>
                <CardContent className="text-sm space-y-3"> {/* Increased space-y */}
                    {/* Scanned Image */}
                    {lastScanResult.scannedImageUri && (
                    <div className="flex flex-col items-center mb-3"> {/* Increased margin-bottom */}
                        <p className="text-xs font-medium text-muted-foreground mb-1">Scanned Image:</p>
                        <Image
                        src={lastScanResult.scannedImageUri}
                        alt="Scanned ID"
                        width={100}
                        height={150} // Maintain aspect ratio
                        className={`rounded border object-contain ${lastScanResult.imageMatch === false && lastScanResult.log.type !== 'Error' ? 'border-yellow-500 border-2 shadow-md' : 'border-muted'}`}
                        />
                        {lastScanResult.imageMatch === false && lastScanResult.log.type !== 'Error' && (
                         <span className="text-xs text-yellow-600 font-semibold mt-1 animate-pulse">Image Mismatch!</span>
                        )}
                        {lastScanResult.imageMatch === true && lastScanResult.log.type !== 'Error' && (
                           <span className="text-xs text-green-600 font-semibold mt-1">Image Match</span>
                        )}
                        {lastScanResult.imageMatch === undefined && lastScanResult.log.type !== 'Error' && (
                        <span className="text-xs text-muted-foreground mt-1">(No stored image for comparison)</span>
                        )}
                    </div>
                    )}

                    {/* Student Details */}
                    <div>
                    <p><strong>Student:</strong> {lastScanResult.student?.name || 'N/A'}</p>
                    <p><strong>ID:</strong> {lastScanResult.student?.id?.toUpperCase() || 'N/A'}</p>
                    {/* Show branch only if it's not an error and student data is available */}
                    {lastScanResult.log.type !== 'Error' && lastScanResult.student?.branch && (
                        <p><strong>Branch:</strong> {lastScanResult.student.branch}</p>
                    )}
                    </div>

                    {/* Explicit Error Message Section (Redundant if already in description) */}
                    {/* {lastScanResult.log.type === 'Error' && processingError && (
                    <p className="text-destructive font-medium pt-1">{processingError}</p>
                    )} */}
                </CardContent>
            </Card>
          )}

          {/* Display General Processing/Scanner Errors only if no specific lastScanResult error is shown */}
           {processingError && !lastScanResult && !isProcessing && (
            <Alert variant="destructive" className="w-full max-w-md mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Scanner Session Error</AlertTitle>
              <AlertDescription>{processingError}</AlertDescription>
              {!isScannerActive && (
                  <Button onClick={() => startScannerSession()} size="sm" variant="outline" className="mt-2">
                    <Camera className="mr-1 h-3 w-3" /> Try Again
                 </Button>
              )}
            </Alert>
          )}

        </CardContent>
      </Card>
    </div>
  );
}

    