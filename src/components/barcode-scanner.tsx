'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, Ban, AlertCircle, Loader2, ScanLine } from 'lucide-react'; // Added ScanLine
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BrowserMultiFormatReader, NotFoundException, ChecksumException, FormatException, DecodeHintType, BarcodeFormat, DOMException as ZXingDOMException } from '@zxing/library';

interface BarcodeScannerProps {
  onScanSuccess: (imageDataUri: string) => void;
  onScanError?: (error: Error) => void;
  onManualStop?: (imageDataUri: string | null) => void; // Callback for manual stop
  buttonText?: string; // Text for the button that INITIATES scanning
  scanPrompt?: string;
  disabled?: boolean; // Disables the entire component (e.g., during parent processing)
  autoStartScanLoop?: boolean; // Controls if scanning starts decoding immediately AFTER camera starts
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScanSuccess,
  onScanError,
  onManualStop,
  buttonText = 'Start Scanning',
  scanPrompt = 'Position barcode in front of the camera...',
  disabled = false,
  autoStartScanLoop = false, // Default to false, requires manual click
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number>();
  const processingSuccessRef = useRef(false); // Tracks if a successful scan is being processed by parent

  const [isStarting, setIsStarting] = useState(false); // True when startCamera() is executing
  const [isActive, setIsActive] = useState(false); // True when camera stream is active and playing
  const [isScanning, setIsScanning] = useState(false); // True when the decoding loop is running
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();


   // --- Cleanup Function --- Needs to be defined before use in other callbacks
   const cleanupCamera = useCallback((caller?: string) => {
     const logPrefix = `[Cleanup ${caller || 'caller'}]`;
     console.log(`${logPrefix} Starting cleanup...`);
     processingSuccessRef.current = false; // Reset processing flag

     // Cancel any ongoing scan loop first
     if (scanLoopRef.current) {
       cancelAnimationFrame(scanLoopRef.current);
       scanLoopRef.current = undefined;
       console.log(`${logPrefix} Cancelled animation frame.`);
     }

     // Stop and release the stream tracks
     if (streamRef.current) {
       console.log(`${logPrefix} Stopping tracks on stream: ${streamRef.current.id}`);
       streamRef.current.getTracks().forEach(track => {
         if (track.readyState === 'live') {
           track.stop();
           console.log(`${logPrefix} Stopped track: ${track.label} (${track.kind}, state: ${track.readyState})`);
         } else {
           console.log(`${logPrefix} Track already stopped?: ${track.label} (${track.kind}, state: ${track.readyState})`);
         }
       });
       streamRef.current = null; // Clear the ref after stopping tracks
       console.log(`${logPrefix} Cleared stream ref.`);
     } else {
         console.log(`${logPrefix} No active streamRef to cleanup.`);
     }

     // Then detach from video element
     const video = videoRef.current;
     if (video) {
       if (video.srcObject) {
         video.srcObject = null; // Detach the stream
         console.log(`${logPrefix} Cleared video srcObject.`);
       } else {
         console.log(`${logPrefix} Video srcObject already null.`);
       }
       if (!video.paused) {
         video.pause(); // Pause playback
         console.log(`${logPrefix} Paused video playback.`);
       }
        // Remove specific listeners added elsewhere (handleVideoError, handleLoadedMetadata)
       // video.removeEventListener('error', handleVideoError);
       // video.removeEventListener('loadedmetadata', handleLoadedMetadata);
       console.log(`${logPrefix} (Listeners should be removed by their own effect cleanup).`);
     } else {
       console.log(`${logPrefix} No video element ref to cleanup.`);
     }

      // Reset the reader
     if (readerRef.current) {
         try {
             readerRef.current.reset(); // Reset ZXing reader state
             console.log(`${logPrefix} ZXing Reader reset called.`);
         } catch (e) {
             console.warn(`${logPrefix} Error calling reader.reset():`, e);
         }
         readerRef.current = null; // Nullify the reference
         console.log(`${logPrefix} Nullified ZXing Reader reference.`);
     } else {
         console.log(`${logPrefix} No readerRef to reset.`);
     }

     // Reset component state *last*
     // Caller should manage state updates (isActive, isScanning, isStarting) after calling cleanup
     console.log(`${logPrefix} Cleanup finished.`);
   }, []); // No dependencies needed here


   // --- Frame Capture ---
   const captureFrame = useCallback((): string | null => {
     const video = videoRef.current;
     const canvas = canvasRef.current;
     const logPrefix = "[CaptureFrame]";

     if (!video || !canvas || !isActive || video.readyState < video.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
       console.warn(`${logPrefix} Conditions not met for capture.`, { videoExists: !!video, canvasExists: !!canvas, isActive, readyState: video?.readyState, width: video?.videoWidth, height: video?.videoHeight });
       return null;
     }

     const context = canvas.getContext('2d', { willReadFrequently: true });
     if (!context) {
       console.error(`${logPrefix} Canvas context is null.`);
       const err = new Error("Failed to get canvas context for frame capture.");
       setError(err.message);
       if (onScanError) onScanError(err);
       cleanupCamera("captureFrame context error"); // Cleanup on critical error
       setIsActive(false);
       setIsScanning(false);
       return null;
     }

     try {
       canvas.width = video.videoWidth;
       canvas.height = video.videoHeight;
       context.drawImage(video, 0, 0, canvas.width, canvas.height);
       const imageDataUri = canvas.toDataURL('image/png');
       console.log(`${logPrefix} Success. Length: ${imageDataUri.length}`);
       return imageDataUri;
     } catch (e: any) {
       console.error(`${logPrefix} Error during drawImage or toDataURL:`, e);
       const errorMsg = `Failed to capture frame: ${e.message || 'Unknown canvas error'}`;
       const err = e instanceof Error ? e : new Error(errorMsg);
       setError(errorMsg);
       if (onScanError) onScanError(err);
       cleanupCamera("captureFrame draw error"); // Cleanup on critical error
       setIsActive(false);
       setIsScanning(false);
       return null;
     }
   }, [isActive, onScanError, cleanupCamera]); // Added dependencies


   // --- Scanning Loop (Recursive Function) ---
    // Defined using useRef to keep it stable for useCallback dependencies
    const runScanLoopRef = useRef<() => void>();

    useEffect(() => {
      runScanLoopRef.current = () => {
        const logPrefix = "[runScanLoop]";

        if (!isActive || !isScanning || processingSuccessRef.current || !readerRef.current || !videoRef.current) {
            console.log(`${logPrefix} Stopping loop request. Conditions:`, { isActive, isScanning, processing: processingSuccessRef.current, reader: !!readerRef.current, video: !!videoRef.current });
            scanLoopRef.current = undefined;
            // Ensure scanning state is false if loop stops
            if (isScanning) setIsScanning(false);
            return;
        }

        const reader = readerRef.current;
        const videoElement = videoRef.current;

        if (videoElement.readyState >= videoElement.HAVE_CURRENT_DATA && videoElement.videoWidth > 0) {
            reader.decodeFromVideoElement(videoElement).then(result => {
                if (processingSuccessRef.current || !isScanning || !isActive) {
                    console.log(`${logPrefix} (decode success) Conditions changed post-decode, ignoring result.`);
                    return;
                }

                console.log(`${logPrefix} Barcode detected:`, result.getText());
                processingSuccessRef.current = true; // Set flag: Parent is now processing
                setIsScanning(false); // Stop visual scanning indicator and loop logic

                const imageDataUri = captureFrame();

                if (imageDataUri) {
                    console.log(`${logPrefix} Frame captured, calling onScanSuccess.`);
                    onScanSuccess(imageDataUri); // Pass the captured frame to parent
                    // Keep camera active after success, parent decides if/when to stop
                    // cleanupCamera("scan success");
                    // setIsActive(false);
                    // setIsScanning(false);
                    processingSuccessRef.current = false; // Ready for next scan IF parent doesn't disable
                } else {
                    console.error(`${logPrefix} Failed to capture frame AFTER barcode detection.`);
                    const captureFailError = new Error("Frame capture failed after detection.");
                    setError(captureFailError.message);
                    if (onScanError) onScanError(captureFailError);
                    cleanupCamera("capture frame fail after success");
                    setIsActive(false); // Ensure state reflects inactivity
                    setIsScanning(false);
                }

            }).catch(err => {
                if (processingSuccessRef.current || !isScanning || !isActive) {
                    console.log(`${logPrefix} (decode error) Conditions changed post-decode, ignoring error.`);
                    return;
                }

                if (err instanceof NotFoundException) {
                    // Normal case: No barcode found, continue loop below
                } else if (err instanceof ChecksumException || err instanceof FormatException) {
                    console.warn(`${logPrefix} Minor scan error (Checksum/Format): ${err.message}. Continuing.`);
                } else if (err instanceof ZXingDOMException && err.message?.includes('multiple barcodes')) {
                    console.warn(`${logPrefix} Multiple barcodes detected, ignoring. ${err.message}. Continuing.`);
                }
                else {
                    console.error(`${logPrefix} Significant error during barcode decoding:`, err);
                    const errorMsg = `Scanning error: ${err instanceof Error ? err.message : String(err)}`;
                    setError(errorMsg);
                    if (onScanError) {
                        onScanError(err instanceof Error ? err : new Error(errorMsg));
                    }
                    cleanupCamera("scan decode error catch");
                    setIsActive(false); // Ensure state reflects inactivity
                    setIsScanning(false);
                }
            }).finally(() => {
                // IMPORTANT: Request next frame ONLY if still scanning and no success processing occurred
                // Ensure loop continues even after minor errors or NotFoundException
                 if (isActive && isScanning && !processingSuccessRef.current) {
                    scanLoopRef.current = requestAnimationFrame(runScanLoopRef.current!); // Use ref here
                 } else {
                     console.log(`${logPrefix} Not requesting next frame. Loop should stop. Cond:`, { isActive, isScanning, processing: processingSuccessRef.current });
                     scanLoopRef.current = undefined;
                      if (isScanning) setIsScanning(false); // Ensure state is updated if loop stops here
                 }
            });
        } else {
            console.warn(`${logPrefix} Video not ready for decoding. State: ${videoElement.readyState}, Width: ${videoElement.videoWidth}`);
            // Request next frame even if video wasn't ready, to try again
            if (isActive && isScanning && !processingSuccessRef.current) {
               scanLoopRef.current = requestAnimationFrame(runScanLoopRef.current!); // Use ref here
            } else {
               scanLoopRef.current = undefined;
               if (isScanning) setIsScanning(false);
            }
        }
      };
    }, [isActive, isScanning, captureFrame, onScanSuccess, cleanupCamera, onScanError]); // Add relevant dependencies


    // --- Start Camera ---
    const startCamera = useCallback(async () => {
        const logPrefix = "[startCamera]";
        console.log(`${logPrefix} Attempting to start...`);
        if (isStarting || isActive) {
          console.warn(`${logPrefix} Aborted - already starting or active.`);
          return;
        }
        setError(null);
        setIsStarting(true);
        setIsActive(false);
        setIsScanning(false);
        processingSuccessRef.current = false;

        console.log(`${logPrefix} Performing pre-start cleanup.`);
        cleanupCamera("startCamera preamble");
        // Short delay to help ensure resources are released if previously used
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
          console.log(`${logPrefix} Requesting media stream...`);
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Camera access (getUserMedia) is not supported by this browser.');
          }
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "environment",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
          console.log(`${logPrefix} Stream obtained:`, stream.id);
          streamRef.current = stream;

          const video = videoRef.current;
          if (!video) {
            cleanupCamera("startCamera no video ref"); // Cleanup the obtained stream
            throw new Error("Video element reference is not available.");
          }

          video.muted = true;
          video.playsInline = true;
          // video.autoplay = true; // Autoplay might not be reliable, use explicit play()

          if (video.srcObject) {
              console.warn(`${logPrefix} Detaching existing srcObject before setting new one.`);
              video.srcObject = null;
          }
          video.srcObject = stream;
          console.log(`${logPrefix} Set video srcObject.`);

          try {
              console.log(`${logPrefix} Attempting video.play()...`);
              await video.play();
              console.log(`${logPrefix} video.play() promise resolved successfully.`);
          } catch (playError: any) {
              console.error(`${logPrefix} Error during video.play():`, playError);
              // Provide more specific error messages based on DOMException names
              let playErrorMessage = `Could not start video source`;
              if (playError instanceof DOMException) {
                  if (playError.name === 'NotAllowedError') {
                      playErrorMessage = `Video playback not allowed. Ensure autoplay is permitted or user interaction occurred.`;
                  } else if (playError.name === 'NotSupportedError') {
                      playErrorMessage = `Video format or source not supported by the browser.`;
                  } else if (playError.name === 'AbortError') {
                       playErrorMessage = `Video playback was aborted, possibly by the user or system.`;
                  } else {
                       playErrorMessage = `Could not start video source: ${playError.name} - ${playError.message}`;
                  }
              } else {
                   playErrorMessage = `Could not start video source: ${playError.message || 'Unknown playback error'}`;
              }
              throw new Error(playErrorMessage); // Rethrow with a more informative message
          }

          const hints = new Map<DecodeHintType, any>();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
               BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13,
               BarcodeFormat.UPC_A, BarcodeFormat.PDF_417, BarcodeFormat.QR_CODE, // Added QR Code
               BarcodeFormat.DATA_MATRIX // Added Data Matrix
          ]);
          hints.set(DecodeHintType.TRY_HARDER, true);
          readerRef.current = new BrowserMultiFormatReader(hints, 500); // 500ms between scans is reasonable
          console.log(`${logPrefix} ZXing Reader initialized.`);

          setIsActive(true); // Mark as active *after* successful setup
          processingSuccessRef.current = false; // Ensure processing flag is false
          console.log(`${logPrefix} Camera active. Ready.`);

          // Start scan loop if autoStart is true
          if (autoStartScanLoop) {
              console.log(`${logPrefix} Auto-starting scan loop.`);
              setIsScanning(true);
              if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
              scanLoopRef.current = requestAnimationFrame(runScanLoopRef.current!); // Use ref
          } else {
               console.log(`${logPrefix} Ready for manual scan trigger.`);
          }

        } catch (err: any) {
          console.error(`${logPrefix} Error accessing or starting camera:`, err);
          let message = `Could not start camera. Error: ${err.name || 'UnknownError'} - ${err.message || 'No details'}`;
          if (err.message?.includes('Could not start video source')) {
              message = err.message; // Use the specific playback error
          }
          else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
               message = 'Camera permission denied. Please allow access in browser settings and refresh.';
          } else if (['NotFoundError', 'DevicesNotFoundError'].includes(err.name)) {
               message = 'No compatible camera found. Ensure it is connected and enabled.';
          } else if (['NotReadableError', 'TrackStartError', 'AbortError', 'OverconstrainedError'].includes(err.name)) {
               // Refined message for common "already in use" scenarios
               message = 'Camera is already in use or could not be started. Close other apps/tabs using the camera and refresh.';
          } else if (err.name === 'SecurityError') {
               message = 'Camera access denied due to security settings (requires HTTPS).';
          }
          setError(message);
          toast({ title: 'Camera Start Error', description: message, variant: 'destructive', duration: 8000 });
          if (onScanError) onScanError(err instanceof Error ? err : new Error(message));
          cleanupCamera("startCamera error handler"); // Ensure cleanup on error
          setIsActive(false); // Ensure state reflects inactivity
          setIsScanning(false);
        } finally {
           setIsStarting(false); // Finished starting attempt (success or fail)
           console.log(`${logPrefix} Finished start attempt. State:`, { isStarting, isActive, isScanning });
        }
      }, [toast, onScanError, cleanupCamera, isActive, isStarting, autoStartScanLoop]); // Added autoStartScanLoop

   // --- Event Handlers (defined early for useCallback dependencies) ---
    const handleVideoError = useCallback((event: Event) => {
      console.error('Video Element Error Event:', event);
      const videoError = videoRef.current?.error;
      let message = "An unknown video error occurred.";
      if (videoError) {
        switch (videoError.code) {
          case MediaError.MEDIA_ERR_ABORTED: message = "Video playback was aborted."; break;
          case MediaError.MEDIA_ERR_NETWORK: message = "A network error caused video download to fail."; break;
          case MediaError.MEDIA_ERR_DECODE: message = "Video playback failed due to corruption or unsupported format."; break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: message = "The video source format is not supported."; break;
          default: message = `An unknown video error occurred (Code: ${videoError.code}).`;
        }
      }
      setError(message);
      toast({ title: "Video Playback Error", description: message, variant: "destructive" });
      if (onScanError) onScanError(new Error(message));
      cleanupCamera("video error event handler"); // Cleanup on video element errors
      setIsActive(false); // Ensure state reflects inactivity after error
      setIsScanning(false);
    }, [toast, onScanError, cleanupCamera]); // Added cleanupCamera dependency

   const handleLoadedMetadata = useCallback(() => {
     const video = videoRef.current;
     if (!video) return;
     console.log("[loadedmetadata] Video metadata loaded. Dimensions:", video.videoWidth, "x", video.videoHeight);
     // Metadata loaded successfully, video is ready to potentially start scanning loop (if conditions met)
     // The actual starting of the loop is handled within startCamera or startScanLoop now.
   }, []); // No dependencies needed


   // Effect to attach/detach video listeners
   useEffect(() => {
     const videoElement = videoRef.current;
     if (videoElement && isActive) { // Only attach when camera is active
       console.log("Attaching video event listeners");
       videoElement.addEventListener('error', handleVideoError);
       videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
     }
     // Cleanup function removes listeners
     return () => {
       if (videoElement) {
         console.log("Removing video event listeners via effect cleanup.");
         videoElement.removeEventListener('error', handleVideoError);
         videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
       }
     };
   }, [isActive, handleVideoError, handleLoadedMetadata]); // Re-run if isActive or handlers change


  // --- Unmount Cleanup ---
  useEffect(() => {
    return () => {
      console.log("BarcodeScanner: Unmounting. Cleaning up camera.");
      cleanupCamera("unmount");
    };
  }, [cleanupCamera]); // Ensure cleanupCamera is stable


  // --- Function to manually start the scanning loop ---
  const startScanLoop = useCallback(() => {
      if (isActive && !isScanning && !processingSuccessRef.current && !disabled && runScanLoopRef.current) {
          console.log("[ManualStartScanLoop] Starting scan loop.");
          setIsScanning(true);
          processingSuccessRef.current = false; // Ensure flag is reset
          if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current); // Clear previous loop
          scanLoopRef.current = requestAnimationFrame(runScanLoopRef.current); // Use the ref
      } else {
          console.warn("[ManualStartScanLoop] Cannot start loop. Conditions:", {isActive, isScanning, processing: processingSuccessRef.current, disabled});
      }
  }, [isActive, isScanning, disabled]); // Removed runScanLoopRef dep


  // --- Function to manually stop scanning and capture frame ---
   const stopScanningAndCapture = useCallback(() => {
       const logPrefix = "[ManualStop]";
       console.log(`${logPrefix} Manual stop requested.`);
       if (!isActive && !isStarting) {
           console.warn(`${logPrefix} Cannot stop, camera not active or starting.`);
           if (onManualStop) onManualStop(null);
           return;
       }

       console.log(`${logPrefix} Stopping scan loop and capturing frame.`);
       setIsScanning(false); // Stop the loop logic first
       if (scanLoopRef.current) {
           cancelAnimationFrame(scanLoopRef.current);
           scanLoopRef.current = undefined;
           console.log(`${logPrefix} Cancelled animation frame.`);
       } else {
           console.log(`${logPrefix} No active scan loop frame to cancel.`);
       }

       let frame: string | null = null;
       if (isActive && videoRef.current && videoRef.current.readyState >= videoRef.current.HAVE_CURRENT_DATA) {
           frame = captureFrame();
           console.log(`${logPrefix} Frame captured:`, frame ? `data:image/png;base64,...(${frame.length})` : null);
       } else {
           console.log(`${logPrefix} Camera not active or ready, cannot capture frame.`);
       }

       // Notify parent
       if (onManualStop) {
           onManualStop(frame);
       }

       // Cleanup camera resources AFTER capture and notification
       cleanupCamera("manual stop");
       setIsActive(false); // Update state after cleanup
       setIsScanning(false);
       setIsStarting(false);

   }, [isActive, isStarting, captureFrame, onManualStop, cleanupCamera]);


   // --- Handle initial button press to start camera ---
   const handleInitialStartClick = () => {
       if (!isStarting && !isActive && !disabled) {
           console.log("[InitialStartClick] Triggering startCamera().");
           startCamera();
       } else {
            console.log("[InitialStartClick] Ignoring click. Conditions:", {isStarting, isActive, disabled});
       }
   };

   // --- Effect to handle external disable/enable ---
   // If the parent disables the component while it's active, clean up.
   useEffect(() => {
      if (disabled && (isActive || isStarting)) {
        console.log("[DisableEffect] Parent disabled scanner while active/starting. Cleaning up.");
        cleanupCamera("disabled prop change");
        setIsActive(false);
        setIsScanning(false);
        setIsStarting(false);
        setError("Scanning cancelled by parent component."); // Optionally inform user
      }
   }, [disabled, isActive, isStarting, cleanupCamera]);

  return (
    <div className={`flex flex-col items-center gap-4 w-full max-w-xs ${disabled && !isStarting ? 'opacity-50 pointer-events-none' : ''}`}> {/* Allow interaction during startup */}

        {/* Camera View Area */}
        {/* Aspect ratio for vertical ID cards */}
        <div className={`w-full aspect-[3/4] border rounded-lg overflow-hidden shadow-md bg-muted relative ${(!isStarting && !isActive) ? 'hidden' : 'block'}`}>
            <video
              ref={videoRef}
              className={`w-full h-full object-cover block bg-black transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`}
              playsInline
              muted
              // autoPlay // Explicit play() is more reliable
              aria-label="Camera feed for barcode scanning"
            />
            {/* Loading/Starting Indicator */}
            {isStarting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white z-10 pointer-events-none">
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                <p className="text-sm text-muted-foreground">Starting camera...</p>
              </div>
            )}
             {/* Active Camera Overlay */}
             {isActive && (
              <div className="absolute inset-0 pointer-events-none z-5">
                 {/* Vertical Scan Line Animation */}
                 {isScanning && !processingSuccessRef.current && (
                     <div className="absolute left-1/2 top-0 w-0.5 h-full bg-gradient-to-b from-transparent via-accent to-transparent opacity-70 animate-scan-line-vertical"></div>
                 )}
                 {/* Vertical Frame Overlay */}
                 <div className="absolute inset-x-4 inset-y-10 border-2 border-accent/50 rounded pointer-events-none"></div>
                 {/* Prompt Text */}
                 <p className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-center text-xs text-white bg-black/50 px-2 py-1 rounded">
                    {isScanning && !processingSuccessRef.current ? scanPrompt : (processingSuccessRef.current ? 'Processing...' : (isActive ? 'Camera ready' : ''))}
                 </p>
              </div>
            )}
            {/* Error Overlay */}
            {error && !isStarting && ( // Show error only if not currently trying to start
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20 p-4">
                  <Alert variant="destructive" className="w-full max-w-xs">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Scanner Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                    <Button onClick={handleInitialStartClick} variant="secondary" size="sm" className="mt-2 text-xs">
                      <RefreshCw className="mr-1 h-3 w-3" /> Try Again
                    </Button>
                  </Alert>
              </div>
            )}
            <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true"></canvas>
        </div>

        {/* Control Buttons */}
        <div className="flex gap-2 w-full justify-center">
            {/* Show "Start Scanning" only if camera is off */}
            {!isActive && !isStarting && (
                 <Button onClick={handleInitialStartClick} disabled={disabled || isStarting} className="transition-subtle">
                     <Camera className="mr-2 h-4 w-4" /> {buttonText}
                 </Button>
            )}
            {/* Show "Scan Now" and "Stop" only if camera is active */}
            {isActive && (
                <>
                    {/* Enable "Scan Now" only if not already scanning or processing */}
                    <Button onClick={startScanLoop} disabled={isScanning || processingSuccessRef.current || disabled || isStarting} variant="secondary" className="transition-subtle">
                        <ScanLine className="mr-2 h-4 w-4" /> Scan Now
                    </Button>
                    {/* "Stop & Capture" button */}
                    {onManualStop && (
                        <Button onClick={stopScanningAndCapture} disabled={disabled || isStarting} variant="outline" className="transition-subtle">
                            <Ban className="mr-2 h-4 w-4" /> Stop & Capture
                        </Button>
                    )}
                </>
            )}
        </div>


      {/* CSS for animations */}
      <style jsx global>{`
         @keyframes scan-line-vertical {
             0% { transform: translateY(-10%); opacity: 0.5; }
             50% { opacity: 1; }
             100% { transform: translateY(110%); opacity: 0.5; }
         }
         .animate-scan-line-vertical {
             animation: scan-line-vertical 2.5s linear infinite;
             box-shadow: 0 0 8px 1px hsl(var(--accent) / 0.7);
         }
       `}</style>
    </div>
  );
};

export default BarcodeScanner;