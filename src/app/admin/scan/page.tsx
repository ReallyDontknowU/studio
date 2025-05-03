
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Student, EntryLog, EntryType } from '@/lib/types';
import { extractBarcodeData } from '@/ai/flows/extract-barcode-data';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { LogIn, LogOut, AlertCircle, UserCheck, ImageOff, Camera, Loader2, UserPlus, Send } from 'lucide-react'; // Added Send for manual entry
import { MIN_LIBRARY_INTERVAL_SECONDS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import Image from 'next/image';
import { Input } from '@/components/ui/input'; // Import Input
import { Label } from '@/components/ui/label'; // Import Label
import BarcodeScanner from '@/components/barcode-scanner';  // Ensure BarcodeScanner is still imported


// Helper function to get student data (replace with actual API call)
const getStudentById = (id: string): Student | null => {
  try {
    const students: Student[] = JSON.parse(localStorage.getItem('students') || '[]');
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
    // Consider returning a success/failure boolean or throwing an error
  }
  // TODO: Also save to Excel/SQLite
};

// Simplified image comparison (for demonstration) - Still needed for scan feature
const compareImagesRoughly = (imageUri1?: string, imageUri2?: string): boolean | undefined => {
  const logPrefix = "[compareImages]";
  if (!imageUri1 || !imageUri2) {
    console.log(`${logPrefix} One or both images missing, cannot compare.`);
    return undefined;
  }
  if (imageUri1 === imageUri2) {
    console.log(`${logPrefix} Images are identical strings.`);
    return true;
  }
  const lengthThreshold = Math.max(imageUri1.length, imageUri2.length) * 0.1;
  if (Math.abs(imageUri1.length - imageUri2.length) > lengthThreshold) {
    console.log(`${logPrefix} Significant length difference. Likely mismatch.`);
    return false;
  }
  const segmentLength = Math.min(500, Math.floor(imageUri1.length / 2), Math.floor(imageUri2.length / 2));
  if (segmentLength < 50) {
    console.log(`${logPrefix} Images too small for reliable segment comparison.`);
    return undefined;
  }
  const segment1 = imageUri1.substring(imageUri1.length - segmentLength);
  const segment2 = imageUri2.substring(imageUri2.length - segmentLength);
  const match = segment1 === segment2;
  console.log(`${logPrefix} Segment comparison result: ${match}`);
  return match;
}

export default function AdminScanPage() {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false); // Generic processing state
  const [scanSessionError, setScanSessionError] = useState<string | null>(null);
   const [lastScanResult, setLastScanResult] = useState<{
        student: Partial<Student>;
        log: Partial<EntryLog> & { type: EntryType | 'Error'; message?: string }; // Explicitly add message for error type
        scannedImageUri?: string; // Keep for scan results
        imageMatch?: boolean; // Keep for scan results
        source: 'scan' | 'manual'; // Track source of the result
    } | null>(null);


  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null); // For storing single captured image
  const [isScannerActive, setIsScannerActive] = useState(false); // Track if scanner component should be visible/active
  const [isExtracting, setIsExtracting] = useState(false); // Track AI barcode extraction
  const [manualStudentId, setManualStudentId] = useState(''); // State for manual ID input

  const sharedProcessLogic = useCallback(async (studentId: string, source: 'scan' | 'manual', scannedImageUri?: string) => {
        const logPrefix = `[sharedProcessLogic-${source}]`;
        console.log(`${logPrefix} Processing ID: ${studentId}`);
        setIsProcessing(true);
        setScanSessionError(null);
        setLastScanResult(null); // Clear previous result

        let student: Student | null = null;
        let imageMatchResult: boolean | undefined = undefined;
        const now = new Date();
        let processSuccessful = false;
        let resultState: typeof lastScanResult = null;

        try {
            student = getStudentById(studentId);
            console.log(`${logPrefix} Student lookup:`, student ? student.name : 'Not Found');
            if (!student) {
                throw new Error(`Student with ID ${studentId.toUpperCase()} not found. Please register first.`);
            }

            // Image comparison only relevant for 'scan' source
            if (source === 'scan' && scannedImageUri) {
                if (student.idCardImageUri) {
                    imageMatchResult = compareImagesRoughly(student.idCardImageUri, scannedImageUri);
                    console.log(`${logPrefix} Image comparison for ${student.name}: ${imageMatchResult}`);
                    if (imageMatchResult === false) {
                        toast({
                            title: "Image Mismatch Warning",
                            description: `Scanned ID image may differ from the registered image for ${student.name}. Please verify student identity.`,
                            variant: "destructive", duration: 7000,
                        });
                    } else if (imageMatchResult === true) {
                        console.log(`${logPrefix} Image match confirmed for ${student.name}.`);
                    } else {
                        console.log(`${logPrefix} Image comparison inconclusive for ${student.name}.`);
                        toast({
                            title: "Info: Image Comparison",
                            description: `Could not reliably compare scanned image with stored image for ${student.name}.`,
                            variant: "default", duration: 4000,
                        });
                    }
                } else {
                    console.log(`${logPrefix} No registered ID card image found for ${student.name}.`);
                    imageMatchResult = undefined;
                    toast({
                        title: "Info: No Registered Image",
                        description: `No ID image on file for ${student.name} to compare against. Consider updating student record.`,
                        variant: "default", duration: 5000,
                    });
                }
            }

            // Determine Entry/Exit and check rate limit
            const lastLog = getLastLogForStudent(studentId);
            let currentAction: EntryType = 'Entry';

            if (lastLog) {
                const timeDiffSeconds = (now.getTime() - lastLog.timestamp.getTime()) / 1000;
                console.log(`${logPrefix} Last log for ${student.name}: Type ${lastLog.type}, Time diff: ${timeDiffSeconds.toFixed(1)}s`);

                if (timeDiffSeconds < MIN_LIBRARY_INTERVAL_SECONDS) {
                    throw new Error(`Please wait ${Math.ceil(MIN_LIBRARY_INTERVAL_SECONDS - timeDiffSeconds)}s before processing ${student.name} again.`);
                }
                currentAction = lastLog.type === 'Entry' ? 'Exit' : 'Entry';
            } else {
                console.log(`${logPrefix} No previous log found for ${student.name}. Defaulting to Entry.`);
            }

            // Create and Save Log
            const newLog: EntryLog = {
                id: `log_${now.getTime()}_${student.id}`,
                studentId: student.id,
                studentName: student.name,
                branch: student.branch,
                timestamp: now,
                type: currentAction,
            };
            console.log(`${logPrefix} Saving new log:`, newLog);
            saveEntryLog(newLog);
            processSuccessful = true;

            // Display Success Result
            resultState = {
                student,
                log: newLog,
                scannedImageUri: source === 'scan' ? scannedImageUri : undefined, // Only include image for scan
                imageMatch: source === 'scan' ? imageMatchResult : undefined, // Only include match for scan
                source
            };
            toast({
                title: `${currentAction} Recorded`,
                description: `${student.name} (${student.id.toUpperCase()}) recorded as ${currentAction.toLowerCase()} at ${format(now, 'Pp')}.`,
                variant: 'default',
            });
            console.log(`${logPrefix} Success - ${student.name} recorded as ${currentAction}.`);

        } catch (error: any) {
            console.error(`${logPrefix} Error processing:`, error);
            const errorMessage = error.message || 'An unknown error occurred during processing.';
            toast({
                title: 'Processing Error',
                description: errorMessage,
                variant: 'destructive',
            });

            let errorStudentData: Partial<Student> = { id: studentId.toUpperCase() || "Unknown", name: "Unknown" };
            if (student) {
                errorStudentData = student;
            } else if (studentId) {
                errorStudentData = { id: studentId.toUpperCase(), name: "Not Registered" };
            }

            resultState = {
                student: errorStudentData,
                log: { type: 'Error', timestamp: now, message: errorMessage },
                scannedImageUri: source === 'scan' ? scannedImageUri : undefined,
                imageMatch: source === 'scan' ? imageMatchResult : undefined,
                source
            };
            processSuccessful = false;

        } finally {
            console.log(`${logPrefix} Finalizing processing. Success: ${processSuccessful}`);
            setLastScanResult(resultState); // Set the final result (success or error)
            setIsProcessing(false);
            setIsExtracting(false); // Ensure extraction state is reset
            if (source === 'manual') {
                setManualStudentId(''); // Clear manual input on finish
            }
            // Keep scanner active only if using auto-capture loop, otherwise deactivate:
            // setIsScannerActive(false); // Deactivate after processing manual capture.
        }
  }, [toast]);


  // Handles image captured from scanner
  const processCapturedImage = useCallback(async (imageDataUri: string) => {
    const logPrefix = "[processCapturedImage]";
    if (isProcessing) {
      console.log(`${logPrefix} Already processing, skipping.`);
      return;
    }

    console.log(`${logPrefix} Initiated with image data (length: ${imageDataUri.length})`);
    setIsProcessing(true); // Use generic processing state
    setIsExtracting(true); // Start extraction indicator
    setScanSessionError(null);
    setLastScanResult(null); // Clear previous result

    try {
      console.log(`${logPrefix} Calling extractBarcodeData...`);
      const extractionResult = await extractBarcodeData({ barcodeImage: imageDataUri });
      console.log(`${logPrefix} Extraction result:`, extractionResult);
      setIsExtracting(false); // End extraction indicator

      if (!extractionResult || !extractionResult.idNumber || extractionResult.idNumber.trim() === "") {
        throw new Error("Could not extract a valid ID number from the barcode image.");
      }

      const extractedId = extractionResult.idNumber.trim().toLowerCase();
      await sharedProcessLogic(extractedId, 'scan', imageDataUri); // Use shared logic

    } catch (error: any) {
      // Handle extraction-specific errors or re-throw for sharedProcessLogic to handle
      console.error(`${logPrefix} Error during extraction:`, error);
      const errorMessage = error.message || 'An unknown error occurred during barcode extraction.';
      toast({
        title: 'Extraction Error',
        description: errorMessage,
        variant: 'destructive',
      });

      // Set error state for display
      setLastScanResult({
          student: { id: "Unknown", name: "Extraction Failed" },
          log: { type: 'Error', timestamp: new Date(), message: errorMessage },
          scannedImageUri: imageDataUri,
          source: 'scan'
      });
      setIsProcessing(false);
      setIsExtracting(false);
    }
  }, [toast, isProcessing, sharedProcessLogic]); // Add dependencies


  // Scanner Success Handler (Called by BarcodeScanner on successful capture)
  const handleScanSuccess = useCallback((imageDataUri: string) => {
    console.log("[handleScanSuccess] Scan Success - received image data.");
    setCapturedImageUri(imageDataUri); // Store the captured image.
    setIsScannerActive(false); // Deactivate scanner view after capture
    processCapturedImage(imageDataUri); // Process the captured image.
  }, [processCapturedImage]);

  // Scanner Error Handler
  const handleScannerError = useCallback((error: Error) => {
    console.error("[handleScannerError] Scanner component reported error:", error);
    const userMessage = error.message || 'An unknown scanner error occurred.';
    setScanSessionError(userMessage);
    toast({
      title: 'Scanner Problem',
      description: userMessage,
      variant: 'destructive',
      duration: 8000,
    });
    setIsScannerActive(false); // Deactivate scanner on error
    setIsProcessing(false); // Reset processing state
    setIsExtracting(false); // Reset extraction state
  }, [toast]);

  // Handler for manual stop button in BarcodeScanner
   const handleManualStop = useCallback((lastFrameUri: string | null) => {
        const logPrefix = "[handleManualStop]";
        console.log(`${logPrefix} User stopped scanning.`);
        setIsScannerActive(false); // Hide the scanner component

        if (lastFrameUri) {
            console.log(`${logPrefix} Processing last captured frame.`);
            setCapturedImageUri(lastFrameUri); // Show the last frame
            processCapturedImage(lastFrameUri); // Process it
        } else {
            console.log(`${logPrefix} No frame captured before stopping.`);
            setCapturedImageUri(null); // Ensure no image is shown
            setScanSessionError("Scanning stopped without capturing an image.");
            // Optionally show a toast message
             toast({
                 title: "Scanning Stopped",
                 description: "No image was captured.",
                 variant: "default"
             });
             setIsProcessing(false); // Ensure processing state is reset if stopped early
        }
    }, [processCapturedImage, toast]);

  // Manual Capture Start
  const handleManualStartClick = useCallback(() => {
    if (!isScannerActive && !isProcessing) {
       console.log("[handleManualStartClick] Activating scanner...");
       setScanSessionError(null); // Clear previous errors
       setLastScanResult(null); // Clear previous results
       setCapturedImageUri(null); // Clear previous image preview
       setIsScannerActive(true); // Activate the scanner
    }
  }, [isScannerActive, isProcessing]);


  // Handler for manual ID submission
  const handleManualSubmit = useCallback((event: React.FormEvent) => {
      event.preventDefault();
      const trimmedId = manualStudentId.trim().toLowerCase();
      if (!trimmedId) {
          toast({ title: "Input Error", description: "Please enter a Student ID.", variant: "destructive" });
          return;
      }
      if (isProcessing) {
          console.log("[handleManualSubmit] Already processing, skipping.");
          return;
      }
      sharedProcessLogic(trimmedId, 'manual');
  }, [manualStudentId, isProcessing, sharedProcessLogic, toast]);


  return (
    <div className="container mx-auto px-4 py-8 flex flex-col items-center gap-8">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">Record Entry/Exit</CardTitle>
          <CardDescription>Scan ID barcode or enter ID manually.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">

           {/* Manual Entry Section */}
           <form onSubmit={handleManualSubmit} className="w-full max-w-xs flex items-end gap-2">
             <div className="flex-grow">
               <Label htmlFor="manual-student-id" className="sr-only">Student ID</Label>
               <Input
                 id="manual-student-id"
                 type="text"
                 placeholder="Enter Student ID"
                 value={manualStudentId}
                 onChange={(e) => setManualStudentId(e.target.value)}
                 disabled={isProcessing || isScannerActive} // Disable if scanning or processing
                 className="text-base" // Ensure text is readable
               />
             </div>
             <Button type="submit" disabled={isProcessing || isScannerActive || !manualStudentId.trim()} className="transition-subtle">
               {isProcessing && lastScanResult?.source === 'manual' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
               <span className="ml-2">Submit</span>
             </Button>
           </form>

           <div className="text-center text-muted-foreground my-2">OR</div>

          {/* Scanner Area or Start Button */}
          {isScannerActive ? (
            // Display the BarcodeScanner component when active
             <div className="w-full">
               <BarcodeScanner
                 onScanSuccess={handleScanSuccess}
                 onScanError={handleScannerError}
                 onManualStop={handleManualStop} // Pass handler for stop button
                 scanPrompt="Position barcode inside frame..."
                 disabled={isProcessing || isExtracting} // Disable controls while processing/extracting
                 setCapturedImageUri={setCapturedImageUri} // Pass the state setter function
               />
             </div>
          ) : (
            // Initial state or after scanning stopped, show start scan button
             <div className="flex flex-col items-center gap-4">
                <Button onClick={handleManualStartClick} className="transition-subtle" disabled={isProcessing}>
                   <Camera className="mr-2 h-4 w-4" /> Start Scan
                </Button>
             </div>
          )}


           {/* Show Preview of Captured Image */}
           {capturedImageUri && !isScannerActive && !isProcessing && lastScanResult?.source === 'scan' && (
               <div className="mt-4 p-2 border rounded-md bg-muted w-full max-w-xs">
                   <p className="text-sm font-medium text-center mb-2">Ready to Process:</p>
                   <Image
                       src={capturedImageUri}
                       alt="Captured ID"
                       width={150}
                       height={225} // Vertical aspect ratio
                       className="rounded-md mx-auto object-contain"
                   />
               </div>
           )}


           {/* Show Loading Indicator */}
           {(isProcessing || isExtracting) && (
             <div className="flex items-center justify-center gap-2 text-muted-foreground mt-4">
               <Loader2 className="h-5 w-5 animate-spin" />
               <span>{isExtracting ? 'Extracting ID...' : 'Processing...'}</span>
             </div>
           )}


          {/* Last Scan/Manual Result Display (After successful or unsuccessful processing) */}
          {lastScanResult && !isProcessing && !isExtracting && ( // Only show when *not* processing/extracting
            <Card className={`w-full max-w-md mt-4 border-2 ${
              lastScanResult.log.type === 'Error' ? 'border-destructive bg-destructive/10' :
              lastScanResult.log.type === 'Entry' ? 'border-green-500 bg-green-500/10' :
              'border-red-500 bg-red-500/10'
            } ${lastScanResult.imageMatch === false && lastScanResult.log.type !== 'Error' ? '!border-yellow-500 !bg-yellow-500/10' : ''}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {lastScanResult.log.type === 'Error' ? <><AlertCircle className="text-destructive" /> Processing Error</> :
                  lastScanResult.log.type === 'Entry' ? <><UserCheck className="text-green-600" /> Entry Recorded</> :
                  <><LogOut className="text-red-600" /> Exit Recorded</>}
                </CardTitle>
                <CardDescription>
                 {/* Display the specific processing error if it was an error log */}
                 {lastScanResult.log.type === 'Error' && lastScanResult.log.message ? lastScanResult.log.message :
                    lastScanResult.log.timestamp ? `Recorded Time: ${format(lastScanResult.log.timestamp, 'Pp')}` : "Details unavailable"}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm space-y-3">
                {/* Scanned Image (Only show if source was 'scan') */}
                {lastScanResult.source === 'scan' && lastScanResult.scannedImageUri && (
                  <div className="flex flex-col items-center mb-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Scanned Image:</p>
                    <Image
                      src={lastScanResult.scannedImageUri}
                      alt="Scanned ID"
                      width={100}
                      height={150}
                      className={`rounded border object-contain ${
                        lastScanResult.imageMatch === false && lastScanResult.log.type !== 'Error' ? 'border-yellow-500 border-2 shadow-md'
                        : lastScanResult.imageMatch === true && lastScanResult.log.type !== 'Error' ? 'border-green-500 border-2'
                        : 'border-muted'
                      }`}
                    />
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
                  {lastScanResult.log.type !== 'Error' && lastScanResult.student?.branch && (
                    <p><strong>Branch:</strong> {lastScanResult.student.branch}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Display General Scanner Session Errors */}
          {scanSessionError && !isProcessing && !isExtracting && ( // Only show if not currently processing
            <Alert variant="destructive" className="w-full max-w-md mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Scanner Session Error</AlertTitle>
              <AlertDescription>{scanSessionError}</AlertDescription>
               {/* Optionally add a retry button */}
               {!isScannerActive && ( // Show retry only if scanner isn't already active
                   <Button onClick={handleManualStartClick} variant="secondary" size="sm" className="mt-2 text-xs">
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
