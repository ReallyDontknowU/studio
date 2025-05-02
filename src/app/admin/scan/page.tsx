
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import BarcodeScanner from '@/components/barcode-scanner';
import { useToast } from '@/hooks/use-toast';
import type { Student, EntryLog, EntryType } from '@/lib/types';
import { extractBarcodeData } from '@/ai/flows/extract-barcode-data';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, LogIn, LogOut, AlertCircle, UserCheck, UserX, ImageOff } from 'lucide-react';
import { MIN_LIBRARY_INTERVAL_SECONDS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import Image from 'next/image';

// Helper function to get student data (replace with actual API call)
const getStudentById = (id: string): Student | null => {
  try {
      const students: Student[] = JSON.parse(localStorage.getItem('students') || '[]');
      return students.find(s => s.id.toLowerCase() === id.toLowerCase()) || null;
  } catch (e) {
      console.error("Error reading students from localStorage:", e);
      return null;
  }
};

// Helper function to get last entry/exit log for a student (replace with actual API call)
const getLastLogForStudent = (studentId: string): EntryLog | null => {
  try {
      const logs: EntryLog[] = JSON.parse(localStorage.getItem('entryLogs') || '[]');
      const studentLogs = logs
          .filter(log => log.studentId.toLowerCase() === studentId.toLowerCase())
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
   }
   // TODO: Also save to Excel/SQLite
};

// Simplified image comparison (for demonstration)
const compareImagesRoughly = (imageUri1?: string, imageUri2?: string): boolean => {
    if (!imageUri1 || !imageUri2) return false;
    const segmentLength = Math.min(100, imageUri1.length, imageUri2.length);
    const segment1 = imageUri1.substring(imageUri1.length - segmentLength);
    const segment2 = imageUri2.substring(imageUri2.length - segmentLength);
    return segment1 === segment2;
}

export default function AdminScanPage() {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [lastScanResult, setLastScanResult] = useState<{
    student: Partial<Student>;
    log: Partial<EntryLog> & { type: EntryType | 'Error' };
    scannedImageUri?: string;
    imageMatch?: boolean;
  } | null>(null);
  const [isScannerActive, setIsScannerActive] = useState(false); // Controls if scanner UI is trying to be active
  const scannerRef = useRef<HTMLDivElement>(null); // Ref to manage scanner restart logic

  // --- Scan Processing Logic ---
  const processDetectedBarcode = useCallback(async (imageDataUri: string) => {
    if (isProcessing) return; // Prevent concurrent processing

    console.log("[AdminScan] processDetectedBarcode: Initiated.");
    setIsProcessing(true);
    setProcessingError(null);
    setLastScanResult(null); // Clear previous result immediately
    // Keep scanner UI "active" visually, but disable interactions via `isProcessing`

    let extractedId: string | null = null;
    let student: Student | null = null;
    let imageMatchResult: boolean | undefined = undefined;
    const now = new Date();

    try {
      console.log("[AdminScan] Calling extractBarcodeData...");
      const extractionResult = await extractBarcodeData({ barcodeImage: imageDataUri });
      console.log("[AdminScan] Extraction result:", extractionResult);

      if (!extractionResult || !extractionResult.idNumber) {
        throw new Error("Could not extract ID number from the barcode image.");
      }

      extractedId = extractionResult.idNumber.trim().toLowerCase();
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
            description: `Scanned ID image might differ from the registered image for ${student.name}. Please verify.`,
            variant: "destructive",
            duration: 5000,
          });
        }
      } else {
        console.log(`[AdminScan] No registered ID card image found for ${student.name} to compare.`);
        toast({
          title: "No Registered Image",
          description: `No ID image on file for ${student.name} to compare against.`,
          variant: "default",
          duration: 3000,
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
        id: `log_${now.getTime()}_${extractedId}`,
        studentId: student.id, // Use canonical ID
        studentName: student.name,
        branch: student.branch,
        timestamp: now,
        type: currentAction,
      };
      console.log("[AdminScan] Saving new log entry:", newLog);
      saveEntryLog(newLog);

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
        title: 'Processing Error',
        description: errorMessage,
        variant: 'destructive',
      });

      // Prepare error display data
      let errorStudentData: Partial<Student> = { id: extractedId || "Unknown", name: "Unknown" };
      if (student) { // Student found before error (e.g., rate limit)
        errorStudentData = student;
      } else if (extractedId) { // ID extracted, but student not found
        errorStudentData = { id: extractedId, name: "Not Registered" };
      }

      setLastScanResult({
        student: errorStudentData,
        log: { type: 'Error', timestamp: now },
        scannedImageUri: imageDataUri, // Include scanned image even on error
        imageMatch: imageMatchResult,
      });

    } finally {
      console.log("[AdminScan] processDetectedBarcode: Finalizing.");
      setIsProcessing(false);
      // Restart scanner automatically after a delay, ONLY if the component is still intended to be active
      setTimeout(() => {
          // Check if the component/page is still active and scanner isn't already restarting
          if (scannerRef.current && isScannerActive && !isProcessing) {
              console.log("[AdminScan] Automatically restarting scanner session...");
              startScannerSession(true); // Pass flag to indicate auto-restart
          } else {
               console.log("[AdminScan] Skipping automatic scanner restart.", { isScannerActive, isProcessing });
          }
      }, 2000); // 2-second delay
    }
  }, [isProcessing, toast, isScannerActive]); // Dependencies

  // --- Scanner Error Handling (from component) ---
  const handleScanError = useCallback((error: Error) => {
    console.error("[AdminScan] Scanner component error:", error);
    const errMsg = `Scanner Error: ${error.message}. Check camera permissions and ensure it's not in use.`;
    setProcessingError(errMsg);
    toast({
      title: 'Scanner Hardware/Permission Error',
      description: errMsg,
      variant: 'destructive',
    });
    setIsScannerActive(false); // Stop trying to use the scanner on hardware/permission error
    setIsProcessing(false);
  }, [toast]);

  // --- Manual Start/Restart ---
  const startScannerSession = (isAutoRestart = false) => {
      console.log(`[AdminScan] startScannerSession called. ${isAutoRestart ? '(Auto-restart)' : ''}`);
      // Clear previous state only if it's a manual start, not auto-restart
      if (!isAutoRestart) {
          setLastScanResult(null);
      }
      setProcessingError(null);
      setIsScannerActive(true); // Set intent to have scanner active
      // The BarcodeScanner component's useEffect/startCamera will handle the actual camera init
  };


  return (
    <div className="container mx-auto px-4 py-8 flex flex-col items-center gap-8">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">Record Entry/Exit</CardTitle>
          <CardDescription>Scan student ID barcodes to log library visits.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6" ref={scannerRef}>

          {/* Scanner or Start Button */}
          {!isScannerActive ? (
            <Button onClick={() => startScannerSession(false)} className="transition-subtle" disabled={isProcessing}>
              {isProcessing ? 'Processing...' : 'Start Scanning Session'}
            </Button>
          ) : (
             // Render scanner component when active intent is set
             <BarcodeScanner
               onScanSuccess={processDetectedBarcode}
               onScanError={handleScanError}
               scanPrompt="Scanning for barcode..."
               disabled={isProcessing} // Disable scanner interactions while processing a scan
               autoStartScanLoop={true} // Let scanner auto-loop frames
             />
          )}

          {/* Processing Indicator */}
          {isProcessing && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground mt-4">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Processing scan...</span>
            </div>
          )}

          {/* Last Scan Result Display */}
          {lastScanResult && !isProcessing && (
            <Card className={`w-full max-w-md mt-4 border-2 ${
              lastScanResult.log.type === 'Error' ? 'border-destructive bg-destructive/10' :
              lastScanResult.log.type === 'Entry' ? 'border-green-500 bg-green-500/10' :
              'border-red-500 bg-red-500/10'
              } ${lastScanResult.imageMatch === false ? '!border-yellow-500' : ''}`}> {/* Image mismatch highlight */}
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {lastScanResult.log.type === 'Error' ? <><UserX className="text-destructive" /> Scan Error</> :
                   lastScanResult.log.type === 'Entry' ? <><UserCheck className="text-green-600" /> Entry Recorded</> :
                   <><LogOut className="text-red-600" /> Exit Recorded</>}
                </CardTitle>
                <CardDescription>
                  {lastScanResult.log.timestamp ? `Scan Time: ${format(lastScanResult.log.timestamp, 'Pp')}` : processingError || "Details unavailable"}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                 {/* Scanned Image */}
                {lastScanResult.scannedImageUri && (
                  <div className="flex flex-col items-center mb-2">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Scanned Image:</p>
                    <Image
                      src={lastScanResult.scannedImageUri}
                      alt="Scanned ID"
                      width={100}
                      height={150}
                      className={`rounded border ${lastScanResult.imageMatch === false ? 'border-yellow-500 border-2' : 'border-muted'}`}
                    />
                    {lastScanResult.imageMatch === false && (
                      <span className="text-xs text-yellow-600 font-semibold mt-1">Image Mismatch!</span>
                    )}
                    {lastScanResult.imageMatch === undefined && lastScanResult.log.type !== 'Error' && (
                      <span className="text-xs text-muted-foreground mt-1">(No stored image for comparison)</span>
                    )}
                     {lastScanResult.imageMatch === undefined && lastScanResult.log.type === 'Error' && lastScanResult.student.id !== 'Unknown' && (
                         <span className="text-xs text-muted-foreground mt-1">(No stored image found)</span>
                     )}
                  </div>
                )}

                {/* Student Details */}
                <div>
                  <p><strong>Student:</strong> {lastScanResult.student?.name || 'N/A'}</p>
                  <p><strong>ID:</strong> {lastScanResult.student?.id?.toUpperCase() || 'N/A'}</p>
                  {lastScanResult.log.type !== 'Error' && (
                    <p><strong>Branch:</strong> {lastScanResult.student?.branch || 'N/A'}</p>
                  )}
                </div>

                {/* Error Message */}
                {lastScanResult.log.type === 'Error' && (
                  <p className="text-destructive font-medium pt-1">{processingError || "An unknown error occurred."}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Display General Processing/Scanner Errors */}
          {processingError && !lastScanResult && !isProcessing && (
            <Alert variant="destructive" className="w-full max-w-md mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error During Scan</AlertTitle>
              <AlertDescription>{processingError}</AlertDescription>
              {!isScannerActive && (
                  <Button onClick={() => startScannerSession(false)} size="sm" variant="outline" className="mt-2">
                    Try Again
                 </Button>
              )}
            </Alert>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
