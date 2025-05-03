

'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, AlertCircle, Loader2, ScanLine, StopCircle, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Image from 'next/image';

interface BarcodeScannerProps {
  onScanSuccess: (imageDataUri: string) => void; // Still used if auto-capture is re-enabled
  onScanError?: (error: Error) => void;
  scanPrompt?: string;
  disabled?: boolean;
  onManualStop?: (imageDataUri: string | null) => void; // Handler for when user clicks Stop
  setCapturedImageUri: (uri: string | null) => void; // Make mandatory for state update
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScanSuccess, // Keep for potential future auto-capture
  onScanError,
  scanPrompt = 'Position ID card inside the frame',
  disabled = false,
  onManualStop,
  setCapturedImageUri // Now mandatory
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [internalCapturedImageUri, setInternalCapturedImageUri] = useState<string | null>(null);

  const [isStarting, setIsStarting] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const { toast } = useToast();

   // --- Event Handlers ---
  const handleVideoError = useCallback((event: Event) => {
      const logPrefix = "[VideoError]";
      console.error(`${logPrefix} Event:`, event);
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
          if (message.includes('MEDIA_ERR_SRC_NOT_SUPPORTED') || message.includes('MEDIA_ERR_DECODE') || (event as any).message?.includes('Could not start video source')) {
               message = "Could not start video source. Ensure the camera is working and permissions are granted.";
          }
          console.error(`${logPrefix} Details: Code ${videoError.code}, Message: ${videoError.message}`);
      } else if ((event as any).message?.includes('Could not start video source')) {
           message = "Could not start video source. Ensure the camera is working and permissions are granted.";
      }

      setError(message);
      toast({ title: "Video Playback Error", description: message, variant: "destructive", duration: 8000 });
      if (onScanError) onScanError(new Error(message));
  }, [toast, onScanError]);

  const handleLoadedMetadata = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      console.log("[loadedmetadata] Video metadata loaded. Dimensions:", video.videoWidth, "x", video.videoHeight);
  }, []);

  const handleVideoPlay = useCallback(() => {
      console.log("[play] Video playback started successfully.");
      setIsActive(true);
      setError(null);
      setIsStarting(false);
  }, []);


  // --- Cleanup Function ---
  const cleanupCamera = useCallback((caller?: string) => {
    const logPrefix = `[Cleanup ${caller || 'unknown'}]`;
    console.log(`${logPrefix} Starting cleanup... Stream ref: ${streamRef.current?.id}`);

    const video = videoRef.current;
    if (video) {
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
            video.srcObject = null;
            console.log(`${logPrefix} Cleared video srcObject.`);
            if (streamRef.current && streamRef.current.id === stream.id) {
                streamRef.current = null;
                console.log(`${logPrefix} Cleared matching stream ref.`);
            } else {
                console.log(`${logPrefix} Stream ref (${streamRef.current?.id}) did not match srcObject stream (${stream.id}), not clearing ref.`);
            }
        } else if (streamRef.current) {
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
       if (streamRef.current) {
           console.log(`${logPrefix} Cleaning up streamRef directly as video ref is null.`);
           streamRef.current.getTracks().forEach(track => track.stop());
           streamRef.current = null;
       }
    }

    setIsActive(false);
    setIsStarting(false);
    setInternalCapturedImageUri(null);

    // Always attempt to clear the image URI using the passed setter
    try {
        // This call relies on setCapturedImageUri being a valid function passed as a prop
        setCapturedImageUri(null);
        console.log(`${logPrefix} Called setCapturedImageUri(null).`);
    } catch (e) {
        // This should ideally not happen if the prop is correctly passed and typed
        console.error(`${logPrefix} Error calling setCapturedImageUri during cleanup:`, e);
        // Optionally set an error state or notify the user if this is critical
        // setError("Internal component error: Failed to clear image state on cleanup.");
    }

    console.log(`${logPrefix} Cleanup finished.`);
  }, [handleVideoError, handleLoadedMetadata, handleVideoPlay, setCapturedImageUri]);


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
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
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

    const lastFrameUri = captureFrame();
    setInternalCapturedImageUri(lastFrameUri);

    try {
       setCapturedImageUri(lastFrameUri);
       console.log(`${logPrefix} Updated parent captured image URI.`);
    } catch (e) {
      console.error(`${logPrefix} Error calling setCapturedImageUri during stop:`, e);
      setError("Internal component error: Failed to update image state on stop.");
    }

    cleanupCamera("manual stop");

    if (onManualStop) {
      console.log(`${logPrefix} Calling onManualStop with image URI (or null):`, lastFrameUri ? 'Yes' : 'No');
      onManualStop(lastFrameUri);
    } else {
       console.warn(`${logPrefix} onManualStop handler not provided.`);
    }
  }, [cleanupCamera, onManualStop, captureFrame, setCapturedImageUri]);


  // --- Start Camera ---
  const startCamera = useCallback(async () => {
    const logPrefix = "[startCamera]";
    console.log(`${logPrefix} Attempting to start...`);
    if (isStarting || isActive) {
      console.warn(`${logPrefix} Aborted - already starting or active.`);
      return;
    }

    // Ensure setCapturedImageUri is a function before proceeding
    if (typeof setCapturedImageUri !== 'function') {
      console.error(`${logPrefix} Aborted - setCapturedImageUri prop is not a function.`);
      setError("Internal component error: State update function missing.");
      setIsStarting(false); // Reset starting state
      return; // Critical error, cannot proceed
    }

    setError(null);
    setHasCameraPermission(null);
    setIsStarting(true);
    setIsActive(false);
    setInternalCapturedImageUri(null);

    try {
      setCapturedImageUri(null); // Clear parent's state
    } catch (e) {
      console.error(`${logPrefix} Error calling setCapturedImageUri during start:`, e);
      setError("Internal component error: Failed to clear image state.");
      setIsStarting(false);
      return;
    }

    console.log(`${logPrefix} Performing pre-start cleanup.`);
    cleanupCamera("startCamera preamble");
    await new Promise(resolve => setTimeout(resolve, 50));

    const video = videoRef.current;
    if (!video) {
        const msg = "Video element reference is not available.";
        console.error(`${logPrefix} ${msg}`);
        setError(msg);
        setIsStarting(false);
        return;
    }

    console.log(`${logPrefix} Attaching video event listeners before stream request.`);
    video.removeEventListener('error', handleVideoError);
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

      let stream: MediaStream | null = null;
      try {
          console.log(`${logPrefix} Trying simple video constraint.`);
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (err: any) {
          console.warn(`${logPrefix} Simple video constraint failed (${err.name}). Trying environment facing.`);
          if (err.name !== 'OverconstrainedError' && err.name !== 'NotFoundError') {
               throw err;
          }
           try {
              console.log(`${logPrefix} Trying environment facing constraint.`);
              stream = await navigator.mediaDevices.getUserMedia({
                  video: { facingMode: "environment" },
                  audio: false
              });
          } catch (innerErr: any) {
              console.error(`${logPrefix} Both simple and environment facing constraints failed.`);
               try {
                   console.warn(`${logPrefix} Environment constraint failed. Trying ANY video device.`);
                   stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
               } catch (finalErr) {
                   console.error(`${logPrefix} All camera constraints (simple, environment, any) failed.`);
                   throw innerErr;
               }
          }
      }

      console.log(`${logPrefix} Stream obtained:`, stream.id);
      setHasCameraPermission(true);
      streamRef.current = stream;

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
      currentVideo.muted = true;
      currentVideo.playsInline = true;
      console.log(`${logPrefix} Set video srcObject.`);

      console.log(`${logPrefix} Attempting video.play()...`);
      currentVideo.play().catch(playError => {
          console.error(`${logPrefix} video.play() promise rejected synchronously:`, playError);
          let playErrorMessage = `Video playback failed: ${playError.name} - ${playError.message}.`;
           if (playError.name === 'NotAllowedError') {
               playErrorMessage += " Ensure action triggered by user interaction & check autoplay policies.";
           } else if (playError.name === 'NotSupportedError') {
               playErrorMessage += " Video format or source might not be supported.";
           }
           const wrappedError = new Error(playErrorMessage);
           (wrappedError as any).cause = playError;
           throw wrappedError;
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
        } else if (['NotReadableError', 'TrackStartError', 'AbortError', 'OverconstrainedError'].includes(err.name)) {
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
         else if (err.message?.startsWith('Video playback failed:')) {
             message = err.message;
         }

        setError(message);
        setHasCameraPermission(permissionRelated ? false : null);
        toast({ title: 'Camera Start Error', description: message, variant: 'destructive', duration: 8000 });
        if (onScanError) onScanError(err instanceof Error ? err : new Error(message));
        cleanupCamera("startCamera error handler");
    } finally {
      if (error || (!isActive && !isStarting)) {
         setIsStarting(false);
      }
      console.log(`${logPrefix} Finished start attempt. State:`, { isStarting, isActive, error });
    }
  }, [toast, onScanError, cleanupCamera, handleVideoError, handleLoadedMetadata, handleVideoPlay, setCapturedImageUri]);


  // Effect to cleanup on error state change
  useEffect(() => {
      if (error && hasCameraPermission !== false) {
          console.log("[ErrorEffect] Cleaning up camera due to error state change:", error);
          cleanupCamera("error effect");
      }
  }, [error, hasCameraPermission, cleanupCamera]);


  // --- Unmount Cleanup ---
  useEffect(() => {
    const componentName = "BarcodeScanner";
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


  return (
    <div className={`flex flex-col items-center gap-4 w-full max-w-xs ${disabled && !isStarting ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Camera/Video Display Area */}
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
           // Show ONLY the "Stop Scanning" button if active and the handler is provided
            onManualStop && (
               <Button onClick={handleStopClick} variant="destructive" disabled={disabled || isStarting} className="transition-subtle">
                 <StopCircle className="mr-2 h-4 w-4" /> Stop Scanning
               </Button>
             )
        ) : null // Don't show buttons while starting, or if permission denied/error occurred (handled in overlays)
        }
      </div>
    </div>
  );
};

export default BarcodeScanner;
