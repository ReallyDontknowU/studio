
'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, Ban, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BrowserMultiFormatReader, NotFoundException, ChecksumException, FormatException, DecodeHintType, BarcodeFormat } from '@zxing/library'; // Added BarcodeFormat

interface BarcodeScannerProps {
  onScanSuccess: (imageDataUri: string) => void;
  onScanError?: (error: Error) => void;
  buttonText?: string; // Text for the button that INITIATES scanning
  scanPrompt?: string;
  disabled?: boolean; // Disables the entire component (e.g., during parent processing)
  autoStartScanLoop?: boolean; // Controls if scanning starts decoding immediately AFTER camera starts
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScanSuccess,
  onScanError,
  buttonText = 'Start Scanning', // Default text for the initial start button (if shown by parent)
  scanPrompt = 'Position barcode in front of the camera...',
  disabled = false,
  autoStartScanLoop = true, // Default to start decoding once camera is ready
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number>(); // For requestAnimationFrame loop
  const processingSuccessRef = useRef(false); // Flag to prevent multiple success callbacks in a single scan session

  // State Management
  const [isStarting, setIsStarting] = useState(true); // Assume starting on mount to get camera ready
  const [isActive, setIsActive] = useState(false); // Stream acquired, video element visible and playing
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
    setIsScanning(false); // Ensure scanning state is false

    // Reset ZXing reader reference
    if (readerRef.current) {
        readerRef.current.reset(); // Use reset method if available
        readerRef.current = null;
        console.log(`${logPrefix} Reset and nullified ZXing Reader reference.`);
    }

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
       video.removeEventListener('loadedmetadata', handleLoadedMetadata); // Remove metadata listener
       console.log(`${logPrefix} Removed video event listeners.`);
    }

    // Reset state, but keep isStarting potentially true if we intend to restart immediately
    // setIsStarting(false); // Let the parent decide when to stop starting attempts
    setIsActive(false);
    // setIsScanning(false); // Already done
    console.log(`${logPrefix} State reset (isActive: false, isScanning: false).`);
  }, []); // No dependencies, uses refs and state setters

   // --- Video Element Event Handlers ---
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
     if (onScanError) onScanError(new Error(message)); // Notify parent
     cleanupCamera("video error event handler");
   }, [cleanupCamera, toast, onScanError]); // Dependencies

    const handleLoadedMetadata = useCallback(() => {
        console.log("[loadedmetadata] Video metadata loaded. Dimensions:", videoRef.current?.videoWidth, "x", videoRef.current?.videoHeight);
        // Now it's safe to start the scanning loop if intended
        if (isActive && autoStartScanLoop && !isScanning && !processingSuccessRef.current) {
           console.log("[loadedmetadata] Triggering scan loop start.");
           setIsScanning(true);
           if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
           scanLoopRef.current = requestAnimationFrame(runScanLoop);
        }
    }, [isActive, autoStartScanLoop, isScanning, runScanLoop]); // Dependencies

   useEffect(() => {
     const videoElement = videoRef.current;
     if (videoElement) {
       videoElement.addEventListener('error', handleVideoError);
       videoElement.addEventListener('loadedmetadata', handleLoadedMetadata); // Add listener
       console.log("Attached video event listeners");
     }
     return () => {
       if (videoElement) {
         videoElement.removeEventListener('error', handleVideoError);
         videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata); // Remove listener
         console.log("Removed video event listeners");
       }
     };
   }, [handleVideoError, handleLoadedMetadata]); // Dependencies


  // --- Unmount Cleanup ---
  useEffect(() => {
    // Attempt to start camera on mount
    startCamera();
    return () => {
      console.log("BarcodeScanner: Unmounting. Cleaning up camera.");
      cleanupCamera("unmount");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanupCamera]); // Only run on mount and unmount


  // --- Frame Capture ---
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const logPrefix = "[CaptureFrame]";

    if (!video || !canvas || !isActive || video.readyState < video.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
      console.warn(`${logPrefix} Conditions not met.`, { videoExists: !!video, canvasExists: !!canvas, isActive, readyState: video?.readyState, width: video?.videoWidth, height: video?.videoHeight });
      return null;
    }

    const context = canvas.getContext('2d', { willReadFrequently: true }); // Optimize for frequent reads
    if (!context) {
      console.error(`${logPrefix} Canvas context is null.`);
      const err = new Error("Failed to get canvas context for frame capture.");
      setError(err.message);
      if (onScanError) onScanError(err);
      cleanupCamera("captureFrame context error");
      return null;
    }

    try {
      // Match canvas size to video dimensions
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw the current video frame onto the canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Get the image data as a PNG Data URI
      const imageDataUri = canvas.toDataURL('image/png'); // PNG is generally good quality
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
  const runScanLoop = useCallback(() => {
    const logPrefix = "[runScanLoop]";

    // Crucial checks to prevent running unnecessarily
    if (!isActive || !isScanning || processingSuccessRef.current || !readerRef.current || !videoRef.current) {
      // console.log(`${logPrefix} Stopping loop check.`, { isActive, isScanning, processing: processingSuccessRef.current, hasReader: !!readerRef.current, hasVideo: !!videoRef.current });
      scanLoopRef.current = undefined;
      return;
    }

    const reader = readerRef.current;
    const videoElement = videoRef.current;

    // Ensure the video is ready and has dimensions
    if (videoElement.readyState >= videoElement.HAVE_CURRENT_DATA && videoElement.videoWidth > 0) {
       // console.log(`${logPrefix} Decoding frame...`); // Can be noisy
      reader.decodeFromVideoElement(videoElement).then(result => {
        // Double-check conditions *after* async operation resolves
        if (processingSuccessRef.current || !isScanning || !isActive) {
          console.log(`${logPrefix} (decode success) Conditions changed post-decode, ignoring result.`);
          return;
        }

        console.log(`${logPrefix} Barcode detected:`, result.getText());
        processingSuccessRef.current = true; // Set flag immediately to prevent further processing
        setIsScanning(false); // Stop further scanning attempts

        const imageDataUri = captureFrame();

        if (imageDataUri) {
          console.log(`${logPrefix} Frame captured, calling onScanSuccess.`);
          onScanSuccess(imageDataUri);
          // Parent component is now responsible for handling the result and potentially stopping/restarting the scanner.
          // We DO NOT cleanup here, let the parent decide based on the success callback.
          console.log(`${logPrefix} Scan successful. Loop stopped (isScanning=false). Parent should handle next step.`);
        } else {
          console.error(`${logPrefix} Failed to capture frame AFTER barcode detection.`);
          const captureFailError = new Error("Frame capture failed after detection.");
          setError(captureFailError.message);
          if (onScanError) onScanError(captureFailError);
          cleanupCamera("capture frame fail after success"); // Stop on critical error
        }

      }).catch(err => {
        // Double-check conditions *after* async operation rejects
        if (processingSuccessRef.current || !isScanning || !isActive) {
           // console.log(`${logPrefix} (decode catch) Conditions changed post-decode, ignoring error.`);
          return;
        }

        if (err instanceof NotFoundException) {
          // Normal case: no barcode found, continue loop
          // console.log(`${logPrefix} No barcode found.`); // Can be noisy
        } else if (err instanceof ChecksumException || err instanceof FormatException) {
           console.warn(`${logPrefix} Minor scan error: ${err.name}. Continuing.`);
        } else {
          // More significant error
          console.error(`${logPrefix} Significant error during barcode decoding:`, err);
          const errorMsg = `Scanning error: ${err instanceof Error ? err.message : String(err)}`;
          setError(errorMsg);
          if (onScanError) {
            onScanError(err instanceof Error ? err : new Error(errorMsg));
          }
          cleanupCamera("scan decode error catch"); // Stop on significant error
        }
      });
    } else {
        // console.log(`${logPrefix} Video not ready for decoding.`); // Can be noisy
    }

    // Request the next frame only if conditions are still fully met
    if (isActive && isScanning && !processingSuccessRef.current) {
      scanLoopRef.current = requestAnimationFrame(runScanLoop);
    } else {
      scanLoopRef.current = undefined;
      console.log(`${logPrefix} Not requesting next frame. Conditions:`, { isActive, isScanning, processing: processingSuccessRef.current });
    }
  }, [isActive, isScanning, captureFrame, onScanSuccess, cleanupCamera, onScanError]); // Dependencies


  // --- Start Camera ---
  const startCamera = useCallback(async () => {
    const logPrefix = "[startCamera]";
    console.log(`${logPrefix} Initiated.`);
    if (isActive) { // Only check if already active, allow retrying if starting failed
      console.warn(`${logPrefix} Aborted - already active.`);
      return;
    }
    setError(null);
    setIsStarting(true); // Indicate attempt to start
    setIsActive(false);
    setIsScanning(false);
    processingSuccessRef.current = false;

    // Perform cleanup before starting a new session
    cleanupCamera("startCamera preamble");
    // Short delay might help ensure resources are released
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      console.log(`${logPrefix} Requesting media stream...`);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access (getUserMedia) is not supported by this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment", // Prefer rear camera
          width: { ideal: 1280 }, // Request HD resolution if possible
          height: { ideal: 720 },
          // aspectRatio: { ideal: 9 / 16 } // Request vertical aspect ratio if supported
        },
        audio: false,
      });
      console.log(`${logPrefix} Stream obtained:`, stream.id);
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach(track => track.stop()); // Clean up stream if video element isn't ready
        throw new Error("Video element reference is not available.");
      }

      // Ensure video attributes are set correctly
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true; // Ensure autoplay is set

      video.srcObject = stream;
      console.log(`${logPrefix} Set video srcObject. Attempting to play...`);

      // Use a promise to wait for play() to complete or fail
      await video.play();
      console.log(`${logPrefix} Video playback successfully initiated.`);

      // Initialize ZXing Reader after successful playback start
      const hints = new Map<DecodeHintType, any>();
       hints.set(DecodeHintType.POSSIBLE_FORMATS, [
           BarcodeFormat.CODE_128,
           BarcodeFormat.CODE_39,
           BarcodeFormat.EAN_13,
           BarcodeFormat.UPC_A,
           BarcodeFormat.PDF_417,
           // Add other relevant formats if needed
       ]);
       hints.set(DecodeHintType.TRY_HARDER, true); // May improve detection but use more resources
      // Increased timeBetweenScansMillis to reduce CPU load slightly
      readerRef.current = new BrowserMultiFormatReader(hints, 500);
      console.log(`${logPrefix} ZXing Reader initialized.`);

      // Update state: Camera is now active
      setIsStarting(false); // Finished starting phase
      setIsActive(true);
      processingSuccessRef.current = false; // Ensure flag is reset

      // Start scanning loop IF autoStartScanLoop is true and metadata is loaded (handled by 'loadedmetadata' event)
      console.log(`${logPrefix} Camera active. Waiting for metadata to start scan loop (if autoStartScanLoop=${autoStartScanLoop}).`);
      // setIsScanning will be set to true by handleLoadedMetadata if autoStartScanLoop is true

    } catch (err: any) {
      console.error(`${logPrefix} Error accessing or starting camera:`, err);
      let message = `Could not access or start camera. Error: ${err.name || 'UnknownError'} - ${err.message || 'No details'}`;
      // Provide more specific feedback based on error name
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
           message = 'Camera permission denied. Please allow access in browser settings and refresh.';
      } else if (['NotFoundError', 'DevicesNotFoundError', 'DeviceCaptureError'].includes(err.name)) { // Added DeviceCaptureError
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
      setIsStarting(false); // Stop the starting indicator on error
    } finally {
       // Log final state after attempt
       console.log(`${logPrefix} Finished start attempt. State:`, { isStarting, isActive, isScanning });
    }
  }, [toast, onScanError, cleanupCamera, autoStartScanLoop, isActive, isScanning, runScanLoop]); // Added isActive, isScanning, runScanLoop


  return (
    // Changed container to aspect-[9/16] for a vertical orientation preference
    <div className={`flex flex-col items-center gap-4 w-full max-w-xs aspect-[9/16] border rounded-lg overflow-hidden shadow-md bg-muted relative ${!isStarting && !isActive ? 'hidden' : ''}`}>

        {/* Video Feed - Ensure it fills the container */}
        <video
          ref={videoRef}
          className={`w-full h-full object-cover block bg-black transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`}
          playsInline
          muted
          autoPlay // Ensure autoplay is present
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
                 {/* Vertical Scan Line Animation (adjust position for vertical) */}
                 <div className="absolute left-1/2 top-0 w-1 h-full bg-gradient-to-b from-transparent via-accent to-transparent opacity-70 animate-scan-line-horizontal"></div>
                 {/* Vertical Frame/Overlay (adjust dimensions for vertical) */}
                 {/* Make it slightly narrower and taller */}
                 <div className="absolute inset-x-6 inset-y-10 border-2 border-accent/50 rounded pointer-events-none"></div>
              </>
            )}
            {/* Prompt Text */}
            <p className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-center text-xs text-white bg-black/50 px-2 py-1 rounded">
              {isScanning && !processingSuccessRef.current ? scanPrompt : (processingSuccessRef.current ? 'Processing...' : (isActive ? 'Camera ready' : ''))}
            </p>
          </div>
        )}


      {/* Error Display */}
      {error && !isStarting && ( // Only show error if not currently trying to start
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

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true"></canvas>

      {/* CSS for animations (Adjusted for horizontal line on vertical view) */}
      <style jsx global>{`
         @keyframes scan-line-horizontal {
            0% { transform: translateX(10%); }
            100% { transform: translateX(90%); }
         }
         .animate-scan-line-horizontal {
             animation: scan-line-horizontal 2.5s linear infinite alternate;
             width: 2px; /* Line width */
             box-shadow: 0 0 5px 1px hsl(var(--accent) / 0.7);
         }
       `}</style>
    </div>
  );
};

export default BarcodeScanner;

    