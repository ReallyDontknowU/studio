
'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, AlertCircle, Loader2, ScanLine, VideoOff, StopCircle } from 'lucide-react'; // Added VideoOff, StopCircle
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BrowserMultiFormatReader, NotFoundException, ChecksumException, FormatException, DecodeHintType, BarcodeFormat, Exception as ZXingException } from '@zxing/library';
import Image from 'next/image'; // Keep Image import for potential future use

interface BarcodeScannerProps {
  onScanSuccess: (imageDataUri: string) => void;
  onScanError?: (error: Error) => void;
  scanPrompt?: string;
  disabled?: boolean;
  onManualStop?: (imageDataUri: string | null) => void; // Add manual stop handler prop
  // Add state props for managing captured image externally if needed
  // capturedImageUri: string | null;
  // setCapturedImageUri: (uri: string | null) => void;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScanSuccess,
  onScanError,
  scanPrompt = 'Position barcode in front of the camera...',
  disabled = false,
  onManualStop // Destructure the new prop
  // capturedImageUri, // Use external state if provided
  // setCapturedImageUri // Use external state setter if provided
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processingSuccessRef = useRef(false);

  const [isStarting, setIsStarting] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null); // Track permission explicitly
  const { toast } = useToast();

  // Internal state for captured image if external state is not used
  const [internalCapturedImageUri, setInternalCapturedImageUri] = useState<string | null>(null);

  // Determine which state and setter to use
  // const currentCapturedImageUri = capturedImageUri !== undefined ? capturedImageUri : internalCapturedImageUri;
  // const setCurrentCapturedImageUri = setCapturedImageUri !== undefined ? setCapturedImageUri : setInternalCapturedImageUri;
   // Always use internal state for captured image within the scanner itself
   const currentCapturedImageUri = internalCapturedImageUri;
   const setCurrentCapturedImageUri = setInternalCapturedImageUri;


  // --- Cleanup Function ---
  const cleanupCamera = useCallback((caller?: string) => {
    const logPrefix = `[Cleanup ${caller || 'unknown'}]`;
    console.log(`${logPrefix} Starting cleanup...`);
    processingSuccessRef.current = false; // Reset processing flag

    // Stop the scanning loop flag first
    setIsScanning(false); // Explicitly set scanning to false

    // Then stop and release the stream tracks
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

    // Detach from video element
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
        // Explicitly remove event listeners
        video.removeEventListener('error', handleVideoError);
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('play', handleVideoPlay);
        console.log(`${logPrefix} Explicitly removed video event listeners.`);
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
    setIsActive(false); // Ensure active state is false
    setIsStarting(false); // Ensure starting state is false
    // Do not reset error here, let the caller decide
    console.log(`${logPrefix} Cleanup finished.`);
  // Removed setCurrentCapturedImageUri from deps, it's derived from useState and stable
  // }, [handleVideoError, handleLoadedMetadata, handleVideoPlay]);
  }, []); // Empty deps, handlers are stable callbacks defined below


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
      cleanupCamera("captureFrame context error");
      return null;
    }

    try {
      // Match canvas dimensions to video stream for accurate capture
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw the current video frame onto the canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert the canvas content to a PNG data URI
      const imageDataUri = canvas.toDataURL('image/png');
      console.log(`${logPrefix} Success. Frame captured. Length: ${imageDataUri.length}`);
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
  }, [isActive, onScanError, cleanupCamera]);


  // --- Handle Manual Stop ---
  const handleStopClick = useCallback(() => {
    const logPrefix = "[handleStopClick]";
    console.log(`${logPrefix} Manual stop requested.`);

    // Capture the current frame *before* cleaning up
    const lastFrameUri = captureFrame();
    if (lastFrameUri) {
      setCurrentCapturedImageUri(lastFrameUri); // Update internal state with the last frame
    }

    // Stop scanning loop and release resources
    cleanupCamera("manual stop");

    // Call the onManualStop callback with the captured frame (or null)
    if (onManualStop) {
      console.log(`${logPrefix} Calling onManualStop with image URI (or null):`, lastFrameUri ? 'Yes' : 'No');
      onManualStop(lastFrameUri);
    } else {
       console.warn(`${logPrefix} onManualStop handler not provided.`);
    }
  }, [cleanupCamera, onManualStop, captureFrame, setCurrentCapturedImageUri]); // Dependencies


   // --- Event Handlers (defined with useCallback for stability) ---
    const handleVideoError = useCallback((event: Event) => {
        console.error('Video Element Error Event:', event);
        const videoElement = event.target as HTMLVideoElement;
        const videoError = videoElement?.error;
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
    }, [toast, onScanError, cleanupCamera]);

    const handleLoadedMetadata = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        console.log("[loadedmetadata] Video metadata loaded. Dimensions:", video.videoWidth, "x", video.videoHeight);
        // Maybe adjust overlay size here if needed based on video dimensions
    }, []);

    const handleVideoPlay = useCallback(() => {
        console.log("[play] Video playback started successfully.");
        setIsActive(true); // Confirm active state when play starts
        setIsScanning(true); // Start scanning visually
        // Don't start runScanLoop here, startCamera does that
    }, []);


  // --- Start Camera ---
  const startCamera = useCallback(async () => {
    const logPrefix = "[startCamera]";
    console.log(`${logPrefix} Attempting to start...`);
    if (isStarting || isActive) {
      console.warn(`${logPrefix} Aborted - already starting or active.`);
      return;
    }
    setError(null);
    setHasCameraPermission(null); // Reset permission state
    setIsStarting(true);
    // Reset these immediately
    setIsActive(false);
    setIsScanning(false);
    processingSuccessRef.current = false;
    setCurrentCapturedImageUri(null); // Clear any previously captured image

    console.log(`${logPrefix} Performing pre-start cleanup.`);
    cleanupCamera("startCamera preamble");
    await new Promise(resolve => setTimeout(resolve, 50)); // Shorter delay

    try {
      console.log(`${logPrefix} Requesting media stream...`);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access (getUserMedia) is not supported by this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment", // Prefer rear camera
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
        },
        audio: false,
      });
      console.log(`${logPrefix} Stream obtained:`, stream.id);
      setHasCameraPermission(true);
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        cleanupCamera("startCamera no video ref");
        throw new Error("Video element reference is not available.");
      }

      if (video.srcObject) {
          console.warn(`${logPrefix} Detaching existing srcObject before setting new one.`);
          (video.srcObject as MediaStream).getTracks().forEach(track => track.stop());
          video.srcObject = null;
      }

      video.addEventListener('error', handleVideoError);
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('play', handleVideoPlay);
      console.log(`${logPrefix} Attached video event listeners.`);


      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      console.log(`${logPrefix} Set video srcObject.`);

      try {
        console.log(`${logPrefix} Attempting video.play()...`);
        await video.play();
        console.log(`${logPrefix} video.play() called successfully (actual playback confirmed by 'play' event).`);
      } catch (playError: any) {
        console.error(`${logPrefix} Error calling video.play():`, playError);
         let playErrorMessage = `Could not start video source`;
          if (playError instanceof Error) { // Check if it's a standard Error
            if (playError.name === 'NotAllowedError') {
              playErrorMessage = `Playback permission denied. Please ensure user interaction occurred before starting.`;
            } else if (playError.name === 'NotSupportedError') {
              playErrorMessage = `Video format or source not supported.`;
            } else {
              playErrorMessage = `Could not play video: ${playError.name} - ${playError.message}`;
            }
          } else {
            playErrorMessage = `Could not play video: ${String(playError)}`; // Convert to string if unknown type
          }
        throw new Error(playErrorMessage); // Rethrow specific error
      }

      // Initialize ZXing Reader (do this *after* trying to play)
      const hints = new Map<DecodeHintType, any>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13,
        BarcodeFormat.UPC_A, BarcodeFormat.PDF_417, BarcodeFormat.QR_CODE,
        BarcodeFormat.DATA_MATRIX
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      readerRef.current = new BrowserMultiFormatReader(hints, 300); // Try 300ms
      console.log(`${logPrefix} ZXing Reader initialized.`);

    } catch (err: any) {
        console.error(`${logPrefix} Error accessing or starting camera:`, err);
        let message = `Could not start camera. Error: ${err.name || 'UnknownError'} - ${err.message || 'No details'}`;
        let permissionRelated = false;

        if (err.message?.includes('Could not start video source')) {
            message = err.message; // Use the specific playback error from the rethrow
        } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            message = 'Camera permission denied. Please allow access in browser settings and refresh.';
            permissionRelated = true;
        } else if (['NotFoundError', 'DevicesNotFoundError'].includes(err.name) || (err instanceof DOMException && err.name === 'NotFoundError')) { // Check DOMException explicitly
            message = 'No compatible camera found. Ensure it is connected and enabled.';
        } else if (['NotReadableError', 'TrackStartError', 'AbortError', 'OverconstrainedError'].includes(err.name)) {
            message = err.name === 'NotReadableError'
             ? 'Camera is already in use or could not be started. Close other apps/tabs using the camera and refresh.'
             : `Camera error (${err.name}). Try refreshing the page.`;
        } else if (err.name === 'SecurityError') {
            message = 'Camera access denied due to security settings (requires HTTPS or localhost).';
            permissionRelated = true;
        } else if (err instanceof TypeError && err.message.includes("Cannot read properties of undefined (reading 'getUserMedia')")) {
            message = 'Camera access (getUserMedia) is not supported by this browser or context (e.g., HTTP).';
        }
        setError(message);
        setHasCameraPermission(permissionRelated ? false : null); // Set permission state based on error type
        toast({ title: 'Camera Start Error', description: message, variant: 'destructive', duration: 8000 });
        if (onScanError) onScanError(err instanceof Error ? err : new Error(message));
        cleanupCamera("startCamera error handler");
    } finally {
      setIsStarting(false);
      console.log(`${logPrefix} Finished start attempt. State:`, { isStarting, isActive, isScanning });
    }
  }, [toast, onScanError, cleanupCamera, handleVideoError, handleLoadedMetadata, handleVideoPlay, setCurrentCapturedImageUri]);


  // --- Effect to attach/detach video listeners ---
  useEffect(() => {
    // Listeners are attached in startCamera, removed in cleanupCamera
    return () => {
        if (isActive || isStarting) {
            console.log("Scanner effect cleanup: Calling cleanupCamera due to unmount/dependency change.");
            cleanupCamera("effect cleanup");
        }
    };
  }, [isActive, isStarting, cleanupCamera]); // Re-run if these states change


  // --- Unmount Cleanup ---
  useEffect(() => {
    return () => {
      console.log("BarcodeScanner: Unmounting. Cleaning up camera.");
      cleanupCamera("unmount");
    };
  }, [cleanupCamera]); // Only depends on the stable cleanup function


  // --- Handle initial button press to start camera ---
  const handleInitialStartClick = () => {
    if (!isStarting && !isActive && !disabled) {
      console.log("[InitialStartClick] Triggering startCamera().");
      startCamera();
    } else {
      console.log("[InitialStartClick] Ignoring click. Conditions:", { isStarting, isActive, disabled });
    }
  };

  // --- Handle Capture Button Click ---
  const handleCaptureClick = useCallback(() => {
    const logPrefix = "[handleCaptureClick]";
    if (!isActive || isScanning) {
      console.warn(`${logPrefix} Not active or already scanning.`);
      return;
    }
    const imageDataUri = captureFrame();
    if (imageDataUri) {
      console.log(`${logPrefix} Frame captured successfully.`);
      setCurrentCapturedImageUri(imageDataUri); // Update state
      onScanSuccess(imageDataUri); // Pass to parent
      // Optionally stop camera after successful capture
      // cleanupCamera("capture success");
    } else {
      console.error(`${logPrefix} Failed to capture frame.`);
      // Error handling is done within captureFrame
    }
  }, [isActive, isScanning, captureFrame, onScanSuccess, setCurrentCapturedImageUri, cleanupCamera]);


  return (
    <div className={`flex flex-col items-center gap-4 w-full max-w-xs ${disabled && !isStarting ? 'opacity-50 pointer-events-none' : ''}`}>

      {/* Camera View Area */}
      <div className={`w-full aspect-[3/4] border rounded-lg overflow-hidden shadow-md bg-muted relative ${isStarting || isActive ? 'block' : 'hidden'}`}>
        <video
          ref={videoRef}
          className={`w-full h-full object-cover block bg-black transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`}
          playsInline
          muted
          aria-label="Camera feed for barcode scanning"
        />
        {/* Loading/Starting Indicator */}
        {isStarting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white z-10 pointer-events-none">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <p className="text-sm text-muted-foreground">Starting camera...</p>
          </div>
        )}
        {/* Active Camera Overlay (Vertical Frame) */}
        {isActive && (
          <div className="absolute inset-0 pointer-events-none z-5">
            {/* Vertical Frame Overlay - Aspect Ratio ~2:3 for typical ID card */}
            <div className="absolute inset-x-[10%] inset-y-[15%] border-2 border-accent/50 rounded pointer-events-none"></div>
            {/* Prompt Text */}
            <p className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-center text-xs text-white bg-black/50 px-2 py-1 rounded">
              {scanPrompt}
            </p>
          </div>
        )}
         {/* Camera Permission Denied Message */}
        {hasCameraPermission === false && !isStarting && (
           <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20 p-4">
             <Alert variant="destructive" className="w-full max-w-xs">
               <AlertCircle className="h-4 w-4" />
               <AlertTitle>Camera Access Denied</AlertTitle>
               <AlertDescription>
                 Please allow camera access in your browser settings and refresh the page.
               </AlertDescription>
             </Alert>
           </div>
        )}
        {/* General Error Overlay (excluding permission denied if already shown) */}
        {error && !isStarting && hasCameraPermission !== false && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20 p-4">
            <Alert variant="destructive" className="w-full max-w-xs">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Scanner Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
              <Button onClick={handleInitialStartClick} variant="secondary" size="sm" className="mt-2 text-xs" disabled={isStarting}>
                <RefreshCw className="mr-1 h-3 w-3" /> Try Again
              </Button>
            </Alert>
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true"></canvas>
      </div>

       {/* Display Captured Image Preview (Optional) */}
       {/* Consider moving this preview logic to the parent component if needed */}
       {currentCapturedImageUri && !isActive && (
           <div className="w-full max-w-xs p-2 border rounded-md bg-muted">
               <p className="text-sm font-medium text-center mb-2">Captured Image:</p>
               <Image
                   src={currentCapturedImageUri}
                   alt="Captured Barcode"
                   width={150}
                   height={225} // Maintain vertical aspect ratio
                   className="rounded-md mx-auto object-contain"
               />
           </div>
       )}


      {/* Controls: Start Camera, Capture or Stop Scanning */}
      <div className="flex gap-2">
        {!isActive && !isStarting ? (
          <Button onClick={handleInitialStartClick} disabled={disabled || isStarting} className="transition-subtle">
            <Camera className="mr-2 h-4 w-4" /> Start Camera
          </Button>
        ) : isActive ? (
          <>
            <Button onClick={handleCaptureClick} disabled={disabled || isStarting} className="transition-subtle">
              <ScanLine className="mr-2 h-4 w-4" /> Capture
            </Button>
            {onManualStop && ( // Only show stop if handler provided
               <Button onClick={handleStopClick} variant="destructive" disabled={disabled || isStarting} className="transition-subtle">
                 <StopCircle className="mr-2 h-4 w-4" /> Stop Scanning
               </Button>
             )}
          </>
        ) : null // No button if starting
        }
      </div>

      {/* CSS for animations (removed scan line) */}
      <style jsx global>{`
        /* No animations needed currently */
      `}</style>
    </div>
  );
};

export default BarcodeScanner;
