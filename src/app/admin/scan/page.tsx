
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
       // Note: Toast needs to be called from the component context, not here directly.
       // Consider returning a success/failure boolean or throwing an error to be caught in the component.
   }
   // TODO: Also save to Excel/SQLite
};

// Simplified image comparison (for demonstration)
// Returns true (match), false (mismatch), or undefined (no comparison possible/needed)
const compareImagesRoughly = (imageUri1?: string, imageUri2?: string): boolean | undefined => {
    const logPrefix = "[compareImages]";
    if (!imageUri1 || !imageUri2) {
        console.log(`${logPrefix} One or both images missing, cannot compare.`);
        return undefined; // Cannot compare
    }
    // Basic check: Are they exactly the same string? (Handles cases where the same image was somehow submitted twice)
    if (imageUri1 === imageUri2) {
        console.log(`${logPrefix} Images are identical strings.`);
        return true;
    }
    // Compare based on length and a significant portion to avoid trivial matches/mismatches
    // Use a length difference threshold (e.g., 10% or a fixed number of bytes)
    const lengthThreshold = Math.max(imageUri1.length, imageUri2.length) * 0.1; // 10% threshold
    if (Math.abs(imageUri1.length - imageUri2.length) > lengthThreshold) {
        console.log(`${logPrefix} Significant length difference (${imageUri1.length} vs ${imageUri2.length}). Likely mismatch.`);
        return false; // Large size differences suggest mismatch
    }
    // Compare a segment from the end (less likely to be affected by metadata changes at the start)
    const segmentLength = Math.min(500, Math.floor(imageUri1.length / 2), Math.floor(imageUri2.length / 2)); // Compare up to 500 chars from the end
    if (segmentLength < 50) { // If images are very small, comparison is unreliable
         console.log(`${logPrefix} Images too small for reliable segment comparison.`);
         return undefined; // Unreliable comparison
    }
    const segment1 = imageUri1.substring(imageUri1.length - segmentLength);
    const segment2 = imageUri2.substring(imageUri2.length - segmentLength);
    const match = segment1 === segment2;
    console.log(`${logPrefix} Segment comparison result: ${match}`);
    return match;
}

export default function AdminScanPage() {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false); // True while AI is processing or saving log
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [lastScanResult, setLastScanResult] = useState<{
    student: Partial<Student>;
    log: Partial<EntryLog> & { type: EntryType | 'Error' };
    scannedImageUri?: string;
    imageMatch?: boolean; // true=match, false=mismatch, undefined=no comparison
  } | null>(null);
  const [isScannerActive, setIsScannerActive] = useState(false); // Controls if scanner UI should be rendered and attempting to start camera
  const scannerContainerRef = useRef<HTMLDivElement>(null); // Ref to containing div for potential focus management

  // --- Scan Processing Logic ---
  const processDetectedBarcode = useCallback(async (imageDataUri: string) => {
    const logPrefix = "[AdminScan.process]";
    if (isProcessing) {
        console.log(`${logPrefix} Already processing, skipping.`);
        return; // Prevent concurrent processing
    }

    console.log(`${logPrefix} Initiated with image data (length: ${imageDataUri.length})`);
    setIsProcessing(true); // Indicate start of AI processing/saving phase
    setProcessingError(null);
    setLastScanResult(null); // Clear previous result immediately

    let extractedId: string | null = null;
    let student: Student | null = null;
    let imageMatchResult: boolean | undefined = undefined;
    const now = new Date();
    let scanSuccessful = false; // Track overall success for final state update

    try {
      console.log(`${logPrefix} Calling extractBarcodeData...`);
      const extractionResult = await extractBarcodeData({ barcodeImage: imageDataUri });
      console.log(`${logPrefix} Extraction result:`, extractionResult);

      if (!extractionResult || !extractionResult.idNumber || extractionResult.idNumber.trim() === "") {
        throw new Error("Could not extract a valid ID number from the barcode image.");
      }

      extractedId = extractionResult.idNumber.trim().toLowerCase(); // Trim and normalize ID
      console.log(`${logPrefix} Extracted ID: ${extractedId}`);

      student = getStudentById(extractedId);
      console.log(`${logPrefix} Student lookup result for ID ${extractedId}:`, student ? student.name : 'Not Found');
      if (!student) {
        throw new Error(`Student with ID ${extractedId.toUpperCase()} not found. Please register first.`);
      }

      // Compare images if a stored image exists for the found student
      if (student.idCardImageUri) {
        imageMatchResult = compareImagesRoughly(student.idCardImageUri, imageDataUri);
        console.log(`${logPrefix} Image comparison result for ${student.name}: ${imageMatchResult}`);
        if (imageMatchResult === false) { // Explicitly check for false (mismatch)
          toast({
            title: "Image Mismatch Warning",
            description: `Scanned ID image may differ from the registered image for ${student.name}. Please verify student identity.`,
            variant: "destructive", // Use destructive for high visibility warning
            duration: 7000, // Longer duration for warning
          });
        } else if (imageMatchResult === true) {
           console.log(`${logPrefix} Image match confirmed for ${student.name}.`);
           // Optional: Show a subtle success indicator? Maybe not needed.
        } else {
            // Undefined means no comparison or unreliable
             console.log(`${logPrefix} Image comparison inconclusive for ${student.name}.`);
              toast({
                 title: "Info: Image Comparison",
                 description: `Could not reliably compare scanned image with stored image for ${student.name}.`,
                 variant: "default",
                 duration: 4000,
              });
        }
      } else {
        console.log(`${logPrefix} No registered ID card image found for ${student.name} to compare.`);
        imageMatchResult = undefined; // Explicitly set to undefined if no stored image
        toast({
          title: "Info: No Registered Image",
          description: `No ID image on file for ${student.name} to compare against. Consider updating student record.`,
          variant: "default",
          duration: 5000,
        });
      }

      // Determine Entry or Exit, check rate limit
      const lastLog = getLastLogForStudent(extractedId); // Use extractedId for lookup consistency
      let currentAction: EntryType = 'Entry'; // Default action is Entry

      if (lastLog) {
        const timeDiffSeconds = (now.getTime() - lastLog.timestamp.getTime()) / 1000;
        console.log(`${logPrefix} Last log for ${student.name}: Type ${lastLog.type}, Time diff: ${timeDiffSeconds.toFixed(1)}s`);

        if (timeDiffSeconds < MIN_LIBRARY_INTERVAL_SECONDS) {
          throw new Error(`Please wait ${Math.ceil(MIN_LIBRARY_INTERVAL_SECONDS - timeDiffSeconds)}s before scanning ${student.name} again.`);
        }
        // If last log exists and sufficient time passed, toggle the action
        currentAction = lastLog.type === 'Entry' ? 'Exit' : 'Entry';
      } else {
        console.log(`${logPrefix} No previous log found for ${student.name}. Defaulting to Entry.`);
      }

      // Create and Save Log
      const newLog: EntryLog = {
        id: `log_${now.getTime()}_${student.id}`, // Use canonical student ID from the found object
        studentId: student.id, // Use canonical student ID
        studentName: student.name,
        branch: student.branch,
        timestamp: now,
        type: currentAction,
      };
      console.log(`${logPrefix} Saving new log entry:`, newLog);
      saveEntryLog(newLog); // TODO: Handle potential saving errors from saveEntryLog
      scanSuccessful = true; // Mark scan as successful *after* saving log

      // Display Success Result
      setLastScanResult({ student, log: newLog, scannedImageUri: imageDataUri, imageMatch: imageMatchResult });
      toast({
        title: `${currentAction} Recorded`,
        description: `${student.name} (${student.id.toUpperCase()}) recorded as ${currentAction.toLowerCase()} at ${format(now, 'Pp')}.`,
        variant: 'default', // Success variant
      });
      console.log(`${logPrefix} Success - ${student.name} recorded as ${currentAction}.`);

    } catch (error: any) {
      console.error(`${logPrefix} Error processing scan:`, error);
      const errorMessage = error.message || 'An unknown error occurred during processing.';
      setProcessingError(errorMessage); // Set specific error message
      toast({
        title: 'Scan Processing Error',
        description: errorMessage,
        variant: 'destructive', // Error variant
      });

      // Prepare error display data (even if student lookup failed)
      let errorStudentData: Partial<Student> = { id: extractedId?.toUpperCase() || "Unknown", name: "Unknown" };
      if (student) { // Student found, but error occurred later (e.g., rate limit)
        errorStudentData = student;
      } else if (extractedId) { // ID extracted, but student not found
        errorStudentData = { id: extractedId.toUpperCase(), name: "Not Registered" };
      }

      // Display Error Result
      setLastScanResult({
        student: errorStudentData,
        log: { type: 'Error', timestamp: now }, // Specific error log type
        scannedImageUri: imageDataUri, // Show the scanned image even on error
        imageMatch: imageMatchResult, // Show comparison result if it happened before error
      });
      scanSuccessful = false; // Explicitly mark as failed

    } finally {
      console.log(`${logPrefix} Finalizing processing. Success: ${scanSuccessful}`);
      setIsProcessing(false); // Finished AI/saving phase
      // Do NOT automatically stop the scanner here. Let the user decide to scan again.
      // The BarcodeScanner's loop might stop internally on success/error depending on its implementation,
      // but we keep the UI 'active' until the user manually stops or the component unmounts.
      // setIsScannerActive(false); // REMOVED: Keep scanner active visually
      console.log(`${logPrefix} Processing finished. Scanner visual state remains active.`);
    }
  }, [isProcessing, toast]); // Dependencies: isProcessing, toast

  // --- Scanner Error Handling (from component's onScanError prop) ---
  const handleScannerComponentError = useCallback((error: Error) => {
    const logPrefix = "[AdminScan.ScannerError]";
    console.error(`${logPrefix} Scanner component reported error:`, error);

    // Determine the most likely cause for a user-friendly message
    let userMessage = `Scanner Error: ${error.message || 'Unknown error'}. Check camera permissions and connection. Try refreshing.`;
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
         userMessage = 'Camera permission denied. Please allow access in your browser settings and refresh the page.';
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
         userMessage = 'No camera found. Please ensure your camera is connected and enabled.';
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
         // This often indicates the camera is in use by another application or tab
         userMessage = 'Camera is already in use or could not be started. Close other apps/tabs using the camera and refresh.';
    } else if (error.name === 'SecurityError') {
         userMessage = 'Camera access denied due to security settings. This feature requires a secure (HTTPS) connection.';
    }

    setProcessingError(userMessage); // Set the user-friendly error message
    toast({
      title: 'Scanner Problem',
      description: userMessage,
      variant: 'destructive',
      duration: 8000, // Longer duration for hardware/permission issues
    });

    // Crucially, stop the scanning process and visual state
    setIsScannerActive(false);
    setIsProcessing(false); // Ensure processing is also marked false
    console.log(`${logPrefix} Scanner deactivated due to component error.`);

    // Optionally, trigger cleanup in the BarcodeScanner component if possible (might need ref)
    // cleanupCamera(); // Assuming cleanupCamera exists and is accessible

  }, [toast]); // Dependency: toast

  // --- Manual Start Button ---
  const handleStartScanningClick = () => {
      const logPrefix = "[AdminScan.StartClick]";
      console.log(`${logPrefix} Manual start scanning button clicked.`);
      if (isProcessing) {
          console.warn(`${logPrefix} Ignoring click, already processing.`);
          return;
      }
      setLastScanResult(null); // Clear previous result display
      setProcessingError(null); // Clear any previous errors
      setIsScannerActive(true); // Set intent to have scanner active
      console.log(`${logPrefix} Scanner set to active. BarcodeScanner component will attempt camera start.`);
      // The BarcodeScanner component's effect or startCamera function will now run
  };

  // --- Manual Stop (Optional - if BarcodeScanner doesn't handle it) ---
  // If the BarcodeScanner's onManualStop prop is used and wired correctly,
  // this explicit stop function might not be needed unless you want a separate UI button.
  const handleStopScanningClick = () => {
    const logPrefix = "[AdminScan.StopClick]";
    console.log(`${logPrefix} Manual stop scanning button clicked.`);
    setIsScannerActive(false); // Deactivate scanner UI and logic
    setIsProcessing(false); // Ensure processing stops if it was somehow stuck
    // The BarcodeScanner's cleanup should happen internally when isActive becomes false or on unmount.
    console.log(`${logPrefix} Scanner deactivated manually.`);
  };


  return (
    <div className="container mx-auto px-4 py-8 flex flex-col items-center gap-8">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">Record Entry/Exit</CardTitle>
          <CardDescription>Scan student ID barcodes to log library visits.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6" ref={scannerContainerRef}>

          {/* Scanner Component or Start Button */}
          {isScannerActive ? (
             // Render scanner component when active intent is set
             // Key added to potentially help re-initialization if needed, though internal state management should handle it
             <BarcodeScanner
               key={isScannerActive ? 'scanner-active' : 'scanner-inactive'}
               onScanSuccess={processDetectedBarcode}
               onScanError={handleScannerComponentError} // Use the specific handler
               scanPrompt="Position barcode inside frame..."
               disabled={isProcessing} // Disable scanner interactions *during* AI/DB processing, but not while just scanning
               autoStartScanLoop={false} // Require manual "Scan Now" click after camera starts
               // Add onManualStop handler if needed for the "Stop & Capture" button
               // onManualStop={(imgData) => { console.log("Manual stop captured:", imgData?.length); handleStopScanningClick(); }}
             />
          ) : (
            // Show button to start scanning session
            <Button onClick={handleStartScanningClick} className="transition-subtle" disabled={isProcessing}>
              <Camera className="mr-2 h-4 w-4" /> Start Scanning Session
            </Button>
          )}

          {/* Processing Indicator (during AI/Save phase AFTER scan success/error) */}
          {isProcessing && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground mt-4">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Processing scan data...</span>
            </div>
          )}

          {/* Last Scan Result Display */}
          {/* Show last result even if scanner is inactive (until next scan starts) */}
          {lastScanResult && !isProcessing && ( // Only show when *not* actively processing a *new* scan
             <Card className={`w-full max-w-md mt-4 border-2 ${
                lastScanResult.log.type === 'Error' ? 'border-destructive bg-destructive/10' :
                lastScanResult.log.type === 'Entry' ? 'border-green-500 bg-green-500/10' :
                'border-red-500 bg-red-500/10'
                // Highlight border if image mismatch occurred AND it wasn't a general error log type
                } ${lastScanResult.imageMatch === false && lastScanResult.log.type !== 'Error' ? '!border-yellow-500 !bg-yellow-500/10' : ''}`}>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                    {lastScanResult.log.type === 'Error' ? <><AlertCircle className="text-destructive" /> Scan Error</> : // Use AlertCircle for errors
                    lastScanResult.log.type === 'Entry' ? <><UserCheck className="text-green-600" /> Entry Recorded</> :
                    <><LogOut className="text-red-600" /> Exit Recorded</>}
                    </CardTitle>
                    <CardDescription>
                     {/* Display the specific processing error if it was an error log */}
                     {lastScanResult.log.type === 'Error' && processingError ? processingError :
                        lastScanResult.log.timestamp ? `Recorded Time: ${format(lastScanResult.log.timestamp, 'Pp')}` : "Details unavailable"}
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
                            height={150} // Adjust if needed for vertical IDs
                            className={`rounded border object-contain ${
                                lastScanResult.imageMatch === false && lastScanResult.log.type !== 'Error' ? 'border-yellow-500 border-2 shadow-md'
                                : lastScanResult.imageMatch === true && lastScanResult.log.type !== 'Error' ? 'border-green-500 border-2'
                                : 'border-muted'
                            }`}
                        />
                         {/* Image Match Status Text */}
                        {lastScanResult.imageMatch === false && lastScanResult.log.type !== 'Error' && (
                         <span className="text-xs text-yellow-600 font-semibold mt-1 animate-pulse">Image Mismatch! Verify ID.</span>
                        )}
                        {lastScanResult.imageMatch === true && lastScanResult.log.type !== 'Error' && (
                           <span className="text-xs text-green-600 font-semibold mt-1">Image Match Confirmed</span>
                        )}
                        {lastScanResult.imageMatch === undefined && lastScanResult.log.type !== 'Error' && (
                        <span className="text-xs text-muted-foreground mt-1">(Comparison N/A or Inconclusive)</span>
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

                </CardContent>
            </Card>
          )}

          {/* Display General Processing/Scanner Errors only if scanner is INACTIVE and no specific lastScanResult error is shown */}
           {processingError && !isScannerActive && !isProcessing && !lastScanResult && (
            <Alert variant="destructive" className="w-full max-w-md mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Scanner Session Error</AlertTitle>
              <AlertDescription>{processingError}</AlertDescription>
              {/* Provide a clear "Try Again" button */}
              <Button onClick={handleStartScanningClick} size="sm" variant="secondary" className="mt-2">
                  <Camera className="mr-1 h-3 w-3" /> Try Starting Scanner Again
              </Button>
            </Alert>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
