
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Student, EntryLog, EntryType } from '@/lib/types';
import { extractBarcodeData } from '@/ai/flows/extract-barcode-data';
import { detectIdCard } from '@/ai/flows/detect-id-card-flow';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { LogIn, LogOut, AlertCircle, UserCheck, ImageOff, Camera, Loader2, UserPlus, Send, X, RefreshCw, ScanLine, Eye, ScanSearch } from 'lucide-react';
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
    // Ensure paths are correct relative to the public directory
    entryAudio = new Audio('/sounds/entry_success.mp3');
    exitAudio = new Audio('/sounds/exit_success.mp3');
    errorAudio = new Audio('/sounds/error.mp3');
    processingAudio = new Audio('/sounds/processing_tone.mp3'); // Use the correct filename

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


export default function ScanPage() { // Changed component name
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false); // Unified processing state
  const [isDetecting, setIsDetecting] = useState(false); // State for ID card detection phase
  const [isExtracting, setIsExtracting] = useState(false); // Specific state for AI extraction indicator
  const [scanSessionError, setScanSessionError] = useState<string | null>(null);
  const [lastScanResult, setLastScanResult] = useState<LastScanResultType | null>(null);
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null); // Only for display after processing
  const [manualStudentId, setManualStudentId] = useState(''); // State for manual ID input
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref for processing result display timeout
  const [lastProcessedImage, setLastProcessedImage] = useState<string | null>(null); // Store last processed image URI
  const [detectionCoolDown, setDetectionCoolDown] = useState(false); // Cooldown flag


  // Shared logic to process a student ID (from scan or manual)
  const sharedProcessLogic = useCallback(async (studentId: string, source: 'scan' | 'manual', scannedImageUri?: string) => {
        const logPrefix = `[sharedProcessLogic-${source}]`;
        console.log(`${logPrefix} Processing ID: ${studentId}`);
        setIsProcessing(true); // Set processing flag immediately
        setScanSessionError(null); // Clear any previous scan error
        setLastScanResult(null); // Clear previous result
        setCapturedImageUri(source === 'scan' ? scannedImageUri : null); // Show scanned image for result display

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
                imageMatch: imageMatchResult, // Save comparison result with the log
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
             setIsDetecting(false); // Ensure detection state is reset
             setIsExtracting(false); // Ensure extraction state is reset
             // isProcessing will be reset by the timeout below

             // Set timeout to clear the result card and allow next scan/submit
             processingTimeoutRef.current = setTimeout(() => {
                setIsProcessing(false); // Allow next scan/submit ONLY after timeout
                setLastScanResult(null); // Clear the result card
                setCapturedImageUri(null); // Clear the preview image
                console.log(`${logPrefix} Processing timeout finished, ready for next action.`);
                processingTimeoutRef.current = null; // Clear the ref
            }, processSuccessful ? 3000 : 5000); // Shorter delay for success, longer for error

             if (source === 'manual') {
                 setManualStudentId(''); // Clear manual input field
             }
        }
  }, [toast]); // Removed dependencies that might cause unnecessary re-renders


  // Handles image captured from scanner (triggered by autoScanMode)
  const processCapturedImage = useCallback(async (imageDataUri: string) => {
    const logPrefix = "[processCapturedImage]";

    if (isProcessing || detectionCoolDown) {
      console.log(`${logPrefix} Already processing or in cooldown, skipping.`);
      return;
    }

    // Quick check for image difference
    if (lastProcessedImage && compareImagesRoughly(imageDataUri, lastProcessedImage) === true) {
      console.log(`${logPrefix} Image is similar to the last processed image, skipping processing.`);
      return;
    }

    console.log(`${logPrefix} Initiated with image data (length: ${imageDataUri.length})`);
    setIsProcessing(true);
    setIsDetecting(true);
    setIsExtracting(false); // Reset extracting state
    setScanSessionError(null);
    setLastScanResult(null);
    setCapturedImageUri(imageDataUri); // Show image being processed

    try {
      console.log(`${logPrefix} Calling detectIdCard...`);
      const detectionResult = await detectIdCard({ imageDataUri });
      setIsDetecting(false);
      console.log(`${logPrefix} ID card detection result:`, detectionResult);

      if (!detectionResult || !detectionResult.isIdCard) {
        console.log(`${logPrefix} Image does not appear to be an ID card. Skipping further processing.`);
        // Don't immediately clear processing flag, let timeout handle it after cooldown
        setCapturedImageUri(null); // Clear the non-ID image preview
        setDetectionCoolDown(true); // Start cooldown
        setTimeout(() => {
            setDetectionCoolDown(false);
            setIsProcessing(false); // Reset processing state AFTER cooldown
            console.log(`${logPrefix} Cooldown finished.`);
        }, 2000); // Cooldown for 2 seconds
        return; // Exit early
      }

      // ID Card Detected, proceed to extraction
      console.log(`${logPrefix} ID card detected. Calling extractBarcodeData...`);
      playSound('processing'); // Play sound when extraction starts
      setIsExtracting(true);
      const extractionResult = await extractBarcodeData({ barcodeImage: imageDataUri });
      console.log(`${logPrefix} Extraction result:`, extractionResult);
      setIsExtracting(false); // Extraction finished

      if (!extractionResult || !extractionResult.idNumber || extractionResult.idNumber.trim() === "") {
        console.log(`${logPrefix} ID card detected, but no ID number extracted.`);
        throw new Error("Could not extract Student ID number from the detected card.");
      }

      const extractedId = extractionResult.idNumber.trim().toLowerCase();
      // Processing status (including setIsProcessing) is now handled within sharedProcessLogic via timeout
      await sharedProcessLogic(extractedId, 'scan', imageDataUri);
      setLastProcessedImage(imageDataUri); // Store the successfully processed image URI

    } catch (error: any) { // Catch errors from detection, extraction, or shared logic call
      console.error(`${logPrefix} Error during image processing:`, error);
      const errorMessage = error.message || 'An unknown error during image processing.';
      toast({ title: 'Processing Error', description: errorMessage, variant: 'destructive' });
      playSound('error');
      setIsDetecting(false); // Ensure flags are reset on error
      setIsExtracting(false);

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
      // No need to set isProcessing(false) here, timeout handles it
    }
     // Removed finally block as logic is handled within try/catch and timeout
  }, [toast, isProcessing, sharedProcessLogic, detectIdCard, extractBarcodeData, lastProcessedImage, detectionCoolDown]);


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
      // isProcessing flag is set within sharedProcessLogic now
      sharedProcessLogic(trimmedId, 'manual');
      // sharedProcessLogic also handles resetting isProcessing via timeout
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
       setDetectionCoolDown(false); // Also reset cooldown
       console.log("[clearStatus] Status cleared manually.");
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
    // Main container adjusted for layout flexibility
    <div className="flex flex-col lg:flex-row items-start gap-8 w-full max-w-5xl mx-auto">

      {/* Scanner and Result Section (Left side on large screens) */}
      <div className="w-full lg:w-1/2 flex flex-col items-center gap-6">
        <Card className="w-full max-w-lg card-enhanced">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent drop-shadow">
              <ScanSearch className="inline-block mr-2 -mt-1 h-6 w-6" />
              Scan ID Card
            </CardTitle>
            <CardDescription>Position ID card within the frame for automatic entry/exit.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6 pt-4">

            {/* Scanner Component */}
            <div className="w-full">
                 <BarcodeScanner
                   onScanSuccess={processCapturedImage}
                   onScanError={handleScannerError}
                   scanPrompt="Position ID card in frame..."
                   autoScanMode={true}
                   isProcessing={isProcessing}
                   captureInterval={1500}
                   isDetecting={isDetecting}
                 />
            </div>

             {/* Last Scan Result Display */}
            {(isProcessing || lastScanResult) && (
              <Card className={`w-full max-w-md card-enhanced border-l-4 ${
                !isProcessing && lastScanResult?.log.type === 'Error' ? 'border-l-destructive' :
                !isProcessing && lastScanResult?.log.type === 'Entry' ? 'border-l-green-500' :
                !isProcessing && lastScanResult?.log.type === 'Exit' ? 'border-l-red-500' :
                'border-l-blue-500'
              } ${!isProcessing && lastScanResult?.imageMatch === false && lastScanResult?.log.type !== 'Error' ? '!border-l-yellow-500' : ''}`}>
                <CardHeader className="pb-3">
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
                         'Processing...'}
                      </CardTitle>
                      {/* Allow clearing status only when not actively processing */}
                      {!isProcessing && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:bg-muted/50" onClick={clearStatus}>
                              <X className="h-4 w-4" />
                              <span className="sr-only">Clear Status</span>
                          </Button>
                      )}
                  </div>
                  {!isProcessing && lastScanResult && (
                    <CardDescription className="pt-1">
                     {lastScanResult.log.type === 'Error' && lastScanResult.log.message ? lastScanResult.log.message :
                        lastScanResult.log.timestamp ? `Recorded Time: ${format(lastScanResult.log.timestamp, 'Pp')}` : "Details unavailable"}
                    </CardDescription>
                  )}
                </CardHeader>
                {!isProcessing && lastScanResult && (
                  <CardContent className="text-sm space-y-3 pt-0">
                    {lastScanResult.source === 'scan' && capturedImageUri && (
                      <div className="flex flex-col items-center mb-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Scanned Image:</p>
                        <Image
                          src={capturedImageUri}
                          alt="Scanned ID"
                          width={100}
                          height={150}
                          className={`rounded border-2 object-contain shadow-md ${
                            lastScanResult.imageMatch === false && lastScanResult.log.type !== 'Error' ? 'border-yellow-500 shadow-yellow-500/20'
                            : lastScanResult.imageMatch === true && lastScanResult.log.type !== 'Error' ? 'border-green-500 shadow-green-500/20'
                            : 'border-muted'
                          }`}
                          data-ai-hint="scanned id card result"
                        />
                        {lastScanResult.imageMatch === false && lastScanResult.log.type !== 'Error' && (
                          <span className="text-xs text-yellow-600 dark:text-yellow-400 font-semibold mt-1 animate-pulse">Image Mismatch! Verify ID.</span>
                        )}
                        {lastScanResult.imageMatch === true && lastScanResult.log.type !== 'Error' && (
                          <span className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">Image Match Confirmed</span>
                        )}
                        {lastScanResult.imageMatch === undefined && lastScanResult.log.type !== 'Error' && (
                          <span className="text-xs text-muted-foreground mt-1">(No registered image or comparison inconclusive)</span>
                        )}
                      </div>
                    )}
                    <div className="space-y-1">
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

             {scanSessionError && !isProcessing && !lastScanResult && (
              <Alert variant="destructive" className="w-full max-w-md mt-6">
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

      {/* Manual Entry Section (Right side on large screens) */}
       <div className="w-full lg:w-1/2 flex flex-col items-center lg:pt-[7.5rem]"> {/* Add padding-top to align */}
          <Card className="w-full max-w-lg card-enhanced">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-400 dark:to-pink-400 drop-shadow">
                    Manual Entry
                </CardTitle>
                <CardDescription>If scanning fails, enter the Student ID here.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center pt-4">
               <form onSubmit={handleManualSubmit} className="w-full max-w-xs flex items-end gap-2">
                 <div className="flex-grow">
                   <Label htmlFor="manual-student-id" className="sr-only">Student ID</Label>
                   <Input
                     id="manual-student-id"
                     type="text"
                     placeholder="Enter Student ID"
                     value={manualStudentId}
                     onChange={(e) => setManualStudentId(e.target.value)}
                     disabled={isProcessing}
                     className="text-base transition-subtle"
                   />
                 </div>
                 <Button type="submit" disabled={isProcessing || !manualStudentId.trim()} className="transition-subtle hover:scale-[1.02] bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white">
                   {isProcessing && lastScanResult?.source === 'manual' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                   <span className="ml-2">Submit</span>
                 </Button>
               </form>
            </CardContent>
          </Card>
        </div>

    </div>
  );
}
