

'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, AlertCircle, Loader2, ScanLine, StopCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Image from 'next/image';

// Removed ZXing imports as they are not used for basic capture

interface BarcodeScannerProps {
  onScanSuccess: (imageDataUri: string) => void; // Capture success triggers this
  onScanError?: (error: Error) => void;
  scanPrompt?: string;
  disabled?: boolean;
  onManualStop?: (imageDataUri: string | null) => void; // Handler for when user clicks Stop
  setCapturedImageUri?: (uri: string | null) => void; // Optional: Function to update the captured image URI state in parent
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScanSuccess,
  onScanError,
  scanPrompt = 'Position ID card inside the frame',
  disabled = false,
  onManualStop,
  setCapturedImageUri // Receive the setter function as a prop
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [internalCapturedImageUri, setInternalCapturedImageUri] = useState<string | null>(null); // Internal state for preview

  const [isStarting, setIsStarting] = useState(false);
  const [isActive, setIsActive] = useState(false); // Camera stream is running
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
          if (message.includes('MEDIA_ERR_SRC_NOT_SUPPORTED') || message.includes('MEDIA_ERR_DECODE') || (event as any).message?.includes('Could not start video source')) {
               message = "Could not start video source. Ensure the camera is working and permissions are granted.";
          }
          console.error(`Video Error Details: Code ${videoError.code}, Message: ${videoError.message}`); // Log details

      } else if ((event as any).message?.includes('Could not start video source')) {
           // Catch generic errors sometimes thrown instead of via video.error
           message = "Could not start video source. Ensure the camera is working and permissions are granted.";
      }

      setError(message);
      toast({ title: "Video Playback Error", description: message, variant: "destructive", duration: 8000 });
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
      setIsStarting(false); // Ensure starting indicator is off
  }, []);


  // --- Cleanup Function ---
  const cleanupCamera = useCallback((caller?: string) => {
    const logPrefix = `[Cleanup ${caller || 'unknown'}]`;
    console.log(`${logPrefix} Starting cleanup... Stream ref: ${streamRef.current?.id}`);

    const video = videoRef.current;
    if (video) {
        // Remove listeners first
        console.log(`${logPrefix} Removing video listeners.`);
        video.removeEventListener('error', handleVideoError);
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('play', handleVideoPlay);

        if (video.srcObject instanceof MediaStream) {
            const stream = video.srcObject;
            console.log(`${logPrefix} Found srcObject stream: ${stream?.id}. Stopping tracks.`);
            stream.getTracks().forEach(track => {
                if (track.readyState === 'live') {
                    track.stop();
                    console.log(`${logPrefix} Stopped track: ${track.id} (${track.kind})`);
                } else {
                    console.log(`${logPrefix} Track already stopped: ${track.id}`);
                }
            });
            video.srcObject = null; // Clear srcObject
            console.log(`${logPrefix} Cleared video srcObject.`);
            // Only clear streamRef if it matches the one we just stopped
            if (streamRef.current && streamRef.current.id === stream.id) {
                streamRef.current = null;
                console.log(`${logPrefix} Cleared matching stream ref.`);
            } else {
                console.log(`${logPrefix} Stream ref (${streamRef.current?.id}) did not match srcObject stream (${stream.id}), not clearing ref.`);
            }
        } else if (streamRef.current) {
            // Fallback: If srcObject wasn't set or cleared, but we have a streamRef
            console.log(`${logPrefix} No srcObject, but streamRef exists (${streamRef.current.id}). Stopping tracks on ref.`);
             streamRef.current.getTracks().forEach(track => {
                if (track.readyState === 'live') {
                    track.stop();
                    console.log(`${logPrefix} Stopped track from ref: ${track.id} (${track.kind})`);
                } else {
                    console.log(`${logPrefix} Track from ref already stopped: ${track.id}`);
                }
            });
            streamRef.current = null;
            console.log(`${logPrefix} Cleared stream ref.`);
        } else {
            console.log(`${logPrefix} No srcObject and no stream ref to clear.`);
        }

        if (!video.paused) {
            video.pause();
            console.log(`${logPrefix} Paused video playback.`);
        }
    } else {
      console.log(`${logPrefix} No video element ref to cleanup.`);
       // If video ref doesn't exist, still try to clean up streamRef if it exists
       if (streamRef.current) {
           console.log(`${logPrefix} Cleaning up streamRef directly as video ref is null.`);
           streamRef.current.getTracks().forEach(track => track.stop());
           streamRef.current = null;
       }
    }

    setIsActive(false);
    setIsStarting(false);
    setInternalCapturedImageUri(null); // Clear internal preview state

    // Attempt to clear the parent's state via the prop, only if the prop exists
    try {
        if (typeof setCapturedImageUri === 'function') {
            setCapturedImageUri(null);
            console.log(`${logPrefix} Called setCapturedImageUri(null) in parent.`);
        } else if (setCapturedImageUri !== undefined) {
            // If the prop exists but isn't a function, log a warning
            console.warn(`${logPrefix} setCapturedImageUri prop was provided but is not a function.`);
        } else {
            // If the prop wasn't provided at all, it's fine.
             // console.log(`${logPrefix} setCapturedImageUri prop was not provided.`);
        }
    } catch (e) {
        console.error(`${logPrefix} Error calling setCapturedImageUri during cleanup:`, e);
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
    setInternalCapturedImageUri(lastFrameUri); // Update internal preview

    try {
      // Update parent's state with the last captured frame (or null if failed)
       if (typeof setCapturedImageUri === 'function') {
           setCapturedImageUri(lastFrameUri);
           console.log(`${logPrefix} Updated parent captured image URI.`);
       } else if (setCapturedImageUri !== undefined) {
            console.warn(`${logPrefix} setCapturedImageUri prop was provided but is not a function.`);
       }
    } catch (e) {
      console.error(`${logPrefix} Error calling setCapturedImageUri during stop:`, e);
      setError("Internal component error: Failed to update image state on stop.");
    }

    cleanupCamera("manual stop"); // Stop the camera stream and listeners

    if (onManualStop) {
      console.log(`${logPrefix} Calling onManualStop with image URI (or null):`, lastFrameUri ? 'Yes' : 'No');
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
    setInternalCapturedImageUri(null); // Clear internal preview state

    // Check if the setCapturedImageUri prop is valid (if provided)
    if (setCapturedImageUri !== undefined && typeof setCapturedImageUri !== 'function') {
        console.error(`${logPrefix} Aborted - setCapturedImageUri prop was provided but is not a function.`);
        setError("Internal component error: Invalid state update function provided.");
        setIsStarting(false);
        return; // Cannot proceed if the prop is invalid
    }


    try {
      // Clear parent's state at the start if the function exists
      if (typeof setCapturedImageUri === 'function') {
         setCapturedImageUri(null);
      }
    } catch (e) {
      console.error(`${logPrefix} Error calling setCapturedImageUri during start:`, e);
      setError("Internal component error: Failed to clear image state.");
      setIsStarting(false);
      return;
    }

    console.log(`${logPrefix} Performing pre-start cleanup.`);
    cleanupCamera("startCamera preamble"); // Cleanup before starting
    await new Promise(resolve => setTimeout(resolve, 50)); // Short delay

    const video = videoRef.current;
    if (!video) {
        const msg = "Video element reference is not available.";
        console.error(`${logPrefix} ${msg}`);
        setError(msg);
        setIsStarting(false);
        return;
    }

    // Attach listeners before getting stream
    console.log(`${logPrefix} Attaching video event listeners before stream request.`);
    video.removeEventListener('error', handleVideoError); // Clean previous just in case
    video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    video.removeEventListener('play', handleVideoPlay);
    video.addEventListener('error', handleVideoError);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handleVideoPlay);

    try {
      console.log(`${logPrefix} Requesting media stream...`);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access (getUserMedia) is not supported by this browser.');
      }

      // --- Simplified Constraints ---
      // Try basic video first, then environment facing
      let stream: MediaStream | null = null;
      try {
          console.log(`${logPrefix} Trying simple video constraint.`);
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (err: any) {
          console.warn(`${logPrefix} Simple video constraint failed (${err.name}). Trying environment facing.`);
          if (err.name !== 'OverconstrainedError' && err.name !== 'NotFoundError') {
              // If it's not a constraint/not found error, re-throw permission errors etc.
               throw err;
          }
          // Fallback to environment facing if simple fails
           try {
              console.log(`${logPrefix} Trying environment facing constraint.`);
              stream = await navigator.mediaDevices.getUserMedia({
                  video: { facingMode: "environment" },
                  audio: false
              });
          } catch (innerErr: any) {
              console.error(`${logPrefix} Both simple and environment facing constraints failed.`);
              // If environment also fails, try ANY camera as a last resort
               try {
                   console.warn(`${logPrefix} Environment constraint failed. Trying ANY video device.`);
                   stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
               } catch (finalErr) {
                   console.error(`${logPrefix} All camera constraints (simple, environment, any) failed.`);
                   throw innerErr; // Throw the error from the second (environment) attempt as it's more specific
               }
          }
      }
      // --- End Simplified Constraints ---

      console.log(`${logPrefix} Stream obtained:`, stream.id);
      setHasCameraPermission(true);
      streamRef.current = stream; // Store the stream reference *immediately*

      // Double check video ref hasn't become null
      const currentVideo = videoRef.current;
      if (!currentVideo) {
          throw new Error("Video element reference became unavailable after stream acquisition.");
      }


      if (currentVideo.srcObject) {
        console.warn(`${logPrefix} Detaching existing srcObject before setting new one.`);
        (currentVideo.srcObject as MediaStream).getTracks().forEach(track => track.stop());
        currentVideo.srcObject = null;
      }

      currentVideo.srcObject = stream;
      currentVideo.muted = true; // Ensure muted
      currentVideo.playsInline = true; // Important for iOS
      console.log(`${logPrefix} Set video srcObject.`);

      console.log(`${logPrefix} Attempting video.play()...`);
      // Don't await play(), let the 'play' event handler update state
      currentVideo.play().catch(playError => {
          // Catch potential synchronous play errors (less common)
          console.error(`${logPrefix} video.play() promise rejected synchronously:`, playError);
           // If play fails, try to provide a more specific error based on common issues
          let playErrorMessage = `Video playback failed: ${playError.name} - ${playError.message}.`;
           if (playError.name === 'NotAllowedError') {
               playErrorMessage += " Ensure the action was triggered by user interaction (like a button click) and check browser autoplay policies.";
           } else if (playError.name === 'NotSupportedError') {
               playErrorMessage += " The video format or source might not be supported by the browser.";
           }
           const wrappedError = new Error(playErrorMessage);
           (wrappedError as any).cause = playError; // Keep original error context if needed
           throw wrappedError; // Re-throw the more descriptive error
      });
      console.log(`${logPrefix} video.play() called.`);


    } catch (err: any) {
        console.error(`${logPrefix} Error during camera start or playback:`, err);
        let message = `Could not start camera. Error: ${err.name || 'UnknownError'} - ${err.message || 'No details'}`;
        let permissionRelated = false;

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
         else if (err.message?.includes('Could not start video source')) {
             message = 'Could not start video source. Ensure the camera is working and permissions are granted.';
         }
         // Check for the more specific playback error message created in the play().catch block
         else if (err.message?.startsWith('Video playback failed:')) {
             message = err.message;
         }


        setError(message);
        setHasCameraPermission(permissionRelated ? false : null);
        toast({ title: 'Camera Start Error', description: message, variant: 'destructive', duration: 8000 });
        if (onScanError) onScanError(err instanceof Error ? err : new Error(message));
        cleanupCamera("startCamera error handler"); // Ensure cleanup happens on error
    } finally {
      // Don't set isActive here, let the 'play' event handle it.
      // Only reset isStarting if no 'play' event is expected (i.e., if there was an error before play)
      if (error || (!isActive && !isStarting)) { // Also check if already inactive (e.g. permission denied before play)
         setIsStarting(false);
      }
      console.log(`${logPrefix} Finished start attempt. State:`, { isStarting, isActive, error });
    }
  }, [toast, onScanError, cleanupCamera, handleVideoError, handleLoadedMetadata, handleVideoPlay, setCapturedImageUri]);


  // Effect to cleanup on error state change (excluding permission denial handled separately)
  useEffect(() => {
      if (error && hasCameraPermission !== false) { // Check if error exists AND it's not a permission denial
          console.log("[ErrorEffect] Cleaning up camera due to error state change:", error);
          cleanupCamera("error effect");
      }
  }, [error, hasCameraPermission, cleanupCamera]);


  // --- Unmount Cleanup ---
  useEffect(() => {
    const componentName = "BarcodeScanner"; // For logging
    console.log(`${componentName}: Mounting.`);
    return () => {
      console.log(`${componentName}: Unmounting. Cleaning up camera.`);
      cleanupCamera("unmount");
    };
  }, [cleanupCamera]);


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
    if (!isActive) {
      console.warn(`${logPrefix} Camera not active.`);
      toast({title: "Camera Not Ready", description: "Please start the camera first.", variant: "destructive"})
      return;
    }
    const imageDataUri = captureFrame();
    if (imageDataUri) {
      console.log(`${logPrefix} Frame captured successfully.`);
      setInternalCapturedImageUri(imageDataUri); // Update internal preview state
      try {
        // Update the parent component's state via the prop function, if provided
         if (typeof setCapturedImageUri === 'function') {
             setCapturedImageUri(imageDataUri);
             console.log(`${logPrefix} Updated parent captured image URI.`);
         } else if (setCapturedImageUri !== undefined) {
              console.warn(`${logPrefix} setCapturedImageUri prop was provided but is not a function.`);
         }
        // Call the success handler provided by the parent
        onScanSuccess(imageDataUri);
        // Stop the camera stream after successful capture
        cleanupCamera("capture success");
      } catch (e) {
         console.error(`${logPrefix} Error calling setCapturedImageUri or onScanSuccess after capture:`, e);
         const errorMsg = e instanceof Error ? e.message : "Unknown error processing capture.";
         setError(`Failed to process captured image: ${errorMsg}. Please try again.`);
         toast({title: "Processing Error", description: `Could not process the captured image: ${errorMsg}`, variant: "destructive"})
      }

    } else {
      console.error(`${logPrefix} Failed to capture frame.`);
      // Error display/handling is done within captureFrame or startCamera
      toast({title: "Capture Failed", description: "Could not capture image from camera.", variant: "destructive"})
    }
  }, [isActive, captureFrame, onScanSuccess, setCapturedImageUri, cleanupCamera, toast]); // Dependencies


  return (
    <div className={`flex flex-col items-center gap-4 w-full max-w-xs ${disabled && !isStarting ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Camera/Video Display Area */}
      {/* Container maintains aspect ratio for ID card (approx 3:4.5 or 2:3) */}
      <div className={`w-full aspect-[2/3] border rounded-lg overflow-hidden shadow-md bg-muted relative ${isStarting || isActive || error || hasCameraPermission === false ? 'block' : 'hidden'}`}>
        {/* Video element container */}
        <div className={`relative w-full h-full ${isStarting || isActive ? 'block' : 'hidden'}`}>
            <video
                ref={videoRef}
                className={`w-full h-full object-cover block bg-black transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`}
                playsInline
                muted
                aria-label="Camera feed for ID card capture"
            />
            {/* Loading Overlay */}
            {isStarting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white z-10 pointer-events-none">
                    <Loader2 className="h-8 w-8 animate-spin mb-2" />
                    <p className="text-sm text-muted-foreground">Starting camera...</p>
                </div>
            )}
            {/* Scan Guidance Overlay - Adjusted for vertical ID */}
            {isActive && (
                <div className="absolute inset-0 pointer-events-none z-5">
                     {/* More vertical rectangle */}
                    <div className="absolute inset-x-[10%] inset-y-[5%] border-2 border-accent/50 rounded pointer-events-none" aria-hidden="true"></div>
                    <p className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-center text-xs text-white bg-black/50 px-2 py-1 rounded">
                    {scanPrompt}
                    </p>
                </div>
            )}
        </div>

        {/* Permission Denied Overlay */}
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
        {/* General Error Overlay */}
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
        {/* Hidden canvas for capturing frames */}
        <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true"></canvas>
      </div>

       {/* Display Captured Image Preview using internal state */}
       {internalCapturedImageUri && !isActive && !isStarting && (
           <div className="w-full max-w-xs p-2 border rounded-md bg-muted">
               <p className="text-sm font-medium text-center mb-2">Captured Image:</p>
               <Image
                   src={internalCapturedImageUri}
                   alt="Captured ID Card"
                   width={150}
                   height={225} // Maintain vertical aspect ratio
                   className="rounded-md mx-auto object-contain"
                   data-ai-hint="id card captured"
               />
           </div>
       )}

        {/* Control Buttons */}
      <div className="flex gap-2">
        {!isActive && !isStarting && hasCameraPermission !== false && !error ? (
          // Show "Start Camera" button if inactive and no errors (or permission denied)
          <Button onClick={handleInitialStartClick} disabled={disabled || isStarting} className="transition-subtle">
            <Camera className="mr-2 h-4 w-4" /> Start Camera
          </Button>
        ) :
        isActive ? (
           // Show "Capture" and "Stop" buttons if active
          <>
            <Button onClick={handleCaptureClick} disabled={disabled || isStarting} className="transition-subtle">
              <ScanLine className="mr-2 h-4 w-4" /> Capture Image
            </Button>
            {/* Only show Stop button if the onManualStop handler is provided */}
            {onManualStop && (
               <Button onClick={handleStopClick} variant="destructive" disabled={disabled || isStarting} className="transition-subtle">
                 <StopCircle className="mr-2 h-4 w-4" /> Stop Scanning
               </Button>
             )}
          </>
        ) : null // Don't show buttons while starting, or if permission denied/error occurred (handled in overlays)
        }
      </div>
    </div>
  );
};

export default BarcodeScanner;
