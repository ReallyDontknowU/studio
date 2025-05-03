'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, AlertCircle, Loader2, ScanLine, StopCircle, SwitchCamera, X } from 'lucide-react'; // Added StopCircle
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Image from 'next/image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface BarcodeScannerProps {
  onScanSuccess: (imageDataUri: string) => void; // Callback when a frame is captured (in auto or manual mode)
  onScanError?: (error: Error) => void;
  scanPrompt?: string;
  disabled?: boolean;
  onManualStop?: (imageDataUri: string | null) => void; // Handler for manual stop button click (only used when autoScanMode=false)
  setCapturedImageUri: (uri: string | null) => void; // Function to update parent's image URI state
  autoScanMode?: boolean; // If true, automatically captures frames periodically
  isProcessing?: boolean; // Is the parent component busy processing a scan?
  captureInterval?: number; // Interval in ms for auto-capture (e.g., 1000)
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScanSuccess,
  onScanError,
  scanPrompt = 'Position ID card inside the frame',
  disabled = false,
  onManualStop,
  setCapturedImageUri,
  autoScanMode = false,
  isProcessing = false, // Receive processing status from parent
  captureInterval = 1500, // Default capture interval
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null); // Ref for interval ID

  // Internal state for managing the component's behavior
  const [isStarting, setIsStarting] = useState(false);
  const [isActive, setIsActive] = useState(false); // Is the camera stream currently running?
  const [error, setError] = useState<string | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const { toast } = useToast();

  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);

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
      if ((event as any)?.message?.includes('Could not start video source') || message.includes('MEDIA_ERR_SRC_NOT_SUPPORTED') || message.includes('MEDIA_ERR_DECODE')) {
         message = "Could not start video source. Check if the camera is working, connected, and permissions are granted. Try selecting a different camera if available.";
      }
      setError(message);
      if (onScanError) onScanError(new Error(message));
      setIsActive(false);
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
      setError(null);
      setIsStarting(false);
      setIsSwitchingCamera(false);
  }, []);


  // --- Cleanup Function ---
  const cleanupCamera = useCallback((caller?: string) => {
    const logPrefix = `[Cleanup ${caller || 'unknown'}]`;
    console.log(`${logPrefix} Starting cleanup... Stream ref: ${streamRef.current?.id}`);

    // Clear the auto-scan interval
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
      console.log(`${logPrefix} Cleared auto-scan interval.`);
    }

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
                }
            });
            video.srcObject = null;
            console.log(`${logPrefix} Cleared video srcObject.`);
            if (streamRef.current && streamRef.current.id === stream.id) {
                streamRef.current = null;
                console.log(`${logPrefix} Cleared matching stream ref.`);
            }
        } else if (streamRef.current) {
            console.log(`${logPrefix} No srcObject, but streamRef exists (${streamRef.current.id}). Stopping tracks on ref.`);
             streamRef.current.getTracks().forEach(track => {
                if (track.readyState === 'live') track.stop();
            });
            streamRef.current = null;
            console.log(`${logPrefix} Cleared stream ref.`);
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
    setIsSwitchingCamera(false);

    // Clear parent image state on cleanup
     try {
         if (typeof setCapturedImageUri === 'function') {
             setCapturedImageUri(null);
             console.log(`${logPrefix} Called setCapturedImageUri(null).`);
         } else {
              console.warn(`${logPrefix} setCapturedImageUri is not a function during cleanup.`);
         }
     } catch (e) {
         console.error(`${logPrefix} Error calling setCapturedImageUri during cleanup:`, e);
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


  // --- Auto Scan Logic ---
  useEffect(() => {
    if (autoScanMode && isActive && !isProcessing && !isStarting && !isSwitchingCamera) {
      const logPrefix = "[AutoScanEffect]";
      console.log(`${logPrefix} Starting auto-scan interval (every ${captureInterval}ms).`);

      // Clear any existing interval before starting a new one
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }

      scanIntervalRef.current = setInterval(() => {
        // Double-check conditions inside interval callback
        if (isActive && !isProcessing && !isStarting && !isSwitchingCamera) {
          console.log(`${logPrefix} Capturing frame...`);
          const frame = captureFrame();
          if (frame) {
            try {
                // Don't update parent's preview in auto-scan mode, only call onScanSuccess
                // setCapturedImageUri(frame); // REMOVED: Avoid rapidly updating parent preview
                console.log(`${logPrefix} Calling onScanSuccess.`);
                onScanSuccess(frame); // Send frame to parent for processing
            } catch (e) {
                console.error(`${logPrefix} Error calling onScanSuccess:`, e);
                setError("Internal component error: Failed to process captured frame.");
                // Consider stopping the loop or camera on repeated errors
            }
          } else {
            console.warn(`${logPrefix} Failed to capture frame in interval.`);
          }
        } else {
            console.log(`${logPrefix} Skipping capture in interval (not active or processing).`);
        }
      }, captureInterval);

      // Cleanup function for the effect
      return () => {
        if (scanIntervalRef.current) {
          console.log(`${logPrefix} Clearing auto-scan interval on effect cleanup.`);
          clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = null;
        }
      };
    } else {
      // Ensure interval is cleared if conditions are not met (e.g., processing starts, camera stops)
      if (scanIntervalRef.current) {
        const logPrefix = "[AutoScanEffect Cleanup]";
        console.log(`${logPrefix} Conditions not met, clearing auto-scan interval.`);
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    }
  }, [autoScanMode, isActive, isProcessing, isStarting, isSwitchingCamera, captureInterval, captureFrame, onScanSuccess, setCapturedImageUri]);


  // --- Handle Manual Stop (Only if autoScanMode is false) ---
  const handleManualStopClick = useCallback(() => {
    const logPrefix = "[handleManualStopClick]";
    if (autoScanMode) {
        console.warn(`${logPrefix} Manual stop called in autoScanMode. Ignoring.`);
        return; // Ignore manual stop in auto mode
    }
    console.log(`${logPrefix} Manual stop requested.`);

    const lastFrameUri = captureFrame(); // Try to capture one last frame

    // Update parent state with the captured image URI
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
         setError("Internal component error: Missing setCapturedImageUri function.");
    }


    cleanupCamera("manual stop"); // Stop the camera stream

    // Call the parent handler with the captured URI (or null)
    if (onManualStop) {
      console.log(`${logPrefix} Calling onManualStop with image URI (or null):`, lastFrameUri ? 'Yes' : 'No');
      onManualStop(lastFrameUri);
    } else {
       console.warn(`${logPrefix} onManualStop handler not provided.`);
    }
  }, [cleanupCamera, onManualStop, captureFrame, setCapturedImageUri, autoScanMode]);


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

      const storedDeviceId = localStorage.getItem('preferredCameraId');
      const currentDeviceId = selectedDeviceId || storedDeviceId;

      if (videoInputDevices.length > 0) {
         const deviceExists = videoInputDevices.some(d => d.deviceId === currentDeviceId);
         if (deviceExists && currentDeviceId) {
             console.log(`${logPrefix} Using existing/stored device ID: ${currentDeviceId}`);
             setSelectedDeviceId(currentDeviceId);
         } else {
             const environmentCamera = videoInputDevices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
             const defaultDevice = environmentCamera || videoInputDevices[0];
             console.log(`${logPrefix} Setting default device ID: ${defaultDevice.deviceId}`);
             setSelectedDeviceId(defaultDevice.deviceId);
             localStorage.setItem('preferredCameraId', defaultDevice.deviceId);
         }
      } else {
          console.warn(`${logPrefix} No video input devices found.`);
          setSelectedDeviceId(null);
      }

    } catch (err) {
      console.error(`${logPrefix} Error enumerating devices:`, err);
      setError("Could not list available cameras.");
    }
  }, [selectedDeviceId]);


  // --- Start Camera ---
  const startCamera = useCallback(async (deviceId?: string | null) => {
    const logPrefix = "[startCamera]";
    const targetDeviceId = deviceId || selectedDeviceId;
    console.log(`${logPrefix} Attempting to start... Target Device ID: ${targetDeviceId}`);

    if (isStarting || isActive) {
      console.warn(`${logPrefix} Aborted - already starting or active.`);
      return;
    }
    if (typeof setCapturedImageUri !== 'function') {
      console.error(`${logPrefix} Aborted - setCapturedImageUri prop is not a function.`);
      setError("Internal component error: State update function missing.");
      return;
    }


    setError(null);
    setHasCameraPermission(null);
    setIsStarting(true);
    setIsActive(false);

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
    await new Promise(resolve => setTimeout(resolve, 150));


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

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: targetDeviceId ? { deviceId: { exact: targetDeviceId } } : { facingMode: "environment" } // Prefer back camera if no specific ID
      };
      console.log(`${logPrefix} Using constraints:`, constraints);

      let stream: MediaStream | null = null;
      try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err: any) {
          console.error(`${logPrefix} getUserMedia failed with constraints:`, constraints, err);
          if (targetDeviceId && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError' || err.name === 'NotReadableError')) {
              console.warn(`${logPrefix} Failed to get specific device ${targetDeviceId}. Trying default video.`);
              try {
                  stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                  console.log(`${logPrefix} Successfully fell back to default video stream.`);
                   const actualDeviceId = stream?.getVideoTracks()[0]?.getSettings()?.deviceId;
                   if (actualDeviceId && actualDeviceId !== targetDeviceId) {
                       console.log(`${logPrefix} Fallback stream uses device ID: ${actualDeviceId}. Updating state.`);
                       setSelectedDeviceId(actualDeviceId);
                       localStorage.setItem('preferredCameraId', actualDeviceId);
                       toast({ title: "Camera Switched", description: `Switched to default camera as preferred one was unavailable.`, variant: "default"});
                   }

              } catch (fallbackErr) {
                  console.error(`${logPrefix} Fallback to default video also failed.`);
                  throw err;
              }
          } else {
              throw err;
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
      await currentVideo.play();

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
            message = 'Camera does not support requested constraints (e.g., resolution).';
        } else if (err.name === 'SecurityError') {
            message = 'Camera access denied due to security settings (requires HTTPS or localhost).';
            permissionRelated = true;
        } else if (err.name === 'TypeError' && err.message?.includes('getUserMedia')) {
             message = 'Camera access (getUserMedia) is not supported by this browser or context (e.g., HTTP).';
        }
         else if (err.message?.startsWith('Video playback failed:')) {
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
    } finally {
      // 'play' event listener sets isActive and clears isStarting
      console.log(`${logPrefix} Finished start attempt. State:`, { isStarting, isActive, error });
    }
  }, [selectedDeviceId, isStarting, isActive, setCapturedImageUri, toast, onScanError, cleanupCamera, handleVideoError, handleLoadedMetadata, handleVideoPlay]);


  // Effect to enumerate devices on mount
  useEffect(() => {
      enumerateDevices();
  }, [enumerateDevices]);

  // Effect to cleanup on error or permission denial
  useEffect(() => {
      if (error && !isStarting) {
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
      enumerateDevices().then(() => {
          startCamera();
      });
    } else {
      console.log("[InitialStartClick] Ignoring click. Conditions:", { isStarting, isActive, disabled });
    }
  };

   // --- Handle Camera Switch ---
  const handleCameraSwitch = useCallback((newDeviceId: string) => {
    if (newDeviceId === selectedDeviceId || isSwitchingCamera || isStarting) {
      return;
    }
    console.log(`[handleCameraSwitch] Switching to device ID: ${newDeviceId}`);
    setIsSwitchingCamera(true);
    setError(null);
    setSelectedDeviceId(newDeviceId);
    localStorage.setItem('preferredCameraId', newDeviceId);

    if (isActive) {
      cleanupCamera("camera switch");
      setTimeout(() => {
        startCamera(newDeviceId);
      }, 150);
    } else {
       setIsSwitchingCamera(false);
    }
  }, [selectedDeviceId, isActive, isSwitchingCamera, isStarting, startCamera, cleanupCamera]);


  // Function to clear errors
  const clearError = () => setError(null);


  return (
    <div className={`flex flex-col items-center gap-4 w-full max-w-xs ${disabled && !isStarting && !autoScanMode ? 'opacity-50 pointer-events-none' : ''}`}> {/* Disable only if not autoScanMode */}

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
            {isActive && !isStarting && !isSwitchingCamera && (
                <div className="absolute inset-0 pointer-events-none z-5">
                     {/* More vertical rectangle */}
                    <div className="absolute inset-x-[10%] inset-y-[5%] border-2 border-accent/50 rounded pointer-events-none" aria-hidden="true"></div>
                    <p className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-center text-xs text-white bg-black/50 px-2 py-1 rounded">
                    {scanPrompt}
                    </p>
                     {/* Scanning indicator for auto mode */}
                     {autoScanMode && !isProcessing && (
                        <ScanLine className="absolute top-4 right-4 h-5 w-5 text-green-400 animate-pulse" />
                     )}
                     {/* Processing indicator */}
                     {isProcessing && (
                        <div className="absolute top-4 left-4 flex items-center gap-1 text-xs text-white bg-black/60 px-2 py-0.5 rounded">
                           <Loader2 className="h-3 w-3 animate-spin" />
                           Processing...
                        </div>
                     )}
                </div>
            )}
        </div>

        {/* Permission Denied Overlay */}
        {hasCameraPermission === false && !isStarting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20 p-4">
                <Alert variant="destructive" className="w-full max-w-xs">
                   <div className="flex justify-between items-start">
                       <div>
                            <AlertCircle className="h-4 w-4 inline-block mr-1 -translate-y-0.5" />
                            <AlertTitle className="inline-block">Camera Access Denied</AlertTitle>
                            <AlertDescription>
                                Please allow camera access in your browser settings and refresh the page.
                            </AlertDescription>
                        </div>
                    </div>
                </Alert>
            </div>
        )}
        {/* General Error Overlay */}
        {error && !isStarting && !isSwitchingCamera && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20 p-4">
                <Alert variant="destructive" className="w-full max-w-xs">
                   <div className="flex justify-between items-start">
                       <div>
                            <AlertCircle className="h-4 w-4 inline-block mr-1 -translate-y-0.5" />
                            <AlertTitle className="inline-block">Scanner Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={clearError}>
                           <X className="h-4 w-4" />
                           <span className="sr-only">Clear Error</span>
                        </Button>
                    </div>
                    <Button onClick={handleInitialStartClick} variant="secondary" size="sm" className="mt-2 text-xs" disabled={isStarting}>
                        <RefreshCw className="mr-1 h-3 w-3" /> Try Again
                    </Button>
                </Alert>
            </div>
        )}
        {/* Hidden canvas for capturing frames */}
        <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true"></canvas>
      </div>

       {/* Control Buttons */}
      <div className="flex gap-2">
        {!isActive && !isStarting && hasCameraPermission !== false && !error ? (
          // Show "Start Camera" button if inactive and no errors/denial
          <Button onClick={handleInitialStartClick} disabled={disabled || isStarting || isSwitchingCamera} className="transition-subtle">
            <Camera className="mr-2 h-4 w-4" /> Start Camera
          </Button>
        ) :
        isActive && !isStarting && !isSwitchingCamera && !autoScanMode ? (
           // Show "Stop Scanning" button ONLY if active AND NOT in autoScanMode AND handler is provided
            onManualStop && (
               <Button onClick={handleManualStopClick} variant="destructive" disabled={disabled || isStarting || isSwitchingCamera} className="transition-subtle">
                 <StopCircle className="mr-2 h-4 w-4" /> Stop Scanning
               </Button>
             )
        ) : null // Don't show buttons while starting, switching, or if permission denied/error occurred (handled in overlays), or if in autoScanMode
        }
      </div>
    </div>
  );
};

export default BarcodeScanner;
