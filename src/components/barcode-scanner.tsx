
'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, Ban, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BrowserMultiFormatReader, NotFoundException, ChecksumException, FormatException, DecodeHintType } from '@zxing/library';

interface BarcodeScannerProps {
  onScanSuccess: (imageDataUri: string) => void;
  onScanError?: (error: Error) => void;
  buttonText?: string;
  scanPrompt?: string;
  disabled?: boolean;
  autoStartScanLoop?: boolean; // Controls if scanning starts decoding immediately
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScanSuccess,
  onScanError,
  buttonText = 'Start Scanning',
  scanPrompt = 'Position barcode in front of the camera...',
  disabled = false,
  autoStartScanLoop = true,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number>(); // For requestAnimationFrame loop
  const processingSuccessRef = useRef(false); // Flag to prevent multiple success callbacks

  // State Management
  const [isStarting, setIsStarting] = useState(false); // Camera hardware/permission acquisition
  const [isActive, setIsActive] = useState(false); // Stream acquired, video element visible
  const [isScanning, setIsScanning] = useState(false); // Actively decoding frames
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // --- Cleanup Function ---
  const cleanupCamera = useCallback((caller?: string) => {
    const logPrefix = `[${caller || 'cleanup'}]`;
    console.log(`${logPrefix} Cleaning up camera resources.`);
    processingSuccessRef.current = false; // Reset processing flag

    // Stop scanning loop
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = undefined;
      console.log(`${logPrefix} Cancelled animation frame.`);
    }

    // Reset ZXing reader reference (null check already handles no-op)
    readerRef.current = null;
    console.log(`${logPrefix} Nullified ZXing Reader reference.`);

    // Stop media tracks *before* clearing video source
    if (streamRef.current) {
      console.log(`${logPrefix} Stopping tracks on stream: ${streamRef.current.id}`);
      streamRef.current.getTracks().forEach(track => {
        if (track.readyState === 'live') {
          track.stop();
          console.log(`${logPrefix} Stopped track: ${track.label} (${track.kind}, state: ${track.readyState})`);
        } else {
          console.log(`${logPrefix} Track already stopped: ${track.label} (${track.kind}, state: ${track.readyState})`);
        }
      });
      streamRef.current = null; // Clear stream ref *after* stopping tracks
      console.log(`${logPrefix} Cleared stream ref.`);
    } else {
      console.log(`${logPrefix} No active stream ref found.`);
    }

    // Stop video playback and clear source
    const video = videoRef.current;
    if (video) {
      if (!video.paused) {
        video.pause();
        console.log(`${logPrefix} Paused video playback.`);
      }
      // Important: Set srcObject to null *after* stopping tracks
      if (video.srcObject) {
        video.srcObject = null;
        console.log(`${logPrefix} Cleared video srcObject.`);
      } else {
        console.log(`${logPrefix} Video srcObject was already null.`);
      }
      // Remove event listeners manually if added outside useEffect
       video.removeEventListener('error', handleVideoError);
       console.log(`${logPrefix} Removed video error listener.`);
    }

    // Reset state
    setIsStarting(false);
    setIsActive(false);
    setIsScanning(false);
    console.log(`${logPrefix} State reset (isActive: false, isScanning: false, isStarting: false).`);
  }, []); // No dependencies, uses refs and state setters

   // --- Video Element Error Handling ---
   const handleVideoError = useCallback((event: Event) => {
     console.error('Video Element Error Event:', event);
     const videoError = videoRef.current?.error;
     console.error('Video Element MediaError:', videoError);
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
     cleanupCamera("video error event handler");
   }, [cleanupCamera, toast]); // Dependencies: cleanupCamera, toast

   useEffect(() => {
     const videoElement = videoRef.current;
     if (videoElement) {
       videoElement.addEventListener('error', handleVideoError);
       console.log("Attached video error handler");
     }
     return () => {
       if (videoElement) {
         videoElement.removeEventListener('error', handleVideoError);
         console.log("Removed video error handler");
       }
     };
   }, [handleVideoError]); // Dependency: handleVideoError


  // --- Unmount Cleanup ---
  useEffect(() => {
    return () => {
      console.log("BarcodeScanner: Unmounting. Cleaning up camera.");
      cleanupCamera("unmount");
    };
  }, [cleanupCamera]);

  // --- Frame Capture ---
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const logPrefix = "[CaptureFrame]";

    if (!video || !canvas || !isActive || video.readyState < video.HAVE_CURRENT_DATA || video.videoWidth === 0) {
      console.warn(`${logPrefix} Conditions not met.`, { videoExists: !!video, canvasExists: !!canvas, isActive, readyState: video?.readyState, width: video?.videoWidth });
      return null;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      console.error(`${logPrefix} Canvas context is null.`);
      setError("Failed to get canvas context for frame capture.");
      if (onScanError) onScanError(new Error("Canvas context unavailable."));
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
      setError(errorMsg);
      if (onScanError) onScanError(e instanceof Error ? e : new Error(errorMsg));
      cleanupCamera("captureFrame draw error");
      return null;
    }
  }, [isActive, onScanError, cleanupCamera]); // Dependencies

  // --- Scanning Loop ---
  const runScanLoop = useCallback(() => {
    const logPrefix = "[runScanLoop]";

    if (!isActive || !isScanning || processingSuccessRef.current || !readerRef.current || !videoRef.current) {
      console.log(`${logPrefix} Stopping loop.`, { isActive, isScanning, processing: processingSuccessRef.current, hasReader: !!readerRef.current, hasVideo: !!videoRef.current });
      scanLoopRef.current = undefined;
      return;
    }

    const reader = readerRef.current;
    const videoElement = videoRef.current;

    if (videoElement.readyState >= videoElement.HAVE_ENOUGH_DATA) {
      reader.decodeFromVideoElement(videoElement).then(result => {
        if (processingSuccessRef.current || !isScanning || !isActive) {
          console.log(`${logPrefix} (decode success) Conditions changed, ignoring result.`);
          return;
        }

        console.log(`${logPrefix} Barcode detected:`, result.getText());
        processingSuccessRef.current = true; // Set flag immediately
        setIsScanning(false); // Stop further scanning attempts explicitly

        const imageDataUri = captureFrame();

        if (imageDataUri) {
          console.log(`${logPrefix} Frame captured, calling onScanSuccess.`);
          onScanSuccess(imageDataUri);
          // Parent component handles cleanup or restart
          console.log(`${logPrefix} Scan successful. Loop will stop.`);
        } else {
          console.error(`${logPrefix} Failed to capture frame after barcode detection.`);
          const captureFailError = new Error("Frame capture failed after detection.");
          setError(captureFailError.message);
          if (onScanError) onScanError(captureFailError);
          cleanupCamera("capture frame fail after success"); // Stop on critical error
        }

      }).catch(err => {
        if (processingSuccessRef.current || !isScanning || !isActive) {
           // console.log(`${logPrefix} (decode catch) Conditions changed, ignoring error.`); // Can be noisy
          return;
        }

        if (err instanceof NotFoundException) {
          // Normal case: no barcode found, continue loop
        } else if (err instanceof ChecksumException || err instanceof FormatException) {
          // console.warn(`${logPrefix} Ignoring minor scan error: ${err.name}`); // Optional
        } else {
          console.error(`${logPrefix} Significant error during barcode decoding:`, err);
          const errorMsg = `Scanning error: ${err instanceof Error ? err.message : String(err)}`;
          setError(errorMsg);
          if (onScanError) {
            onScanError(err instanceof Error ? err : new Error(errorMsg));
          }
          cleanupCamera("scan decode error catch"); // Stop on significant error
        }
      });
    }

    // Request the next frame only if conditions are still fully met
    if (isActive && isScanning && !processingSuccessRef.current) {
      scanLoopRef.current = requestAnimationFrame(runScanLoop);
    } else {
      scanLoopRef.current = undefined;
      console.log(`${logPrefix} Not requesting next frame.`, { isActive, isScanning, processing: processingSuccessRef.current });
    }
  }, [isActive, isScanning, captureFrame, onScanSuccess, cleanupCamera, onScanError]); // Dependencies


  // --- Start Camera ---
  const startCamera = useCallback(async () => {
    const logPrefix = "[startCamera]";
    console.log(`${logPrefix} Initiated.`);
    if (isStarting || isActive) {
      console.warn(`${logPrefix} Aborted - already starting or active.`);
      return;
    }
    setError(null);
    setIsStarting(true);
    setIsActive(false);
    setIsScanning(false);
    processingSuccessRef.current = false;

    // Ensure cleanup before starting
    cleanupCamera("startCamera preamble");
    await new Promise(resolve => setTimeout(resolve, 50)); // Shorter delay

    try {
      console.log(`${logPrefix} Requesting media stream...`);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access (getUserMedia) is not supported by this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 640 }, // Request a reasonable resolution
          height: { ideal: 480 }
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

      // Ensure video is muted and plays inline
      video.muted = true;
      video.playsInline = true;

      video.srcObject = stream;
      await video.play(); // Attempt to play the video
      console.log(`${logPrefix} Video playback initiated.`);

      // Initialize ZXing Reader
      const hints = new Map<DecodeHintType, any>();
      // hints.set(DecodeHintType.TRY_HARDER, true); // Can potentially slow down scanning
       hints.set(DecodeHintType.POSSIBLE_FORMATS, [
           // Add formats expected on ID cards, e.g., Code 128, Code 39, PDF417
           1, // CODE_128
           2, // CODE_39
           // 6, // PDF_417 - uncomment if needed
       ]);
      readerRef.current = new BrowserMultiFormatReader(hints, 500); // Increased timeBetweenScansMillis
      console.log(`${logPrefix} ZXing Reader initialized.`);

      // Update state: Camera is now active
      setIsStarting(false); // Finished starting phase
      setIsActive(true);
      processingSuccessRef.current = false;

      // Start scanning loop if autoStartScanLoop is true
      if (autoStartScanLoop) {
        console.log(`${logPrefix} Starting scan loop (autoStartScanLoop=true).`);
        setIsScanning(true);
        if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
        scanLoopRef.current = requestAnimationFrame(runScanLoop);
      } else {
        console.log(`${logPrefix} Scan loop not started (autoStartScanLoop=false).`);
        setIsScanning(false);
      }

    } catch (err: any) {
      console.error(`${logPrefix} Error accessing or starting camera:`, err);
      let message = `Could not access the camera. Error: ${err.name || 'UnknownError'} - ${err.message || 'No details available'}`;
      // Specific error messages
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
           message = 'Camera permission denied. Please allow access in your browser settings and reload the page.';
      } else if (['NotFoundError', 'DevicesNotFoundError'].includes(err.name)) {
           message = 'No camera found. Ensure it is connected, enabled, and not disabled by system settings.';
      } else if (['NotReadableError', 'TrackStartError', 'AbortError', 'OverconstrainedError'].includes(err.name)) {
           message = 'Camera is already in use or could not be started. Please close other applications or browser tabs that might be using the camera and try again.';
      } else if (err.name === 'SecurityError') {
           message = 'Camera access denied due to security settings. This feature requires a secure connection (HTTPS).';
      } else if (err.message && err.message.includes('Invalid constraint') || err.name === 'ConstraintNotSatisfiedError') {
           message = 'The requested camera settings (like resolution or facingMode) are not supported by your device or browser.';
      }
      setError(message);
      toast({ title: 'Camera Error', description: message, variant: 'destructive' });
      if (onScanError) onScanError(err instanceof Error ? err : new Error(message));
      cleanupCamera("startCamera error handler");
      setIsStarting(false); // Ensure starting state is reset on error
    } finally {
      // setIsStarting(false); // Already set in try/catch
      console.log(`${logPrefix} Finished start attempt. Current state:`, { isStarting: isStarting, isActive: isActive, isScanning: isScanning }); // Log final state after attempt
    }
  }, [toast, onScanError, cleanupCamera, autoStartScanLoop, runScanLoop]); // Dependencies


  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-xs">
      {/* Container for Video and Overlays */}
      <div className={`w-full border rounded-lg overflow-hidden shadow-md bg-muted relative aspect-[3/4] ${isActive || isStarting ? 'block' : 'hidden'}`}>
        {/* Video Feed */}
        <video
          ref={videoRef}
          className={`w-full h-full object-cover block bg-black transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`}
          playsInline
          muted
          aria-label="Camera feed for barcode scanning"
        />

        {/* Loading Overlay */}
        {isStarting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white z-10 pointer-events-none">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <p className="text-sm text-muted-foreground">Starting camera...</p>
          </div>
        )}

        {/* Scanning Visual Cue & Prompt */}
        {isActive && (
          <div className="absolute inset-0 pointer-events-none z-5">
            {isScanning && !processingSuccessRef.current && (
              <>
                {/* Vertical Scan Line Animation */}
                <div className="absolute left-0 top-0 w-full h-1 bg-gradient-to-r from-transparent via-accent to-transparent opacity-70 animate-scan-line-vertical"></div>
                {/* Vertical Frame/Overlay */}
                <div className="absolute inset-x-4 inset-y-8 border-2 border-accent/50 rounded pointer-events-none"></div>
              </>
            )}
            {/* Prompt Text */}
            <p className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-center text-xs text-white bg-black/50 px-2 py-1 rounded">
              {isScanning && !processingSuccessRef.current ? scanPrompt : (processingSuccessRef.current ? 'Processing...' : (isActive ? 'Camera ready' : ''))}
            </p>
          </div>
        )}
      </div>

      {/* Control Buttons */}
      <div className="flex gap-4">
        {!isActive && !isStarting && (
          <Button onClick={startCamera} disabled={disabled || isStarting} className="transition-subtle">
            <Camera className="mr-2 h-4 w-4" /> {buttonText}
          </Button>
        )}
         {/* Stop button - can be added back if manual stopping is needed */}
         {/* {isActive && !isStarting && (
           <Button onClick={() => cleanupCamera('manual stop button')} variant="destructive" disabled={disabled}>
             <Ban className="mr-2 h-4 w-4" /> Stop Scanning
           </Button>
         )} */}
      </div>

      {/* Error Display */}
      {error && !isStarting && (
        <Alert variant="destructive" className="w-full mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Scanner Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          {!isActive && (
            <Button onClick={startCamera} variant="ghost" size="sm" className="mt-2 text-xs">
              <RefreshCw className="mr-1 h-3 w-3" /> Try Again
            </Button>
          )}
        </Alert>
      )}

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true"></canvas>

      {/* CSS for animations */}
      <style jsx global>{`
         @keyframes scan-line-vertical {
            0% { transform: translateY(10%); }
            100% { transform: translateY(90%); }
         }
         .animate-scan-line-vertical {
             animation: scan-line-vertical 2.5s linear infinite alternate;
             height: 2px;
             box-shadow: 0 0 5px 1px hsl(var(--accent) / 0.7);
         }
       `}</style>
    </div>
  );
};

export default BarcodeScanner;
