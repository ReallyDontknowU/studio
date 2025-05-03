
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Student, EntryLog, EntryType } from '@/lib/types';
import { extractBarcodeData } from '@/ai/flows/extract-barcode-data';
import { detectIdCard } from '@/ai/flows/detect-id-card-flow'; // Import the new detection flow
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { LogIn, LogOut, AlertCircle, UserCheck, ImageOff, Camera, Loader2, UserPlus, Send, X, RefreshCw, ScanLine, Eye } from 'lucide-react';
import { MIN_LIBRARY_INTERVAL_SECONDS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import BarcodeScanner from '@/components/barcode-scanner';


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
  }
};

// Simplified image comparison (for demonstration)
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
  const lengthThreshold = Math.max(imageUri1.length, imageUri2.length) * 0.05; // 5% tolerance
  if (Math.abs(imageUri1.length - imageUri2.length) > lengthThreshold) {
    console.log(`${logPrefix} Significant length difference (${imageUri1.length} vs ${imageUri2.length}). Likely mismatch.`);
    return false;
  }
  const segmentLength = Math.min(500, Math.floor(imageUri1.length * 0.1), Math.floor(imageUri2.length * 0.1));
  if (segmentLength < 50) {
    console.log(`${logPrefix} Images too small for reliable segment comparison.`);
    return undefined;
  }
  const segment1 = imageUri1.substring(imageUri1.length - segmentLength);
  const segment2 = imageUri2.substring(imageUri2.length - segmentLength);
  const match = segment1 === segment2;
  console.log(`${logPrefix} Segment comparison result (last ${segmentLength} chars): ${match}`);
  return match;
}

interface LastScanResultType {
    student: Partial<Student>;
    log: Partial<EntryLog> & { type: EntryType | 'Error'; message?: string };
    scannedImageUri?: string;
    imageMatch?: boolean;
    source: 'scan' | 'manual';
}

// --- Audio Playback ---
let entryAudio: HTMLAudioElement | null = null;
let exitAudio: HTMLAudioElement | null = null;
let errorAudio: HTMLAudioElement | null = null;
let processingAudio: HTMLAudioElement | null = null; // Added for processing sound

if (typeof window !== 'undefined') {
    entryAudio = new Audio('/sounds/entry_success.mp3');
    exitAudio = new Audio('/sounds/exit_success.mp3');
    errorAudio = new Audio('/sounds/error.mp3');
    processingAudio = new Audio('/sounds/processing_tone.mp3'); // Updated filename

    entryAudio.preload = 'auto';
    exitAudio.preload = 'auto';
    errorAudio.preload = 'auto';
    processingAudio.preload = 'auto'; // Preload processing sound

    entryAudio.onerror = () => console.error("Failed to load entry audio.");
    exitAudio.onerror = () => console.error("Failed to load exit audio.");
    errorAudio.onerror = () => console.error("Failed to load error audio.");
    processingAudio.onerror = () => console.error("Failed to load processing audio."); // Error handler
}

const playSound = (type: 'entry' | 'exit' | 'error' | 'processing') => { // Added 'processing' type
    let audioToPlay: HTMLAudioElement | null = null;

    switch (type) {
        case 'entry': audioToPlay = entryAudio; break;
        case 'exit': audioToPlay = exitAudio; break;
        case 'error': audioToPlay = errorAudio; break;
        case 'processing': audioToPlay = processingAudio; break; // Handle processing sound
    }

    if (audioToPlay) {
        audioToPlay.currentTime = 0;
        audioToPlay.play().catch(error => {
            console.error(`Error playing ${type} sound:`, error);
        });
    } else {
        console.warn(`Audio element for ${type} not loaded.`);
    }
};


export default function AdminScanPage() {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false); // Unified processing state (blocks new scans/manual submits)
  const [isDetecting, setIsDetecting] = useState(false); // State for ID card detection phase
  const [isExtracting, setIsExtracting] = useState(false); // Specific state for AI extraction indicator
  const [scanSessionError, setScanSessionError] = useState<string | null>(null);
  const [lastScanResult, setLastScanResult] = useState<LastScanResultType | null>(null);
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null); // Only for display after processing
  const [manualStudentId, setManualStudentId] = useState(''); // State for manual ID input
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref for processing result display timeout

  // Shared logic to process a student ID (from scan or manual)
  const sharedProcessLogic = useCallback(async (studentId: string, source: 'scan' | 'manual', scannedImageUri?: string) => {
        const logPrefix = `[sharedProcessLogic-${source}]`;
        console.log(`${logPrefix} Processing ID: ${studentId}`);
        // setIsProcessing(true); // Moved: set by caller (processCapturedImage/handleManualSubmit)
        // setScanSessionError(null); // Moved: Cleared by caller
        // setLastScanResult(null); // Moved: Cleared by caller
        setCapturedImageUri(source === 'scan' ? scannedImageUri : null); // Show scanned image for result

        // Clear any existing result display timeout
        if (processingTimeoutRef.current) {
           clearTimeout(processingTimeoutRef.current);
           processingTimeoutRef.current = null;
        }

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

            // Image comparison for scan source
            if (source === 'scan' && scannedImageUri && student.idCardImageUri) {
                imageMatchResult = compareImagesRoughly(student.idCardImageUri, scannedImageUri);
                console.log(`${logPrefix} Image comparison for ${student.name}: ${imageMatchResult}`);
                // Toast notifications for image match status removed for brevity, can be added back if needed
            } else if (source === 'scan' && !student.idCardImageUri) {
                console.log(`${logPrefix} No registered ID card image found for ${student.name}.`);
                imageMatchResult = undefined;
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
            resultState = { student, log: newLog, scannedImageUri: source === 'scan' ? scannedImageUri : undefined, imageMatch: imageMatchResult, source };
            toast({
                title: `${currentAction} Recorded`,
                description: `${student.name} (${student.id.toUpperCase()}) recorded as ${currentAction.toLowerCase()} at ${format(now, 'Pp')}.`,
                variant: 'default',
            });
            playSound(currentAction === 'Entry' ? 'entry' : 'exit');

        } catch (error: any) {
            console.error(`${logPrefix} Error processing:`, error);
            const errorMessage = error.message || 'An unknown error occurred during processing.';
            toast({ title: 'Processing Error', description: errorMessage, variant: 'destructive' });
            playSound('error');

            // Prepare data for error result display
            let errorStudentData: Partial<Student> = { id: studentId?.toUpperCase() || "Unknown ID", name: "Unknown Name" };
            if (student) {
                errorStudentData = student;
            } else if (studentId) {
                errorStudentData = { id: studentId.toUpperCase(), name: "Not Registered" };
            }
            resultState = { student: errorStudentData, log: { type: 'Error', timestamp: now, message: errorMessage }, scannedImageUri: source === 'scan' ? scannedImageUri : undefined, imageMatch: imageMatchResult, source };
            processSuccessful = false;

        } finally {
             console.log(`${logPrefix} Finalizing processing. Success: ${processSuccessful}`);
             setLastScanResult(resultState); // Show the result card
             setIsDetecting(false); // Ensure detection indicator is off
             setIsExtracting(false); // Ensure extraction indicator is off

             // Set timeout to clear the result card and allow next scan/submit
             processingTimeoutRef.current = setTimeout(() => {
                setIsProcessing(false); // Allow next scan/submit
                setLastScanResult(null); // Clear the result card
                setCapturedImageUri(null); // Clear the preview image
                console.log(`${logPrefix} Processing timeout finished, ready for next action.`);
                processingTimeoutRef.current = null; // Clear the ref
            }, processSuccessful ? 3000 : 5000); // Shorter delay for success, longer for error

             if (source === 'manual') {
                 setManualStudentId(''); // Clear manual input field
             }
        }
  }, [toast]);


  // Handles image captured from scanner (triggered by autoScanMode)
  const processCapturedImage = useCallback(async (imageDataUri: string) => {
    const logPrefix = "[processCapturedImage]";
    if (isProcessing) { // Check generic processing state
      console.log(`${logPrefix} Already processing, skipping.`);
      return;
    }

    console.log(`${logPrefix} Initiated with image data (length: ${imageDataUri.length})`);
    setIsProcessing(true); // Set generic processing state
    setIsDetecting(true); // Start ID card detection indicator
    setIsExtracting(false); // Ensure extraction indicator is off initially
    setScanSessionError(null); // Clear session error
    setLastScanResult(null); // Clear previous result immediately
    setCapturedImageUri(imageDataUri); // Show captured image during processing

    try {
      console.log(`${logPrefix} Calling detectIdCard...`);
      const detectionResult = await detectIdCard({ imageDataUri });
      setIsDetecting(false); // End ID detection indicator
      console.log(`${logPrefix} ID card detection result:`, detectionResult);

      if (!detectionResult || !detectionResult.isIdCard) {
          console.log(`${logPrefix} Image does not appear to be an ID card. Skipping further processing.`);
          // Reset processing state quickly to allow next scan attempt without long delay or error message
          setIsProcessing(false);
          setCapturedImageUri(null); // Clear the non-ID image preview
          // Do NOT set LastScanResult or play error sound for non-ID images
          return; // Exit early
      }

      // ID card detected, proceed to extraction
      console.log(`${logPrefix} ID card detected. Calling extractBarcodeData...`);
      playSound('processing'); // Play processing sound
      setIsExtracting(true); // Start barcode extraction indicator
      const extractionResult = await extractBarcodeData({ barcodeImage: imageDataUri });
      console.log(`${logPrefix} Extraction result:`, extractionResult);
      setIsExtracting(false); // End extraction indicator (BEFORE calling shared logic)

      if (!extractionResult || !extractionResult.idNumber || extractionResult.idNumber.trim() === "") {
          // If ID card detected but no ID found, show a specific error
          console.log(`${logPrefix} ID card detected, but no ID number extracted.`);
          throw new Error("Could not extract Student ID number from the detected card.");
      }

      const extractedId = extractionResult.idNumber.trim().toLowerCase();
      // Call shared logic which will handle further processing, success/error display, and timeout
      await sharedProcessLogic(extractedId, 'scan', imageDataUri);

    } catch (error: any) { // Catch errors from detection, extraction, or shared logic call
      console.error(`${logPrefix} Error during image processing:`, error);
      const errorMessage = error.message || 'An unknown error during image processing.';
      toast({ title: 'Processing Error', description: errorMessage, variant: 'destructive' });
      playSound('error');
      setIsDetecting(false); // Ensure detection indicator is off on error
      setIsExtracting(false); // Ensure extraction indicator is off on error

      setLastScanResult({
          student: { id: "Unknown", name: "Processing Failed" },
          log: { type: 'Error', timestamp: new Date(), message: errorMessage },
          scannedImageUri: imageDataUri,
          source: 'scan'
      });

      // Use timeout to reset processing state after showing error
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = setTimeout(() => {
            setIsProcessing(false); // Allow next action
            setLastScanResult(null); // Clear result card
            setCapturedImageUri(null); // Clear preview image
            console.log(`${logPrefix} Processing error timeout finished.`);
            processingTimeoutRef.current = null;
      }, 5000); // Longer display for error
    }
    // sharedProcessLogic now handles the final state reset (setIsProcessing(false)) via its own timeout if successful
    // If an error occurred here, the timeout above handles the reset.
  }, [toast, isProcessing, sharedProcessLogic]);


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
    playSound('error');
    setIsProcessing(false); // Ensure processing is stopped on scanner error
    setIsDetecting(false);
    setIsExtracting(false);
  }, [toast]);


  // Handler for manual ID submission
  const handleManualSubmit = useCallback((event: React.FormEvent) => {
      event.preventDefault();
      const trimmedId = manualStudentId.trim().toLowerCase();
      if (!trimmedId) {
          toast({ title: "Input Error", description: "Please enter a Student ID.", variant: "destructive" });
           playSound('error');
          return;
      }
      if (isProcessing) {
          console.log("[handleManualSubmit] Already processing, skipping.");
          return;
      }
      setIsProcessing(true); // Set processing flag immediately
      setScanSessionError(null); // Clear any previous scan error
      setLastScanResult(null); // Clear previous result
      sharedProcessLogic(trimmedId, 'manual');
      // sharedProcessLogic now handles resetting isProcessing via timeout
  }, [manualStudentId, isProcessing, sharedProcessLogic, toast]);

   // Function to clear errors and results
   const clearStatus = () => {
       setScanSessionError(null);
       setLastScanResult(null);
       setCapturedImageUri(null);
       if (processingTimeoutRef.current) {
            clearTimeout(processingTimeoutRef.current); // Clear timeout if status is manually dismissed
            processingTimeoutRef.current = null;
       }
       setIsProcessing(false); // Immediately allow new actions if status cleared manually
       setIsDetecting(false);
       setIsExtracting(false);
   }

   // Effect to clean up timeout on unmount
   useEffect(() => {
       return () => {
           if (processingTimeoutRef.current) {
               clearTimeout(processingTimeoutRef.current);
           }
       };
   }, []);


  return (
    <div className="container mx-auto px-4 py-8 flex flex-col items-center gap-8">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">Record Entry/Exit</CardTitle>
          <CardDescription>Auto-scan ID barcode or enter ID manually.</CardDescription>
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
                 disabled={isProcessing} // Disable input while any processing is happening
                 className="text-base"
               />
             </div>
             <Button type="submit" disabled={isProcessing || !manualStudentId.trim()} className="transition-subtle">
               {isProcessing && lastScanResult?.source === 'manual' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
               <span className="ml-2">Submit</span>
             </Button>
           </form>

           <div className="text-center text-muted-foreground my-2">OR</div>

          {/* Scanner Area - always present but controlled internally */}
          <div className="w-full">
               <BarcodeScanner
                 // Pass necessary props for automatic scanning
                 onScanSuccess={processCapturedImage} // Pass the updated handler
                 onScanError={handleScannerError}
                 scanPrompt="Position ID card in frame..."
                 autoScanMode={true} // Enable auto scanning
                 isProcessing={isProcessing} // Pass processing status to scanner to pause capture
                 captureInterval={1500} // Capture frame every 1.5 seconds (adjust as needed)
                 // setCapturedImageUri is NOT needed for auto-scan processing, only for displaying final result image
                 // disabled prop could be used to completely disable scanner if needed
                 // showStopButton={false} // Explicitly hide stop button
                 // Pass isDetecting state to scanner for visual feedback
                 isDetecting={isDetecting}
               />
          </div>

          {/* Last Scan/Manual Result Display */}
          {/* Show result card OR processing indicators */}
          {(isProcessing || lastScanResult) && (
            <Card className={`w-full max-w-md mt-4 border-2 ${
              // Style based on the final result OR indicate processing state
              !isProcessing && lastScanResult?.log.type === 'Error' ? 'border-destructive bg-destructive/10' :
              !isProcessing && lastScanResult?.log.type === 'Entry' ? 'border-green-500 bg-green-500/10' :
              !isProcessing && lastScanResult?.log.type === 'Exit' ? 'border-red-500 bg-red-500/10' :
              'border-blue-500 bg-blue-500/10' // Default border while processing
            } ${!isProcessing && lastScanResult?.imageMatch === false && lastScanResult?.log.type !== 'Error' ? '!border-yellow-500 !bg-yellow-500/10' : ''}`}>
              <CardHeader>
                 <div className="flex justify-between items-start">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      {isDetecting && <Loader2 className="h-5 w-5 animate-spin text-blue-600" />}
                      {isExtracting && <Loader2 className="h-5 w-5 animate-spin text-purple-600" />}
                      {!isProcessing && lastScanResult?.log.type === 'Error' && <AlertCircle className="text-destructive" />}
                      {!isProcessing && lastScanResult?.log.type === 'Entry' && <LogIn className="text-green-600" />}
                      {!isProcessing && lastScanResult?.log.type === 'Exit' && <LogOut className="text-red-600" />}

                      {isDetecting ? 'Detecting ID...' :
                       isExtracting ? 'Extracting ID...' :
                       !isProcessing && lastScanResult?.log.type === 'Error' ? 'Processing Error' :
                       !isProcessing && lastScanResult?.log.type === 'Entry' ? 'Entry Recorded' :
                       !isProcessing && lastScanResult?.log.type === 'Exit' ? 'Exit Recorded' :
                       'Processing...'} {/* Fallback title */}
                    </CardTitle>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:bg-muted/50" onClick={clearStatus}>
                        <X className="h-4 w-4" />
                        <span className="sr-only">Clear Status</span>
                    </Button>
                </div>
                {/* Show description only when processing is finished */}
                {!isProcessing && lastScanResult && (
                  <CardDescription>
                   {lastScanResult.log.type === 'Error' && lastScanResult.log.message ? lastScanResult.log.message :
                      lastScanResult.log.timestamp ? `Recorded Time: ${format(lastScanResult.log.timestamp, 'Pp')}` : "Details unavailable"}
                  </CardDescription>
                )}
              </CardHeader>
               {/* Show content only when processing is finished */}
              {!isProcessing && lastScanResult && (
                <CardContent className="text-sm space-y-3">
                  {/* Scanned Image Preview */}
                  {lastScanResult.source === 'scan' && capturedImageUri && (
                    <div className="flex flex-col items-center mb-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Scanned Image:</p>
                      <Image
                        src={capturedImageUri}
                        alt="Scanned ID"
                        width={100}
                        height={150}
                        className={`rounded border object-contain ${
                          lastScanResult.imageMatch === false && lastScanResult.log.type !== 'Error' ? 'border-yellow-500 border-2 shadow-md'
                          : lastScanResult.imageMatch === true && lastScanResult.log.type !== 'Error' ? 'border-green-500 border-2'
                          : 'border-muted'
                        }`}
                        data-ai-hint="scanned id card result"
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
                    {lastScanResult.log.type !== 'Error' && lastScanResult.student?.branch && (
                      <p><strong>Branch:</strong> {lastScanResult.student.branch}</p>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Display General Scanner Session Errors (Only when not processing/showing result) */}
          {scanSessionError && !isProcessing && !lastScanResult && (
            <Alert variant="destructive" className="w-full max-w-md mt-4">
               <div className="flex justify-between items-start">
                   <div>
                      <AlertCircle className="h-4 w-4 inline-block mr-2 -translate-y-0.5" />
                      <AlertTitle className="inline-block">Scanner Session Error</AlertTitle>
                      <AlertDescription>{scanSessionError}</AlertDescription>
                  </div>
                   <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={clearStatus}>
                       <X className="h-4 w-4" />
                       <span className="sr-only">Clear Error</span>
                   </Button>
               </div>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
