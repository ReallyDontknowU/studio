
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
    processingSuccessRef.current = false; // Reset processing flag

    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = undefined;
      console.log(`${logPrefix} Cancelled animation frame.`);
    }
    // No need to set isScanning false here, happens in startCamera/stopScanning/error handlers

    // Stop and release the stream tracks *first*
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
        video.srcObject = null; // Detach the stream from the element
        console.log(`${logPrefix} Cleared video srcObject.`);
      } else {
        console.log(`${logPrefix} Video srcObject already null.`);
      }
      if (!video.paused) {
        video.pause(); // Pause video playback
        console.log(`${logPrefix} Paused video playback.`);
      }
      // Remove specific listeners added by this component
      // Ensure handlers exist before removing
      if (typeof handleVideoError === 'function') video.removeEventListener('error', handleVideoError);
      if (typeof handleLoadedMetadata === 'function') video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      console.log(`${logPrefix} Removed video event listeners (if attached).`);
    } else {
      console.log(`${logPrefix} No video element ref to cleanup.`);
    }

     // Finally, reset the reader
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
    setIsActive(false);
    setIsScanning(false);
    // Keep isStarting as is, it's managed by startCamera flow
    // Do not reset error here, let the caller manage error display state
    console.log(`${logPrefix} State reset (isActive: false, isScanning: false). Cleanup finished.`);
  }, []); // Add handleVideoError, handleLoadedMetadata once defined


  // --- Frame Capture ---
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const logPrefix = "[CaptureFrame]";

    if (!video || !canvas || !isActive || video.readyState < video.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
      console.warn(`${logPrefix} Conditions not met for capture.`, { videoExists: !!video, canvasExists: !!canvas, isActive, readyState: video?.readyState, width: video?.videoWidth, height: video?.videoHeight });
      // Don't trigger cleanup here, just fail the capture
      return null;
    }

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      console.error(`${logPrefix} Canvas context is null.`);
      const err = new Error("Failed to get canvas context for frame capture.");
      setError(err.message);
      if (onScanError) onScanError(err);
      // Don't cleanup here unless it's a fatal canvas issue
      return null;
    }

    try {
      // Match canvas size to the actual video dimensions to avoid distortion
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageDataUri = canvas.toDataURL('image/png'); // PNG is generally better for IDs than JPEG
      console.log(`${logPrefix} Success. Length: ${imageDataUri.length}`);
      return imageDataUri;
    } catch (e: any) {
      console.error(`${logPrefix} Error during drawImage or toDataURL:`, e);
      const errorMsg = `Failed to capture frame: ${e.message || 'Unknown canvas error'}`;
      const err = e instanceof Error ? e : new Error(errorMsg);
      setError(errorMsg);
      if (onScanError) onScanError(err);
      // Don't cleanup here unless it's a fatal canvas issue
      return null;
    }
  }, [isActive, onScanError]); // Dependencies

  // --- Scanning Loop ---
  const runScanLoop = useCallback(() => {
    const logPrefix = "[runScanLoop]";

    if (!isActive || !isScanning || processingSuccessRef.current || !readerRef.current || !videoRef.current) {
      console.log(`${logPrefix} Stopping loop request. Conditions:`, { isActive, isScanning, processing: processingSuccessRef.current, reader: !!readerRef.current, video: !!videoRef.current });
      scanLoopRef.current = undefined; // Ensure loop stops
      return;
    }

    const reader = readerRef.current;
    const videoElement = videoRef.current;

    // Check video readiness
    if (videoElement.readyState >= videoElement.HAVE_CURRENT_DATA && videoElement.videoWidth > 0) {
      reader.decodeFromVideoElement(videoElement).then(result => {
        // Re-check conditions after async operation
        if (processingSuccessRef.current || !isScanning || !isActive) {
          console.log(`${logPrefix} (decode success) Conditions changed post-decode, ignoring result.`);
          return;
        }

        console.log(`${logPrefix} Barcode detected:`, result.getText());
        processingSuccessRef.current = true; // Set flag immediately
        setIsScanning(false); // Stop further scanning attempts visually/logically

        const imageDataUri = captureFrame();

        if (imageDataUri) {
          console.log(`${logPrefix} Frame captured, calling onScanSuccess.`);
          onScanSuccess(imageDataUri); // Pass the captured frame
          // Let the parent component decide whether to stop/cleanup via the 'disabled' prop or unmounting.
        } else {
          console.error(`${logPrefix} Failed to capture frame AFTER barcode detection.`);
          const captureFailError = new Error("Frame capture failed after detection.");
          setError(captureFailError.message);
          if (onScanError) onScanError(captureFailError);
          cleanupCamera("capture frame fail after success"); // Cleanup on critical error
        }

      }).catch(err => {
         // Re-check conditions after async operation
        if (processingSuccessRef.current || !isScanning || !isActive) {
             console.log(`${logPrefix} (decode error) Conditions changed post-decode, ignoring error.`);
             return;
        }

        if (err instanceof NotFoundException) {
          // Normal case: No barcode found in this frame, continue loop
        } else if (err instanceof ChecksumException || err instanceof FormatException) {
           console.warn(`${logPrefix} Minor scan error (Checksum/Format): ${err.message}. Continuing.`);
        } else {
          // More significant error
          console.error(`${logPrefix} Significant error during barcode decoding:`, err);
          const errorMsg = `Scanning error: ${err instanceof Error ? err.message : String(err)}`;
          setError(errorMsg);
          if (onScanError) {
            onScanError(err instanceof Error ? err : new Error(errorMsg));
          }
          cleanupCamera("scan decode error catch"); // Cleanup on significant error
        }
      });
    } else {
        console.warn(`${logPrefix} Video not ready for decoding. State: ${videoElement.readyState}, Width: ${videoElement.videoWidth}`);
    }

    // Request next frame ONLY if still active and scanning
    if (isActive && isScanning && !processingSuccessRef.current) {
      scanLoopRef.current = requestAnimationFrame(runScanLoop);
    } else {
      console.log(`${logPrefix} Not requesting next frame. Loop should stop.`);
      scanLoopRef.current = undefined;
    }
  }, [isActive, isScanning, captureFrame, onScanSuccess, cleanupCamera, onScanError]); // Dependencies updated


   // --- Video Element Event Handlers ---
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

    const handleLoadedMetadata = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        console.log("[loadedmetadata] Video metadata loaded. Dimensions:", video.videoWidth, "x", video.videoHeight);
        // Adjust aspect ratio of the container based on loaded metadata if needed
        // e.g., video.parentElement.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;

        if (isActive && !isScanning && !processingSuccessRef.current && autoStartScanLoop) {
            console.log("[loadedmetadata] Auto-starting scan loop.");
            startScanLoop(); // Now calls the function to start the loop
        } else {
            console.log("[loadedmetadata] Ready to scan, waiting for trigger. Conditions:", {isActive, isScanning, processing: processingSuccessRef.current, autoStart: autoStartScanLoop});
        }
    }, [isActive, isScanning, autoStartScanLoop, runScanLoop]); // runScanLoop should be stable, but include if needed


   // Effect to attach/detach video listeners
   useEffect(() => {
     const videoElement = videoRef.current;
     if (videoElement && isActive) { // Only attach when camera is supposed to be active
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
   }, [isActive, handleVideoError, handleLoadedMetadata]); // Re-run if isActive changes


  // --- Unmount Cleanup ---
  useEffect(() => {
    // Return the cleanup function to be called on unmount
    return () => {
      console.log("BarcodeScanner: Unmounting. Cleaning up camera.");
      cleanupCamera("unmount");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array: Run only once on mount for unmount cleanup


  // --- Start Camera ---
  const startCamera = useCallback(async () => {
    const logPrefix = "[startCamera]";
    console.log(`${logPrefix} Attempting to start camera...`);
    if (isStarting || isActive) { // Prevent multiple concurrent starts
      console.warn(`${logPrefix} Aborted - already starting or active.`);
      return;
    }
    setError(null);
    setIsStarting(true); // Indicate starting phase
    setIsActive(false); // Ensure not marked active yet
    setIsScanning(false);
    processingSuccessRef.current = false;

    // Explicitly call cleanup *before* trying to acquire new resources
    console.log(`${logPrefix} Performing pre-start cleanup.`);
    cleanupCamera("startCamera preamble");
    // Add a small delay to allow hardware/browser to release resources fully
    await new Promise(resolve => setTimeout(resolve, 200)); // Increased delay slightly

    try {
      console.log(`${logPrefix} Requesting media stream...`);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access (getUserMedia) is not supported by this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment", // Prioritize rear camera
          width: { ideal: 1280 }, // Request HD-ish resolution
          height: { ideal: 720 },
          // frameRate: { ideal: 15 } // Lower framerate might help performance/stability
        },
        audio: false,
      });
      console.log(`${logPrefix} Stream obtained:`, stream.id);
      streamRef.current = stream; // Store the stream reference *immediately*

      const video = videoRef.current;
      if (!video) {
        // If video ref is gone, cleanup stream and throw
        cleanupCamera("startCamera no video ref");
        throw new Error("Video element reference is not available.");
      }

      // Configure video element
      video.muted = true; // Mute audio to prevent feedback loops if audio was accidentally requested
      video.playsInline = true; // Important for mobile browsers
      video.autoplay = true; // Ensure autoplay is set

      // Detach any old stream *before* attaching the new one
      if (video.srcObject) {
          console.log(`${logPrefix} Detaching existing srcObject before setting new one.`);
          video.srcObject = null;
      }

      video.srcObject = stream; // Attach the new stream
      console.log(`${logPrefix} Set video srcObject.`);

      // Use a promise to wait for video play
      await video.play();
      console.log(`${logPrefix} Video playback successfully initiated.`);

      // Initialize ZXing Reader
      const hints = new Map<DecodeHintType, any>();
       hints.set(DecodeHintType.POSSIBLE_FORMATS, [
           BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13,
           BarcodeFormat.UPC_A, BarcodeFormat.PDF_417, // Common ID card formats
       ]);
       hints.set(DecodeHintType.TRY_HARDER, true); // Spend more time trying to decode
      readerRef.current = new BrowserMultiFormatReader(hints, 500); // 500ms between scans
      console.log(`${logPrefix} ZXing Reader initialized.`);

      // Update state *after* successful setup
      setIsActive(true);
      processingSuccessRef.current = false; // Ensure processing flag is false
      console.log(`${logPrefix} Camera active. Ready.`);

    } catch (err: any) {
      console.error(`${logPrefix} Error accessing or starting camera:`, err);
      // Provide more specific error messages
      let message = `Could not start camera. Error: ${err.name || 'UnknownError'} - ${err.message || 'No details'}`;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
           message = 'Camera permission denied. Please allow access in browser settings and refresh.';
      } else if (['NotFoundError', 'DevicesNotFoundError'].includes(err.name)) {
           message = 'No compatible camera found. Ensure it is connected and enabled.';
      } else if (['NotReadableError', 'TrackStartError', 'AbortError', 'OverconstrainedError'].includes(err.name)) {
           // This is the common "already in use" or hardware error
           message = 'Camera is already in use or could not be started. Close other apps/tabs using the camera, ensure it is connected, and refresh.';
      } else if (err.name === 'SecurityError') {
           message = 'Camera access denied due to security settings (requires HTTPS).';
      }
      setError(message);
      toast({ title: 'Camera Start Error', description: message, variant: 'destructive' });
      if (onScanError) onScanError(err instanceof Error ? err : new Error(message));
      cleanupCamera("startCamera error handler"); // Ensure cleanup on error
    } finally {
       setIsStarting(false); // Finished starting attempt (success or fail)
       console.log(`${logPrefix} Finished start attempt. State:`, { isStarting, isActive, isScanning });
    }
  }, [toast, onScanError, cleanupCamera, isActive, isStarting]); // Dependencies


  // --- Function to manually start the scanning loop ---
  const startScanLoop = useCallback(() => {
      if (isActive && !isScanning && !processingSuccessRef.current && !disabled) {
          console.log("[ManualStartScanLoop] Starting scan loop.");
          setIsScanning(true);
          processingSuccessRef.current = false; // Ensure flag is reset
          if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current); // Clear any previous loop just in case
          scanLoopRef.current = requestAnimationFrame(runScanLoop);
      } else {
          console.warn("[ManualStartScanLoop] Cannot start loop. Conditions:", {isActive, isScanning, processing: processingSuccessRef.current, disabled});
      }
  }, [isActive, isScanning, disabled, runScanLoop]); // Dependencies updated


  // --- Function to manually stop scanning and capture frame ---
   const stopScanningAndCapture = useCallback(() => {
       const logPrefix = "[ManualStop]";
       if (!isActive && !isStarting) { // Check isStarting as well
           console.warn(`${logPrefix} Cannot stop, camera not active or starting.`);
           if (onManualStop) onManualStop(null); // Notify parent, no frame available
           return;
       }
       console.log(`${logPrefix} Stopping scan loop and capturing frame.`);
       setIsScanning(false); // Stop the loop logic
       if (scanLoopRef.current) {
           cancelAnimationFrame(scanLoopRef.current);
           scanLoopRef.current = undefined;
           console.log(`${logPrefix} Cancelled animation frame.`);
       } else {
            console.log(`${logPrefix} No active scan loop frame to cancel.`);
       }

       // Capture the current frame if camera is active
       let frame: string | null = null;
       if (isActive) {
           frame = captureFrame();
           console.log(`${logPrefix} Frame captured:`, frame ? `data:image/png;base64,...(${frame.length})` : null);
       } else {
           console.log(`${logPrefix} Camera not active, cannot capture frame.`);
       }

       // Notify parent with the captured frame (or null)
       if (onManualStop) {
           onManualStop(frame);
       }

       // Cleanup camera resources after stopping
       cleanupCamera("manual stop");
   }, [isActive, isStarting, captureFrame, onManualStop, cleanupCamera]); // Added isStarting dependency


   // --- Handle initial button press to start camera ---
   const handleInitialStartClick = () => {
       if (!isStarting && !isActive && !disabled) {
           console.log("HandleInitialStartClick: Triggering startCamera().");
           startCamera();
       } else {
            console.log("HandleInitialStartClick: Ignoring click. Conditions:", {isStarting, isActive, disabled});
       }
   };

  return (
    <div className={`flex flex-col items-center gap-4 w-full max-w-xs ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>

        {/* Camera View Area */}
        {/* Use aspect-[3/4] for vertical ID cards */}
        <div className={`w-full aspect-[3/4] border rounded-lg overflow-hidden shadow-md bg-muted relative ${(!isStarting && !isActive) ? 'hidden' : 'block'}`}>
            <video
              ref={videoRef}
              // Ensure video fills the container, object-cover might crop, object-contain might show bars
              className={`w-full h-full object-cover block bg-black transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`}
              playsInline // Crucial for iOS
              muted // Necessary for autoplay without user interaction
              autoPlay // Try to play automatically
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
                 {/* Vertical Scan Line Animation (thin) */}
                 {isScanning && !processingSuccessRef.current && (
                     <div className="absolute left-1/2 top-0 w-0.5 h-full bg-gradient-to-b from-transparent via-accent to-transparent opacity-70 animate-scan-line-vertical"></div>
                 )}
                 {/* Vertical Frame Overlay (taller rectangle) */}
                 {/* Adjust inset-x and inset-y to create a taller rectangle */}
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
                    {/* Try Again Button */}
                    <Button onClick={handleInitialStartClick} variant="secondary" size="sm" className="mt-2 text-xs">
                      <RefreshCw className="mr-1 h-3 w-3" /> Try Again
                    </Button>
                  </Alert>
              </div>
            )}
            {/* Hidden Canvas for Frame Capture */}
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
                    <Button onClick={startScanLoop} disabled={isScanning || processingSuccessRef.current || disabled} variant="secondary" className="transition-subtle">
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
             box-shadow: 0 0 8px 1px hsl(var(--accent) / 0.7); /* Subtle glow */
         }
       `}</style>
    </div>
  );
};

export default BarcodeScanner;
