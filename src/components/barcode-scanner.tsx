
'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, Ban, AlertCircle, Loader2, ScanLine } from 'lucide-react'; // Added ScanLine
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BrowserMultiFormatReader, NotFoundException, ChecksumException, FormatException, DecodeHintType, BarcodeFormat } from '@zxing/library';

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
  onManualStop, // Add onManualStop prop
  buttonText = 'Start Scanning',
  scanPrompt = 'Position barcode in front of the camera...',
  disabled = false,
  autoStartScanLoop = false, // Default to false, require manual button press
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number>();
  const processingSuccessRef = useRef(false);

  const [isStarting, setIsStarting] = useState(false); // Start false, trigger on button press
  const [isActive, setIsActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // --- Cleanup Function ---
  const cleanupCamera = useCallback((caller?: string) => {
    const logPrefix = `[${caller || 'cleanup'}]`;
    console.log(`${logPrefix} Cleaning up camera resources.`);
    processingSuccessRef.current = false;

    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = undefined;
      console.log(`${logPrefix} Cancelled animation frame.`);
    }
    setIsScanning(false);

    if (readerRef.current) {
        readerRef.current.reset();
        readerRef.current = null;
        console.log(`${logPrefix} Reset and nullified ZXing Reader reference.`);
    }

    if (streamRef.current) {
      console.log(`${logPrefix} Stopping tracks on stream: ${streamRef.current.id}`);
      streamRef.current.getTracks().forEach(track => {
        if (track.readyState === 'live') {
          track.stop();
          console.log(`${logPrefix} Stopped track: ${track.label} (${track.kind}, state: ${track.readyState})`);
        }
      });
      streamRef.current = null;
      console.log(`${logPrefix} Cleared stream ref.`);
    }

    const video = videoRef.current;
    if (video) {
      if (!video.paused) {
        video.pause();
        console.log(`${logPrefix} Paused video playback.`);
      }
      if (video.srcObject) {
        video.srcObject = null;
        console.log(`${logPrefix} Cleared video srcObject.`);
      }
      // Remove specific listeners added by this component
      video.removeEventListener('error', handleVideoError); // Ensure handler exists
      video.removeEventListener('loadedmetadata', handleLoadedMetadata); // Ensure handler exists
      console.log(`${logPrefix} Removed video event listeners.`);
    }

    setIsActive(false);
    console.log(`${logPrefix} State reset (isActive: false, isScanning: false).`);
  }, []); // handleVideoError and handleLoadedMetadata will be defined below using useCallback

  // --- Frame Capture ---
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const logPrefix = "[CaptureFrame]";

    if (!video || !canvas || !isActive || video.readyState < video.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
      console.warn(`${logPrefix} Conditions not met.`, { videoExists: !!video, canvasExists: !!canvas, isActive, readyState: video?.readyState, width: video?.videoWidth, height: video?.videoHeight });
      return null;
    }

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      console.error(`${logPrefix} Canvas context is null.`);
      const err = new Error("Failed to get canvas context for frame capture.");
      setError(err.message);
      if (onScanError) onScanError(err);
      cleanupCamera("captureFrame context error");
      return null;
    }

    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageDataUri = canvas.toDataURL('image/png');
      console.log(`${logPrefix} Success.`);
      return imageDataUri;
    } catch (e: any) {
      console.error(`${logPrefix} Error during drawImage or toDataURL:`, e);
      const errorMsg = `Failed to capture frame: ${e.message || 'Unknown canvas error'}`;
      const err = e instanceof Error ? e : new Error(errorMsg);
      setError(errorMsg);
      if (onScanError) onScanError(err);
      cleanupCamera("captureFrame draw error");
      return null;
    }
  }, [isActive, onScanError, cleanupCamera]); // Dependencies

  // --- Scanning Loop ---
  // Define runScanLoop before handleLoadedMetadata
  const runScanLoop = useCallback(() => {
    const logPrefix = "[runScanLoop]";

    if (!isActive || !isScanning || processingSuccessRef.current || !readerRef.current || !videoRef.current) {
      scanLoopRef.current = undefined;
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
        processingSuccessRef.current = true;
        setIsScanning(false); // Stop further scanning attempts

        const imageDataUri = captureFrame();

        if (imageDataUri) {
          console.log(`${logPrefix} Frame captured, calling onScanSuccess.`);
          onScanSuccess(imageDataUri);
          // cleanupCamera("scan success"); // Cleanup after successful scan
          // No cleanup here, parent decides if scanning stops via 'disabled' prop or by unmounting
        } else {
          console.error(`${logPrefix} Failed to capture frame AFTER barcode detection.`);
          const captureFailError = new Error("Frame capture failed after detection.");
          setError(captureFailError.message);
          if (onScanError) onScanError(captureFailError);
          cleanupCamera("capture frame fail after success");
        }

      }).catch(err => {
        if (processingSuccessRef.current || !isScanning || !isActive) {
          return;
        }

        if (err instanceof NotFoundException) {
          // No barcode found, continue
        } else if (err instanceof ChecksumException || err instanceof FormatException) {
           console.warn(`${logPrefix} Minor scan error: ${err.name}. Continuing.`);
        } else {
          console.error(`${logPrefix} Significant error during barcode decoding:`, err);
          const errorMsg = `Scanning error: ${err instanceof Error ? err.message : String(err)}`;
          setError(errorMsg);
          if (onScanError) {
            onScanError(err instanceof Error ? err : new Error(errorMsg));
          }
          cleanupCamera("scan decode error catch");
        }
      });
    }

    if (isActive && isScanning && !processingSuccessRef.current) {
      scanLoopRef.current = requestAnimationFrame(runScanLoop);
    } else {
      scanLoopRef.current = undefined;
      console.log(`${logPrefix} Not requesting next frame. Conditions:`, { isActive, isScanning, processing: processingSuccessRef.current });
    }
  }, [isActive, isScanning, captureFrame, onScanSuccess, cleanupCamera, onScanError]); // Dependencies updated


   // --- Video Element Event Handlers ---
   // Define handleVideoError before adding listener
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
     cleanupCamera("video error event handler");
   }, [cleanupCamera, toast, onScanError]); // Dependencies

    // Define handleLoadedMetadata before adding listener, ensure runScanLoop is defined
    const handleLoadedMetadata = useCallback(() => {
        console.log("[loadedmetadata] Video metadata loaded. Dimensions:", videoRef.current?.videoWidth, "x", videoRef.current?.videoHeight);
        if (isActive && !isScanning && !processingSuccessRef.current) {
           // Start scanning loop manually via button, not automatically here unless autoStartScanLoop is true (currently false by default)
           if (autoStartScanLoop) {
               console.log("[loadedmetadata] Auto-starting scan loop.");
               startScanLoop(); // Call the manual start function
           } else {
               console.log("[loadedmetadata] Ready to scan, waiting for manual trigger.");
           }
        }
    }, [isActive, isScanning, autoStartScanLoop, runScanLoop]); // runScanLoop added here


   // Effect to attach/detach video listeners
   useEffect(() => {
     const videoElement = videoRef.current;
     if (videoElement) {
       videoElement.addEventListener('error', handleVideoError);
       videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
       console.log("Attached video event listeners");
     }
     return () => {
       if (videoElement) {
         videoElement.removeEventListener('error', handleVideoError);
         videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
         console.log("Removed video event listeners");
       }
     };
   }, [handleVideoError, handleLoadedMetadata]); // Dependencies updated


  // --- Unmount Cleanup ---
  useEffect(() => {
    // No automatic camera start on mount anymore
    return () => {
      console.log("BarcodeScanner: Unmounting. Cleaning up camera.");
      cleanupCamera("unmount");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanupCamera]); // Only cleanup on unmount


  // --- Start Camera ---
  const startCamera = useCallback(async () => {
    const logPrefix = "[startCamera]";
    console.log(`${logPrefix} Initiated.`);
    if (isActive) {
      console.warn(`${logPrefix} Aborted - already active.`);
      return;
    }
    setError(null);
    setIsStarting(true);
    setIsActive(false);
    setIsScanning(false);
    processingSuccessRef.current = false;

    cleanupCamera("startCamera preamble");
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
        stream.getTracks().forEach(track => track.stop());
        throw new Error("Video element reference is not available.");
      }

      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;

      video.srcObject = stream;
      console.log(`${logPrefix} Set video srcObject. Attempting to play...`);

      await video.play();
      console.log(`${logPrefix} Video playback successfully initiated.`);

      const hints = new Map<DecodeHintType, any>();
       hints.set(DecodeHintType.POSSIBLE_FORMATS, [
           BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13,
           BarcodeFormat.UPC_A, BarcodeFormat.PDF_417,
       ]);
       hints.set(DecodeHintType.TRY_HARDER, true);
      readerRef.current = new BrowserMultiFormatReader(hints, 500);
      console.log(`${logPrefix} ZXing Reader initialized.`);

      setIsStarting(false);
      setIsActive(true);
      processingSuccessRef.current = false;
      console.log(`${logPrefix} Camera active. Ready for manual scan trigger.`);

    } catch (err: any) {
      console.error(`${logPrefix} Error accessing or starting camera:`, err);
      let message = `Could not access or start camera. Error: ${err.name || 'UnknownError'} - ${err.message || 'No details'}`;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
           message = 'Camera permission denied. Please allow access in browser settings and refresh.';
      } else if (['NotFoundError', 'DevicesNotFoundError', 'DeviceCaptureError'].includes(err.name)) {
           message = 'No compatible camera found or camera is unavailable. Ensure it is connected, enabled, and not disabled.';
      } else if (['NotReadableError', 'TrackStartError', 'AbortError', 'OverconstrainedError'].includes(err.name)) {
           message = 'Camera is already in use or could not be started with requested settings. Close other apps/tabs using the camera, or check device compatibility.';
      } else if (err.name === 'SecurityError') {
           message = 'Camera access denied due to security settings (requires HTTPS).';
      }
      setError(message);
      toast({ title: 'Camera Start Error', description: message, variant: 'destructive' });
      if (onScanError) onScanError(err instanceof Error ? err : new Error(message));
      cleanupCamera("startCamera error handler");
      setIsStarting(false);
    } finally {
       console.log(`${logPrefix} Finished start attempt. State:`, { isStarting, isActive, isScanning });
    }
  // Dependencies need to include the handlers cleanupCamera depends on if they change
  }, [toast, onScanError, cleanupCamera, isActive]); // Removed autoStartScanLoop, runScanLoop

  // --- Function to manually start the scanning loop ---
  const startScanLoop = useCallback(() => {
      if (isActive && !isScanning && !processingSuccessRef.current && !disabled) {
          console.log("[ManualStartScanLoop] Starting scan loop.");
          setIsScanning(true);
          processingSuccessRef.current = false; // Ensure flag is reset
          if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
          scanLoopRef.current = requestAnimationFrame(runScanLoop);
      } else {
          console.warn("[ManualStartScanLoop] Cannot start loop. Conditions:", {isActive, isScanning, processing: processingSuccessRef.current, disabled});
      }
  }, [isActive, isScanning, disabled, runScanLoop]); // Dependencies updated


  // --- Function to manually stop scanning and capture frame ---
   const stopScanningAndCapture = useCallback(() => {
       if (!isActive) {
           console.warn("[ManualStop] Cannot stop, camera not active.");
           if (onManualStop) onManualStop(null); // Notify parent, no frame available
           return;
       }
       console.log("[ManualStop] Stopping scan loop and capturing frame.");
       setIsScanning(false); // Stop the loop
       if (scanLoopRef.current) {
           cancelAnimationFrame(scanLoopRef.current);
           scanLoopRef.current = undefined;
       }
       // Capture the current frame
       const frame = captureFrame();
       console.log("[ManualStop] Frame captured:", frame ? frame.substring(0, 50)+"..." : null);
       if (onManualStop) {
           onManualStop(frame); // Send frame (or null) to parent
       }
       cleanupCamera("manual stop"); // Clean up camera after stopping
   }, [isActive, captureFrame, onManualStop, cleanupCamera]);

   // --- Handle initial button press to start camera ---
   const handleInitialStartClick = () => {
       if (!isStarting && !isActive && !disabled) {
           startCamera();
       }
   };

  return (
    <div className={`flex flex-col items-center gap-4 w-full max-w-xs ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>

        {/* Camera View Area */}
        <div className={`w-full aspect-[9/16] border rounded-lg overflow-hidden shadow-md bg-muted relative ${(!isStarting && !isActive) ? 'hidden' : 'block'}`}>
            <video
              ref={videoRef}
              className={`w-full h-full object-cover block bg-black transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`}
              playsInline
              muted
              autoPlay
              aria-label="Camera feed for barcode scanning"
            />
            {isStarting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white z-10 pointer-events-none">
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                <p className="text-sm text-muted-foreground">Starting camera...</p>
              </div>
            )}
             {isActive && (
              <div className="absolute inset-0 pointer-events-none z-5">
                 {/* Vertical Scan Line Animation */}
                 {isScanning && !processingSuccessRef.current && (
                     <div className="absolute left-1/2 top-0 w-[2px] h-full bg-gradient-to-b from-transparent via-accent to-transparent opacity-70 animate-scan-line-vertical"></div>
                 )}
                 {/* Vertical Frame Overlay */}
                 <div className="absolute inset-x-6 inset-y-10 border-2 border-accent/50 rounded pointer-events-none"></div>
                 {/* Prompt Text */}
                 <p className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-center text-xs text-white bg-black/50 px-2 py-1 rounded">
                     {isScanning && !processingSuccessRef.current ? scanPrompt : (processingSuccessRef.current ? 'Processing...' : (isActive ? 'Camera ready' : ''))}
                 </p>
              </div>
            )}
            {error && !isStarting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20 p-4">
                  <Alert variant="destructive" className="w-full max-w-xs">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Scanner Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                    <Button onClick={startCamera} variant="ghost" size="sm" className="mt-2 text-xs">
                      <RefreshCw className="mr-1 h-3 w-3" /> Try Again
                    </Button>
                  </Alert>
              </div>
            )}
            <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true"></canvas>
        </div>

        {/* Control Buttons */}
        <div className="flex gap-2 w-full justify-center">
            {!isActive && !isStarting && (
                 <Button onClick={handleInitialStartClick} disabled={disabled || isStarting} className="transition-subtle">
                     <Camera className="mr-2 h-4 w-4" /> {buttonText}
                 </Button>
            )}
            {isActive && (
                <>
                    <Button onClick={startScanLoop} disabled={isScanning || processingSuccessRef.current || disabled} variant="secondary" className="transition-subtle">
                        <ScanLine className="mr-2 h-4 w-4" /> Scan Now
                    </Button>
                    {onManualStop && (
                        <Button onClick={stopScanningAndCapture} disabled={disabled} variant="outline" className="transition-subtle">
                            <Ban className="mr-2 h-4 w-4" /> Stop & Capture
                        </Button>
                    )}
                </>
            )}
        </div>


      {/* CSS for animations */}
      <style jsx global>{`
         @keyframes scan-line-vertical {
             0% { transform: translateY(0%); }
             100% { transform: translateY(100%); }
         }
         .animate-scan-line-vertical {
             animation: scan-line-vertical 2s linear infinite;
             box-shadow: 0 0 8px 2px hsl(var(--accent) / 0.7);
         }
       `}</style>
    </div>
  );
};

export default BarcodeScanner;

    