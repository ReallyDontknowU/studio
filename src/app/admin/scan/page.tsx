

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Student, EntryLog, EntryType } from '@/lib/types';
import { extractBarcodeData } from '@/ai/flows/extract-barcode-data';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { LogIn, LogOut, AlertCircle, UserCheck, ImageOff, Camera, Loader2, UserPlus, Send, X } from 'lucide-react'; // Added Send for manual entry, X for clearing errors
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
  // Check lengths - significant difference implies mismatch
  const lengthThreshold = Math.max(imageUri1.length, imageUri2.length) * 0.05; // 5% tolerance
  if (Math.abs(imageUri1.length - imageUri2.length) > lengthThreshold) {
    console.log(`${logPrefix} Significant length difference (${imageUri1.length} vs ${imageUri2.length}). Likely mismatch.`);
    return false;
  }
  // Compare end segments for rough similarity
  const segmentLength = Math.min(500, Math.floor(imageUri1.length * 0.1), Math.floor(imageUri2.length * 0.1)); // 10% or max 500 chars
  if (segmentLength < 50) {
    console.log(`${logPrefix} Images too small for reliable segment comparison.`);
    return undefined; // Too small to be sure
  }
  const segment1 = imageUri1.substring(imageUri1.length - segmentLength);
  const segment2 = imageUri2.substring(imageUri2.length - segmentLength);
  const match = segment1 === segment2;
  console.log(`${logPrefix} Segment comparison result (last ${segmentLength} chars): ${match}`);
  return match;
}

interface LastScanResultType {
    student: Partial<Student>;
    log: Partial<EntryLog> & { type: EntryType | 'Error'; message?: string }; // Explicitly add message for error type
    scannedImageUri?: string; // Keep for scan results
    imageMatch?: boolean; // Keep for scan results
    source: 'scan' | 'manual'; // Track source of the result
}

export default function AdminScanPage() {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false); // Generic processing state for both scan and manual
  const [scanSessionError, setScanSessionError] = useState<string | null>(null);
  const [lastScanResult, setLastScanResult] = useState<LastScanResultType | null>(null);


  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null); // For storing single captured image from scanner
  const [isScannerActive, setIsScannerActive] = useState(false); // Track if scanner component should be visible/active
  const [isExtracting, setIsExtracting] = useState(false); // Track AI barcode extraction (part of scan processing)
  const [manualStudentId, setManualStudentId] = useState(''); // State for manual ID input

  const sharedProcessLogic = useCallback(async (studentId: string, source: 'scan' | 'manual', scannedImageUri?: string) => {
        const logPrefix = `[sharedProcessLogic-${source}]`;
        console.log(`${logPrefix} Processing ID: ${studentId}`);
        setIsProcessing(true); // Set generic processing state
        setScanSessionError(null); // Clear previous session errors
        setLastScanResult(null); // Clear previous visual result
        // Don't clear capturedImageUri here, let it display until next scan starts

        let student: Student | null = null;
        let imageMatchResult: boolean | undefined = undefined;
        const now = new Date();
        let processSuccessful = false;
        let resultState: LastScanResultType | null = null;

        try {
            student = getStudentById(studentId);
            console.log(`${logPrefix} Student lookup:`, student ? student.name : 'Not Found');
            if (!student) {
                throw new Error(`Student with ID ${studentId.toUpperCase()} not found. Please register first.`);
            }

            // Image comparison only relevant for 'scan' source with both images available
            if (source === 'scan' && scannedImageUri && student.idCardImageUri) {
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
                     toast({
                        title: "Image Match Confirmed",
                        description: `Scanned image matches registered image for ${student.name}.`,
                        variant: "default", duration: 3000,
                    });
                } else { // undefined case
                    console.log(`${logPrefix} Image comparison inconclusive for ${student.name}.`);
                    toast({
                        title: "Info: Image Comparison",
                        description: `Could not reliably compare scanned image with stored image for ${student.name}.`,
                        variant: "default", duration: 4000,
                    });
                }
            } else if (source === 'scan' && !student.idCardImageUri) {
                // Scan occurred but no registered image to compare against
                console.log(`${logPrefix} No registered ID card image found for ${student.name}.`);
                imageMatchResult = undefined;
                toast({
                    title: "Info: No Registered Image",
                    description: `No ID image on file for ${student.name} to compare against. Consider updating student record.`,
                    variant: "default", duration: 5000,
                });
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
                // Include image/match result only if source was scan
                scannedImageUri: source === 'scan' ? scannedImageUri : undefined,
                imageMatch: source === 'scan' ? imageMatchResult : undefined,
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

            // Prepare data for error result display
            let errorStudentData: Partial<Student> = { id: studentId.toUpperCase() || "Unknown ID", name: "Unknown Name" };
            if (student) { // If student was found before error (e.g., rate limit)
                errorStudentData = student;
            } else if (studentId) { // If student ID was provided but not found
                errorStudentData = { id: studentId.toUpperCase(), name: "Not Registered" };
            }

            resultState = {
                student: errorStudentData,
                log: { type: 'Error', timestamp: now, message: errorMessage },
                // Include image/match result only if source was scan, even on error
                scannedImageUri: source === 'scan' ? scannedImageUri : undefined,
                imageMatch: source === 'scan' ? imageMatchResult : undefined,
                source
            };
            processSuccessful = false;

        } finally {
            console.log(`${logPrefix} Finalizing processing. Success: ${processSuccessful}`);
            setLastScanResult(resultState); // Set the final result state (success or error) for display
            setIsProcessing(false); // Turn off generic processing state
            setIsExtracting(false); // Ensure extraction state is also reset
            if (source === 'manual') {
                setManualStudentId(''); // Clear manual input field after processing attempt
            }
             // Deactivate scanner ONLY if processing was successful OR if it was a manual entry
            if (processSuccessful || source === 'manual') {
                 setIsScannerActive(false);
            } else {
                 // Keep scanner active after a failed SCAN attempt to allow retry?
                 // Or maybe stop it? Let's stop it for now to match manual stop behavior.
                 setIsScannerActive(false);
                 // If scan failed, keep capturedImageUri for display with error?
                 // setCapturedImageUri(null); // Clear image on scan failure? Or keep it? Let's keep it.
            }
        }
  }, [toast]);


  // Handles image captured from scanner - INITIATES THE SCAN PROCESSING
  const processCapturedImage = useCallback(async (imageDataUri: string) => {
    const logPrefix = "[processCapturedImage]";
    if (isProcessing) { // Check generic processing state
      console.log(`${logPrefix} Already processing, skipping.`);
      return;
    }

    console.log(`${logPrefix} Initiated with image data (length: ${imageDataUri.length})`);
    setIsProcessing(true); // Set generic processing state
    setIsExtracting(true); // Start extraction indicator
    setScanSessionError(null); // Clear previous errors
    setLastScanResult(null); // Clear previous display result
    // Set captured image for display *during* processing
    setCapturedImageUri(imageDataUri);

    try {
      console.log(`${logPrefix} Calling extractBarcodeData...`);
      const extractionResult = await extractBarcodeData({ barcodeImage: imageDataUri });
      console.log(`${logPrefix} Extraction result:`, extractionResult);
      setIsExtracting(false); // End extraction indicator (still processing overall)

      if (!extractionResult || !extractionResult.idNumber || extractionResult.idNumber.trim() === "") {
        throw new Error("Could not extract a valid ID number from the barcode image.");
      }

      const extractedId = extractionResult.idNumber.trim().toLowerCase();
      // Call shared logic AFTER successful extraction
      await sharedProcessLogic(extractedId, 'scan', imageDataUri);

    } catch (error: any) {
      // Handle extraction-specific errors
      console.error(`${logPrefix} Error during extraction:`, error);
      const errorMessage = error.message || 'An unknown error occurred during barcode extraction.';
      toast({
        title: 'Extraction Error',
        description: errorMessage,
        variant: 'destructive',
      });

      // Set error state for display using lastScanResult
      setLastScanResult({
          student: { id: "Unknown", name: "Extraction Failed" },
          log: { type: 'Error', timestamp: new Date(), message: errorMessage },
          scannedImageUri: imageDataUri, // Keep image for context
          source: 'scan'
      });
      setIsProcessing(false); // Turn off generic processing state
      setIsExtracting(false); // Ensure extraction state is off
      setIsScannerActive(false); // Stop scanner on extraction error
    }
    // No finally here, sharedProcessLogic handles final state updates
  }, [toast, isProcessing, sharedProcessLogic]); // Add dependencies


  // Scanner Success Handler (Called by BarcodeScanner on successful capture - NOT USED DIRECTLY FOR PROCESSING ANYMORE)
  // Kept for potential future use if auto-capture is re-enabled
   const handleScanSuccess = useCallback((imageDataUri: string) => {
       // This is now less relevant as we rely on manual stop
       console.log("[handleScanSuccess] - DEPRECATED PATH? Manual stop should handle capture.");
       // If this path *is* needed, it should likely call processCapturedImage
       // setCapturedImageUri(imageDataUri);
       // setIsScannerActive(false);
       // processCapturedImage(imageDataUri);
   }, []); // Empty dependencies for now

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

  // Handler for manual stop button in BarcodeScanner - THIS IS THE MAIN PATH FOR SCANNING NOW
   const handleManualStop = useCallback((lastFrameUri: string | null) => {
        const logPrefix = "[handleManualStop]";
        console.log(`${logPrefix} User stopped scanning.`);
        setIsScannerActive(false); // Hide the scanner component

        if (lastFrameUri) {
            console.log(`${logPrefix} Processing last captured frame.`);
            // Don't set capturedImageUri here directly, let processCapturedImage handle it
            processCapturedImage(lastFrameUri); // Process the captured frame
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
             setIsExtracting(false);
        }
    }, [processCapturedImage, toast]); // Depend on processCapturedImage

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
      // Call shared logic for manual entry
      sharedProcessLogic(trimmedId, 'manual');
  }, [manualStudentId, isProcessing, sharedProcessLogic, toast]);

   // Function to clear errors and results
   const clearStatus = () => {
       setScanSessionError(null);
       setLastScanResult(null);
       setCapturedImageUri(null); // Also clear the preview image
   }


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
                 disabled={isProcessing || isScannerActive} // Disable if processing or scanner is active
                 className="text-base" // Ensure text is readable
               />
             </div>
             <Button type="submit" disabled={isProcessing || isScannerActive || !manualStudentId.trim()} className="transition-subtle">
               {/* Show loader specifically for manual processing */}
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
                 // onScanSuccess={handleScanSuccess} // Not used for processing trigger anymore
                 onScanError={handleScannerError}
                 onManualStop={handleManualStop} // Pass handler for stop button (this triggers processing)
                 scanPrompt="Position ID card inside frame..."
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
                {/* Display previously captured image if not scanning/processing */}
                 {capturedImageUri && !isProcessing && !isScannerActive && (
                     <div className="mt-4 p-2 border rounded-md bg-muted w-full max-w-xs">
                         <p className="text-sm font-medium text-center mb-2">Last Scanned Image:</p>
                         <Image
                             src={capturedImageUri}
                             alt="Last Scanned ID"
                             width={150}
                             height={225} // Vertical aspect ratio
                             className="rounded-md mx-auto object-contain"
                         />
                     </div>
                 )}
             </div>
          )}


           {/* Show Loading Indicator during scan processing (extraction + shared logic) */}
           {(isProcessing && !lastScanResult) && ( // Show loader only while processing *before* result is set
             <div className="flex items-center justify-center gap-2 text-muted-foreground mt-4">
               <Loader2 className="h-5 w-5 animate-spin" />
               <span>{isExtracting ? 'Extracting ID...' : 'Processing...'}</span>
             </div>
           )}


          {/* Last Scan/Manual Result Display (After successful or unsuccessful processing) */}
          {lastScanResult && !isProcessing && ( // Show result card when processing is finished
            <Card className={`w-full max-w-md mt-4 border-2 ${
              lastScanResult.log.type === 'Error' ? 'border-destructive bg-destructive/10' :
              lastScanResult.log.type === 'Entry' ? 'border-green-500 bg-green-500/10' :
              'border-red-500 bg-red-500/10'
            } ${lastScanResult.imageMatch === false && lastScanResult.log.type !== 'Error' ? '!border-yellow-500 !bg-yellow-500/10' : ''}`}>
              <CardHeader>
                 <div className="flex justify-between items-start">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      {lastScanResult.log.type === 'Error' ? <><AlertCircle className="text-destructive" /> Processing Error</> :
                      lastScanResult.log.type === 'Entry' ? <><LogIn className="text-green-600" /> Entry Recorded</> : // Changed icon
                      <><LogOut className="text-red-600" /> Exit Recorded</>}
                    </CardTitle>
                    {/* Add a close button for the result card */}
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:bg-muted/50" onClick={clearStatus}>
                        <X className="h-4 w-4" />
                        <span className="sr-only">Clear Status</span>
                    </Button>
                </div>
                <CardDescription>
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
                    {/* Image Match Status */}
                    {lastScanResult.imageMatch === false && lastScanResult.log.type !== 'Error' && (
                      <span className="text-xs text-yellow-600 font-semibold mt-1 animate-pulse">Image Mismatch! Verify ID.</span>
                    )}
                    {lastScanResult.imageMatch === true && lastScanResult.log.type !== 'Error' && (
                      <span className="text-xs text-green-600 font-semibold mt-1">Image Match Confirmed</span>
                    )}
                    {lastScanResult.imageMatch === undefined && lastScanResult.log.type !== 'Error' && (
                      <span className="text-xs text-muted-foreground mt-1">(No registered image or comparison inconclusive)</span>
                    )}
                  </div>
                )}

                {/* Student Details */}
                <div>
                  <p><strong>Student:</strong> {lastScanResult.student?.name || 'N/A'}</p>
                  <p><strong>ID:</strong> {lastScanResult.student?.id?.toUpperCase() || 'N/A'}</p>
                  {/* Show branch only if processing was successful (not an Error log) */}
                  {lastScanResult.log.type !== 'Error' && lastScanResult.student?.branch && (
                    <p><strong>Branch:</strong> {lastScanResult.student.branch}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Display General Scanner Session Errors (when not processing and no result card is shown) */}
          {scanSessionError && !isProcessing && !lastScanResult && (
            <Alert variant="destructive" className="w-full max-w-md mt-4">
               <div className="flex justify-between items-start">
                   <div>
                      <AlertCircle className="h-4 w-4 inline-block mr-2 -translate-y-0.5" /> {/* Adjusted icon position */}
                      <AlertTitle className="inline-block">Scanner Session Error</AlertTitle>
                      <AlertDescription>{scanSessionError}</AlertDescription>
                  </div>
                   {/* Add a close button for the error alert */}
                   <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={clearStatus}>
                       <X className="h-4 w-4" />
                       <span className="sr-only">Clear Error</span>
                   </Button>
               </div>

               {/* Optionally add a retry button for scanner errors */}
               {!isScannerActive && ( // Show retry only if scanner isn't already active
                   <Button onClick={handleManualStartClick} variant="secondary" size="sm" className="mt-2 text-xs">
                       <RefreshCw className="mr-1 h-3 w-3"/> Try Scan Again
                   </Button>
                )}
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

