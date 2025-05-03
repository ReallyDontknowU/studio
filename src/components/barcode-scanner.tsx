
'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, AlertCircle, Loader2, ScanLine, StopCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Exception as ZXingException } from '@zxing/library'; // Keep necessary ZXing imports if used later, removed unused ones for now
import Image from 'next/image';

interface BarcodeScannerProps {
  onScanSuccess: (imageDataUri: string) => void; // Capture success triggers this
  onScanError?: (error: Error) => void;
  scanPrompt?: string;
  disabled?: boolean;
  onManualStop?: (imageDataUri: string | null) => void; // Handler for when user clicks Stop
  capturedImageUri: string | null; // URI of the image *already* captured/shown
  setCapturedImageUri: (uri: string | null) => void; // Function to update the captured image URI state in parent
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScanSuccess,
  onScanError,
  scanPrompt = 'Position ID card inside the frame',
  disabled = false,
  onManualStop,
  capturedImageUri,
  setCapturedImageUri // This prop is crucial and MUST be provided by the parent
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Removed readerRef and processingSuccessRef as continuous scanning loop is removed

  const [isStarting, setIsStarting] = useState(false);
  const [isActive, setIsActive] = useState(false); // Camera stream is running
  // Removed isScanning state, now simply use isActive
  const [error, setError] = useState<string | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const { toast } = useToast();

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
          // Specific message for "Could not start video source" which often wraps other errors
          if (message.includes('MEDIA_ERR_SRC_NOT_SUPPORTED') || message.includes('MEDIA_ERR_DECODE')) {
              message = "Could not start video source. Ensure the camera is working and permissions are granted.";
          }

      } else if ((event as any).message?.includes('Could not start video source')) {
           // Catch generic errors sometimes thrown instead of via video.error
           message = "Could not start video source. Ensure the camera is working and permissions are granted.";
      }

      setError(message);
      toast({ title: "Video Playback Error", description: message, variant: "destructive" });
      if (onScanError) onScanError(new Error(message));
      // Let useEffect handle cleanup based on error state
  }, [toast, onScanError]);

  const handleLoadedMetadata = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      console.log("[loadedmetadata] Video metadata loaded. Dimensions:", video.videoWidth, "x", video.videoHeight);
      // Maybe adjust overlay size here if needed based on video dimensions
  }, []);

  const handleVideoPlay = useCallback(() => {
      console.log("[play] Video playback started successfully.");
      setIsActive(true); // Confirm active state when play starts
      setError(null); // Clear previous errors on successful play
  }, []);


  // --- Cleanup Function ---
  const cleanupCamera = useCallback((caller?: string) => {
    const logPrefix = `[Cleanup ${caller || 'unknown'}]`;
    console.log(`${logPrefix} Starting cleanup...`);

    const video = videoRef.current;
    if (video) {
        // Remove listeners first
        video.removeEventListener('error', handleVideoError);
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('play', handleVideoPlay);

        if (video.srcObject) {
            const stream = video.srcObject as MediaStream;
            console.log(`${logPrefix} Stopping tracks on stream: ${stream?.id}`);
            stream.getTracks().forEach(track => {
                track.stop();
                console.log(`${logPrefix} Stopped track: ${track.id} (${track.kind})`);
            });
            video.srcObject = null;
            streamRef.current = null; // Clear stream ref when tracks are stopped
            console.log(`${logPrefix} Cleared video srcObject and stream ref.`);
        } else {
            console.log(`${logPrefix} No srcObject to clear from video element.`);
        }
        if (!video.paused) {
            video.pause();
            console.log(`${logPrefix} Paused video playback.`);
        }
    } else {
      console.log(`${logPrefix} No video element ref to cleanup.`);
    }

    // Removed readerRef cleanup

    setIsActive(false);
    setIsStarting(false);
    // Do not clear error here, let parent or startCamera manage it.
    // Always attempt to clear the image URI using the passed setter
    try {
        // This call relies on setCapturedImageUri being a valid function passed as a prop
        setCapturedImageUri(null);
        console.log(`${logPrefix} Called setCapturedImageUri(null).`);
    } catch (e) {
        // This should ideally not happen if the prop is correctly passed and typed
        console.error(`${logPrefix} Error calling setCapturedImageUri during cleanup:`, e);
        // Avoid setting component-level error here, as it might interfere with parent's error handling
    }

    console.log(`${logPrefix} Cleanup finished.`);
  }, [handleVideoError, handleLoadedMetadata, handleVideoPlay, setCapturedImageUri]); // Add setCapturedImageUri dependency


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
      // Set canvas dimensions to match video stream for accurate capture
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      // Draw the current video frame onto the hidden canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      // Get the captured image as a Data URI (PNG format)
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

    const lastFrameUri = captureFrame(); // Try to capture one last frame
    try {
      // Update parent's state with the last captured frame (or null if failed)
      setCapturedImageUri(lastFrameUri);
    } catch (e) {
      console.error(`${logPrefix} Error calling setCapturedImageUri during stop:`, e);
      // This indicates the prop function is invalid
      setError("Internal component error: Failed to update image state on stop.");
    }

    cleanupCamera("manual stop"); // Stop the camera stream and listeners

    if (onManualStop) {
      console.log(`${logPrefix} Calling onManualStop with image URI (or null):`, lastFrameUri ? 'Yes' : 'No');
      // Pass the captured frame URI (or null) to the parent's handler
      onManualStop(lastFrameUri);
    } else {
       console.warn(`${logPrefix} onManualStop handler not provided.`);
    }
  }, [cleanupCamera, onManualStop, captureFrame, setCapturedImageUri]); // Dependencies


  // --- Start Camera ---
  const startCamera = useCallback(async () => {
    const logPrefix = "[startCamera]";
    console.log(`${logPrefix} Attempting to start...`);
    if (isStarting || isActive) {
      console.warn(`${logPrefix} Aborted - already starting or active.`);
      return;
    }

    // Reset states
    setError(null);
    setHasCameraPermission(null);
    setIsStarting(true);
    setIsActive(false);

    // Ensure setCapturedImageUri is a function before proceeding
    if (typeof setCapturedImageUri !== 'function') {
      console.error(`${logPrefix} Aborted - setCapturedImageUri prop is not a function.`);
      setError("Internal component error: State update function missing.");
      setIsStarting(false); // Reset starting state
      return; // Critical error, cannot proceed
    }

    try {
      setCapturedImageUri(null); // Clear any existing image at the start
    } catch (e) {
      console.error(`${logPrefix} Error calling setCapturedImageUri during start:`, e);
      setError("Internal component error: Failed to clear image state.");
      setIsStarting(false);
      return;
    }

    console.log(`${logPrefix} Performing pre-start cleanup.`);
    cleanupCamera("startCamera preamble");
    await new Promise(resolve => setTimeout(resolve, 50)); // Short delay for cleanup

    try {
      console.log(`${logPrefix} Requesting media stream...`);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access (getUserMedia) is not supported by this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          // Prefer environment camera, adjust constraints for potentially better quality/aspect ratio
          facingMode: "environment",
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          aspectRatio: { ideal: 9/16 } // Hint for vertical aspect ratio if supported
        },
        audio: false,
      });
      console.log(`${logPrefix} Stream obtained:`, stream.id);
      setHasCameraPermission(true);
      streamRef.current = stream; // Store stream reference

      const video = videoRef.current;
      if (!video) {
        throw new Error("Video element reference is not available.");
      }

      // Clear previous stream if any
      if (video.srcObject) {
        console.warn(`${logPrefix} Detaching existing srcObject before setting new one.`);
        (video.srcObject as MediaStream).getTracks().forEach(track => track.stop());
        video.srcObject = null;
      }

      // Attach event listeners BEFORE setting srcObject and playing
      video.removeEventListener('error', handleVideoError);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handleVideoPlay);
      video.addEventListener('error', handleVideoError);
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('play', handleVideoPlay);
      console.log(`${logPrefix} Attached video event listeners.`);

      video.srcObject = stream;
      video.muted = true; // Muting is crucial for autoplay policies
      video.playsInline = true; // Important for mobile browsers
      console.log(`${logPrefix} Set video srcObject.`);

      // Attempt to play the video
      console.log(`${logPrefix} Attempting video.play()...`);
      await video.play();
      // Note: Successful call doesn't guarantee playback started, 'play' event confirms that.
      console.log(`${logPrefix} video.play() called successfully.`);

      // No ZXing Reader initialization needed for manual capture

      // We set isActive only in the 'play' event handler now

    } catch (err: any) {
        console.error(`${logPrefix} Error during camera start or playback:`, err);
        let message = `Could not start camera. Error: ${err.name || 'UnknownError'} - ${err.message || 'No details'}`;
        let permissionRelated = false;

        // More specific error messages based on error types
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            message = 'Camera permission denied. Please allow access in browser settings and refresh.';
            permissionRelated = true;
        } else if (['NotFoundError', 'DevicesNotFoundError'].includes(err.name)) {
            message = 'No compatible camera found. Ensure it is connected and enabled.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError' || err.name === 'AbortError' || err.name === 'OverconstrainedError') {
             message = err.name === 'NotReadableError'
             ? 'Camera is already in use or could not be started. Close other apps/tabs using the camera and refresh.'
             : err.name === 'OverconstrainedError'
             ? 'Camera does not support requested resolution/settings.'
             : `Camera hardware error (${err.name}). Try refreshing or restarting device.`;
        } else if (err.name === 'SecurityError') {
            message = 'Camera access denied due to security settings (requires HTTPS or localhost).';
            permissionRelated = true;
        } else if (err.name === 'TypeError' && err.message?.includes('getUserMedia')) {
             message = 'Camera access (getUserMedia) is not supported by this browser or context (e.g., HTTP).';
        }
         // Check specifically for play() related errors
        else if (err instanceof DOMException && err.name === 'NotAllowedError') {
             // This often happens if play() wasn't triggered by user interaction
             message = 'Video playback blocked. Ensure the action was triggered by user interaction (e.g., button click).';
        }
        else if (err instanceof DOMException && err.name === 'NotSupportedError') {
             message = 'Video format or source not supported for playback.';
        }
         else if (err.message?.includes('Could not start video source')) {
             // Generic fallback for playback issues
             message = 'Could not start video source. Ensure the camera is working and permissions are granted.';
         }

        setError(message);
        setHasCameraPermission(permissionRelated ? false : null); // Update permission state based on error
        toast({ title: 'Camera Start Error', description: message, variant: 'destructive', duration: 8000 });
        if (onScanError) onScanError(err instanceof Error ? err : new Error(message));
        cleanupCamera("startCamera error handler"); // Attempt cleanup on error
    } finally {
      setIsStarting(false); // Ensure starting state is reset regardless of outcome
      console.log(`${logPrefix} Finished start attempt. State:`, { isStarting, isActive });
    }
  // Include setCapturedImageUri in the dependency array
  }, [toast, onScanError, cleanupCamera, handleVideoError, handleLoadedMetadata, handleVideoPlay, setCapturedImageUri]);


  // Effect to cleanup on error state change (excluding permission denial handled separately)
  useEffect(() => {
      if (error && error !== 'Camera permission denied. Please allow access in browser settings and refresh.') {
          console.log("[ErrorEffect] Cleaning up camera due to error state change:", error);
          cleanupCamera("error effect");
      }
  }, [error, cleanupCamera]);


  // --- Unmount Cleanup ---
  useEffect(() => {
    // This function runs when the component is unmounted
    return () => {
      console.log("BarcodeScanner: Unmounting. Cleaning up camera.");
      cleanupCamera("unmount");
    };
  }, [cleanupCamera]); // Dependency array includes cleanupCamera


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
    if (!isActive) { // Check if camera stream is active
      console.warn(`${logPrefix} Camera not active.`);
      toast({title: "Camera Not Ready", description: "Please start the camera first.", variant: "destructive"})
      return;
    }
    const imageDataUri = captureFrame(); // Capture the current frame
    if (imageDataUri) {
      console.log(`${logPrefix} Frame captured successfully.`);
      try {
        // Update the parent component's state with the captured image URI
        setCapturedImageUri(imageDataUri);
        // Call the success handler provided by the parent
        onScanSuccess(imageDataUri);
        // Stop the camera stream after successful capture
        cleanupCamera("capture success");
      } catch (e) {
         console.error(`${logPrefix} Error calling setCapturedImageUri or onScanSuccess after capture:`, e);
         setError("Failed to process captured image. Please try again.");
         toast({title: "Processing Error", description: "Could not process the captured image.", variant: "destructive"})
      }

    } else {
      console.error(`${logPrefix} Failed to capture frame.`);
      // Error display/handling is done within captureFrame or startCamera
    }
  }, [isActive, captureFrame, onScanSuccess, setCapturedImageUri, cleanupCamera, toast]); // Dependencies


  return (
    // Main container for the scanner component
    <div className={`flex flex-col items-center gap-4 w-full max-w-xs ${disabled && !isStarting ? 'opacity-50 pointer-events-none' : ''}`}>

      {/* Camera View Area - Conditionally displayed */}
      {/* Aspect ratio adjusted for vertical ID cards (~2:3 or 3:4) */}
      <div className={`w-full aspect-[3/4] border rounded-lg overflow-hidden shadow-md bg-muted relative ${isStarting || isActive ? 'block' : 'hidden'}`}>
        {/* Video element to display camera feed */}
        <video
          ref={videoRef}
          className={`w-full h-full object-cover block bg-black transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`}
          playsInline // Important for inline playback on mobile
          muted // Autoplay usually requires video to be muted
          aria-label="Camera feed for barcode scanning"
        />
        {/* Loading/Starting Indicator */}
        {isStarting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white z-10 pointer-events-none">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <p className="text-sm text-muted-foreground">Starting camera...</p>
          </div>
        )}
        {/* Active Camera Overlay (Vertical Frame Guide) */}
        {isActive && (
          <div className="absolute inset-0 pointer-events-none z-5">
            {/* Vertical Frame Overlay - Adjust percentages for desired frame size/position */}
            <div className="absolute inset-x-[10%] inset-y-[15%] border-2 border-accent/50 rounded pointer-events-none" aria-hidden="true"></div>
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
        {/* General Error Overlay (shown if error exists, not starting, and permission wasn't denied) */}
        {error && !isStarting && hasCameraPermission !== false && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20 p-4">
            <Alert variant="destructive" className="w-full max-w-xs">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Scanner Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
              {/* Allow retrying if it wasn't a permission issue */}
              <Button onClick={handleInitialStartClick} variant="secondary" size="sm" className="mt-2 text-xs" disabled={isStarting}>
                <RefreshCw className="mr-1 h-3 w-3" /> Try Again
              </Button>
            </Alert>
          </div>
        )}
        {/* Hidden canvas used for capturing frames */}
        <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true"></canvas>
      </div>

       {/* Display Captured Image Preview */}
       {/* Shows the image AFTER capture and when the camera is inactive */}
       {capturedImageUri && !isActive && (
           <div className="w-full max-w-xs p-2 border rounded-md bg-muted">
               <p className="text-sm font-medium text-center mb-2">Captured Image:</p>
               <Image
                   src={capturedImageUri}
                   alt="Captured Barcode/ID"
                   width={150}
                   height={225} // Maintain vertical aspect ratio
                   className="rounded-md mx-auto object-contain"
                   data-ai-hint="id card captured" // Added AI hint
               />
           </div>
       )}


      {/* Control Buttons */}
      <div className="flex gap-2">
        {/* Show "Start Camera" button if camera is not active and not starting */}
        {!isActive && !isStarting ? (
          <Button onClick={handleInitialStartClick} disabled={disabled || isStarting} className="transition-subtle">
            <Camera className="mr-2 h-4 w-4" /> Start Camera
          </Button>
        ) : // Show "Capture Image" and "Stop Scanning" buttons if camera is active
        isActive ? (
          <>
            <Button onClick={handleCaptureClick} disabled={disabled || isStarting} className="transition-subtle">
              <ScanLine className="mr-2 h-4 w-4" /> Capture Image
            </Button>
            {/* Show "Stop Scanning" button only if onManualStop handler is provided */}
            {onManualStop && (
               <Button onClick={handleStopClick} variant="destructive" disabled={disabled || isStarting} className="transition-subtle">
                 <StopCircle className="mr-2 h-4 w-4" /> Stop Scanning
               </Button>
             )}
          </>
        ) : null // No buttons shown while camera is in the starting process
        }
      </div>
    </div>
  );
};

export default BarcodeScanner;
