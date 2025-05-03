

'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, AlertCircle, Loader2, ScanLine, StopCircle, SwitchCamera } from 'lucide-react'; // Added SwitchCamera
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Image from 'next/image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'; // Added Select

interface BarcodeScannerProps {
  onScanSuccess?: (imageDataUri: string) => void; // Optional now
  onScanError?: (error: Error) => void;
  scanPrompt?: string;
  disabled?: boolean;
  onManualStop?: (imageDataUri: string | null) => void; // Handler for when user clicks Stop
  setCapturedImageUri: (uri: string | null) => void; // Make mandatory for state update
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScanSuccess,
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

  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false); // State for camera switch loading


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
          console.error(`${logPrefix} Details: Code ${videoError.code}, Message: ${videoError.message}`);
      }
      // Check for specific message indicating device issue
      if ((event as any)?.message?.includes('Could not start video source') || message.includes('MEDIA_ERR_SRC_NOT_SUPPORTED') || message.includes('MEDIA_ERR_DECODE')) {
         message = "Could not start video source. Check if the camera is working, connected, and permissions are granted. Try selecting a different camera if available.";
      }


      setError(message);
      // Don't toast immediately on every video error, might be transient. Let startCamera handle more specific errors.
      // toast({ title: "Video Playback Error", description: message, variant: "destructive", duration: 8000 });
      if (onScanError) onScanError(new Error(message));
      setIsActive(false); // Ensure scanner is marked inactive on error
      setIsStarting(false);
  }, [onScanError]);

  const handleLoadedMetadata = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      console.log("[loadedmetadata] Video metadata loaded. Dimensions:", video.videoWidth, "x", video.videoHeight);
  }, []);

  const handleVideoPlay = useCallback(() => {
      console.log("[play] Video playback started successfully.");
      setIsActive(true);
      setError(null); // Clear previous errors on successful play
      setIsStarting(false);
      setIsSwitchingCamera(false); // Finish switching camera indicator
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
    setIsSwitchingCamera(false); // Ensure switching state is reset
    setInternalCapturedImageUri(null);

    // Always attempt to clear the image URI using the passed setter
    if (typeof setCapturedImageUri === 'function') {
        try {
            setCapturedImageUri(null);
            console.log(`${logPrefix} Called setCapturedImageUri(null).`);
        } catch (e) {
            console.error(`${logPrefix} Error calling setCapturedImageUri during cleanup:`, e);
        }
    } else {
         console.warn(`${logPrefix} setCapturedImageUri prop is not a function during cleanup.`);
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
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageDataUri = canvas.toDataURL('image/png'); // Use PNG for better quality potentially
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
    setInternalCapturedImageUri(lastFrameUri);

    if (typeof setCapturedImageUri === 'function') {
        try {
           setCapturedImageUri(lastFrameUri);
           console.log(`${logPrefix} Updated parent captured image URI.`);
        } catch (e) {
          console.error(`${logPrefix} Error calling setCapturedImageUri during stop:`, e);
          setError("Internal component error: Failed to update image state on stop.");
        }
    } else {
         console.warn(`${logPrefix} setCapturedImageUri prop is not a function during stop.`);
    }


    cleanupCamera("manual stop");

    if (onManualStop) {
      console.log(`${logPrefix} Calling onManualStop with image URI (or null):`, lastFrameUri ? 'Yes' : 'No');
      onManualStop(lastFrameUri);
    } else {
       console.warn(`${logPrefix} onManualStop handler not provided.`);
    }
  }, [cleanupCamera, onManualStop, captureFrame, setCapturedImageUri]);

  // --- Enumerate Devices ---
  const enumerateDevices = useCallback(async () => {
    const logPrefix = "[enumerateDevices]";
    console.log(`${logPrefix} Enumerating devices...`);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn(`${logPrefix} enumerateDevices is not supported.`);
        return;
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputDevices = devices.filter(device => device.kind === 'videoinput');
      console.log(`${logPrefix} Found ${videoInputDevices.length} video devices:`, videoInputDevices);
      setVideoDevices(videoInputDevices);

      // Load preferred device from localStorage
      const storedDeviceId = localStorage.getItem('preferredCameraId');
      const currentDeviceId = selectedDeviceId || storedDeviceId;

      // Set initial device or keep current if valid
      if (videoInputDevices.length > 0) {
         const deviceExists = videoInputDevices.some(d => d.deviceId === currentDeviceId);
         if (deviceExists && currentDeviceId) {
             console.log(`${logPrefix} Using existing/stored device ID: ${currentDeviceId}`);
             setSelectedDeviceId(currentDeviceId);
         } else {
             // Prefer environment facing if available and no preference/invalid preference
             const environmentCamera = videoInputDevices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
             const defaultDevice = environmentCamera || videoInputDevices[0];
             console.log(`${logPrefix} Setting default device ID: ${defaultDevice.deviceId}`);
             setSelectedDeviceId(defaultDevice.deviceId);
             localStorage.setItem('preferredCameraId', defaultDevice.deviceId); // Save default
         }
      } else {
          console.warn(`${logPrefix} No video input devices found.`);
          setSelectedDeviceId(null); // No devices available
      }

    } catch (err) {
      console.error(`${logPrefix} Error enumerating devices:`, err);
      setError("Could not list available cameras.");
    }
  }, [selectedDeviceId]); // Re-run if selectedDeviceId changes externally? Maybe not needed.


  // --- Start Camera ---
  const startCamera = useCallback(async (deviceId?: string | null) => {
    const logPrefix = "[startCamera]";
    const targetDeviceId = deviceId || selectedDeviceId; // Use provided or state deviceId
    console.log(`${logPrefix} Attempting to start... Target Device ID: ${targetDeviceId}`);

    if (isStarting || isActive) {
      console.warn(`${logPrefix} Aborted - already starting or active.`);
      return;
    }
    if (!setCapturedImageUri || typeof setCapturedImageUri !== 'function') {
      console.error(`${logPrefix} Aborted - setCapturedImageUri prop is not a function.`);
      setError("Internal component error: State update function missing.");
      setIsStarting(false);
      return;
    }

    setError(null);
    setHasCameraPermission(null);
    setIsStarting(true);
    setIsActive(false);
    setInternalCapturedImageUri(null);

    try {
      setCapturedImageUri(null);
    } catch (e) {
      console.error(`${logPrefix} Error calling setCapturedImageUri during start:`, e);
      setError("Internal component error: Failed to clear image state.");
      setIsStarting(false);
      return;
    }

    console.log(`${logPrefix} Performing pre-start cleanup.`);
    cleanupCamera("startCamera preamble");
    // Short delay to ensure cleanup completes before requesting stream again
    await new Promise(resolve => setTimeout(resolve, 100));


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

      // Construct constraints based on selected device ID
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: targetDeviceId ? { deviceId: { exact: targetDeviceId } } : true // Use exact deviceId if available, otherwise default video
      };
      console.log(`${logPrefix} Using constraints:`, constraints);

      let stream: MediaStream | null = null;
      try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err: any) {
          console.error(`${logPrefix} getUserMedia failed with constraints:`, constraints, err);
          // If specific device fails, try default video as fallback?
          if (targetDeviceId && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError' || err.name === 'NotReadableError')) {
              console.warn(`${logPrefix} Failed to get specific device ${targetDeviceId}. Trying default video.`);
              try {
                  stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                  console.log(`${logPrefix} Successfully fell back to default video stream.`);
                  // Update selectedDeviceId if fallback worked? Or notify user?
                  // Maybe clear the errored deviceId?
                   const actualDeviceId = stream?.getVideoTracks()[0]?.getSettings()?.deviceId;
                   if (actualDeviceId && actualDeviceId !== targetDeviceId) {
                       console.log(`${logPrefix} Fallback stream uses device ID: ${actualDeviceId}. Updating state.`);
                       setSelectedDeviceId(actualDeviceId); // Update state to reflect actual device
                       localStorage.setItem('preferredCameraId', actualDeviceId); // Save fallback choice
                       toast({ title: "Camera Switched", description: `Switched to default camera as preferred one was unavailable.`, variant: "default"});
                   }

              } catch (fallbackErr) {
                  console.error(`${logPrefix} Fallback to default video also failed.`);
                  throw err; // Re-throw the original error for better context
              }
          } else {
              throw err; // Re-throw other errors (like permission denied)
          }
      }


      console.log(`${logPrefix} Stream obtained:`, stream.id);
      setHasCameraPermission(true);
      streamRef.current = stream;

      const currentVideo = videoRef.current; // Re-check ref
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
      currentVideo.playsInline = true; // Important for mobile
      console.log(`${logPrefix} Set video srcObject.`);

      console.log(`${logPrefix} Attempting video.play()...`);
      await currentVideo.play(); // Wait for play() promise
      // Playback success is handled by the 'play' event listener now

    } catch (err: any) {
        console.error(`${logPrefix} Error during camera start or playback:`, err);
        let message = `Could not start camera. Error: ${err.name || 'UnknownError'} - ${err.message || 'No details'}`;
        let permissionRelated = false;

        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            message = 'Camera permission denied. Please allow access in browser settings and refresh.';
            permissionRelated = true;
        } else if (['NotFoundError', 'DevicesNotFoundError'].includes(err.name)) {
            message = 'Selected camera not found or unavailable. Try another camera or ensure it is connected.';
        } else if (['NotReadableError', 'TrackStartError', 'AbortError'].includes(err.name)) {
             message = err.name === 'NotReadableError'
             ? 'Selected camera might be in use by another application or encountered a hardware issue. Try closing other apps/tabs or selecting a different camera.'
             : `Camera hardware error (${err.name}). Try refreshing or restarting device.`;
        } else if (err.name === 'OverconstrainedError') {
            message = 'Camera does not support requested constraints (e.g., resolution).'; // Less likely with just deviceId
        } else if (err.name === 'SecurityError') {
            message = 'Camera access denied due to security settings (requires HTTPS or localhost).';
            permissionRelated = true;
        } else if (err.name === 'TypeError' && err.message?.includes('getUserMedia')) {
             message = 'Camera access (getUserMedia) is not supported by this browser or context (e.g., HTTP).';
        }
         else if (err.message?.startsWith('Video playback failed:')) { // Check if play() failed explicitly
             message = err.message;
         }
         else if (err.message?.includes('Could not start video source')) {
              message = 'Could not start video source. Check camera connection and permissions.';
         }


        setError(message);
        setHasCameraPermission(permissionRelated ? false : null);
        toast({ title: 'Camera Start Error', description: message, variant: 'destructive', duration: 8000 });
        if (onScanError) onScanError(err instanceof Error ? err : new Error(message));
        cleanupCamera("startCamera error handler");
        // Do not set isStarting false here, cleanup handles it
    } finally {
      // Don't set isStarting = false here, let the 'play' event listener do it on success
      // or the error handler + cleanupCamera on failure.
      console.log(`${logPrefix} Finished start attempt. State:`, { isStarting, isActive, error });
    }
  }, [selectedDeviceId, isStarting, isActive, setCapturedImageUri, toast, onScanError, cleanupCamera, handleVideoError, handleLoadedMetadata, handleVideoPlay]); // Add selectedDeviceId


  // Effect to enumerate devices on mount and when permission might change
  useEffect(() => {
      enumerateDevices();
  }, [enumerateDevices]);

  // Effect to cleanup on error state change or permission denial
  useEffect(() => {
      if (error && !isStarting) { // Cleanup if error occurs and not currently trying to start
          console.log("[ErrorEffect] Cleaning up camera due to error state change:", error);
          cleanupCamera("error effect");
      }
      if (hasCameraPermission === false) {
         console.log("[PermissionEffect] Cleaning up camera due to permission denial.");
         cleanupCamera("permission denied effect");
      }
  }, [error, hasCameraPermission, isStarting, cleanupCamera]);


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
      // Enumerate devices again before starting, in case they changed
      enumerateDevices().then(() => {
          startCamera(); // Start with the currently selected device ID
      });
    } else {
      console.log("[InitialStartClick] Ignoring click. Conditions:", { isStarting, isActive, disabled });
    }
  };

   // --- Handle Camera Switch ---
  const handleCameraSwitch = useCallback((newDeviceId: string) => {
    if (newDeviceId === selectedDeviceId || isSwitchingCamera || isStarting) {
      return; // No change or already switching/starting
    }
    console.log(`[handleCameraSwitch] Switching to device ID: ${newDeviceId}`);
    setIsSwitchingCamera(true); // Set loading state for switch
    setError(null); // Clear previous errors
    setSelectedDeviceId(newDeviceId);
    localStorage.setItem('preferredCameraId', newDeviceId); // Save preference

    // If the camera is already active, stop it and restart with the new device
    if (isActive) {
      cleanupCamera("camera switch");
       // Use a timeout to allow cleanup to finish before starting again
      setTimeout(() => {
        startCamera(newDeviceId);
      }, 150); // Increased delay slightly
    } else {
       setIsSwitchingCamera(false); // If not active, just update state, don't start automatically
    }
  }, [selectedDeviceId, isActive, isSwitchingCamera, isStarting, startCamera, cleanupCamera]);


  return (
    <div className={`flex flex-col items-center gap-4 w-full max-w-xs ${disabled && !isStarting ? 'opacity-50 pointer-events-none' : ''}`}>

       {/* Camera Device Selector */}
       {videoDevices.length > 1 && (
           <div className="w-full">
               <Select
                   value={selectedDeviceId || ''}
                   onValueChange={handleCameraSwitch}
                   disabled={isStarting || isSwitchingCamera || disabled}
               >
                   <SelectTrigger className="w-full">
                       <SelectValue placeholder="Select Camera" />
                   </SelectTrigger>
                   <SelectContent>
                       {videoDevices.map((device) => (
                           <SelectItem key={device.deviceId} value={device.deviceId}>
                               {device.label || `Camera ${videoDevices.indexOf(device) + 1}`}
                           </SelectItem>
                       ))}
                   </SelectContent>
               </Select>
                {isSwitchingCamera && (
                    <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mt-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Switching camera...</span>
                    </div>
                )}
           </div>
        )}

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
            {/* Loading Overlay (Starting or Switching) */}
            {(isStarting || isSwitchingCamera) && !error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white z-10 pointer-events-none">
                    <Loader2 className="h-8 w-8 animate-spin mb-2" />
                    <p className="text-sm text-muted-foreground">{isSwitchingCamera ? 'Switching camera...' : 'Starting camera...'}</p>
                </div>
            )}
            {/* Scan Guidance Overlay - Adjusted for vertical ID */}
            {isActive && !isStarting && !isSwitchingCamera && ( // Only show when fully active
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
        {error && !isStarting && !isSwitchingCamera && ( // Show error only when not starting/switching
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
          <Button onClick={handleInitialStartClick} disabled={disabled || isStarting || isSwitchingCamera} className="transition-subtle">
            <Camera className="mr-2 h-4 w-4" /> Start Camera
          </Button>
        ) :
        isActive && !isStarting && !isSwitchingCamera? (
           // Show ONLY the "Stop Scanning" button if active and the handler is provided
            onManualStop && (
               <Button onClick={handleStopClick} variant="destructive" disabled={disabled || isStarting || isSwitchingCamera} className="transition-subtle">
                 <StopCircle className="mr-2 h-4 w-4" /> Stop Scanning
               </Button>
             )
        ) : null // Don't show buttons while starting, switching, or if permission denied/error occurred (handled in overlays)
        }
      </div>
    </div>
  );
};

export default BarcodeScanner;

