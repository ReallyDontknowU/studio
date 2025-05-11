'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, AlertCircle, Loader2, ScanLine, StopCircle, SwitchCamera, X, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Image from 'next/image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface BarcodeScannerProps {
  onScanSuccess: (imageDataUri: string) => void; // Callback when a frame is captured
  onScanError?: (error: Error) => void;
  scanPrompt?: string;
  disabled?: boolean; // Disables the entire component

  // Props for MANUAL scan mode (e.g., Add Student)
  showStopButton?: boolean;
  onManualStop?: (imageDataUri: string | null) => void;
  setCapturedImageUri?: React.Dispatch<React.SetStateAction<string | null>>; // Optional: Used in Add Student for preview

  // Props for controlling AUTO scan mode (e.g., Record Entry/Exit)
  autoScanMode?: boolean;
  isProcessing?: boolean; // Is the parent component busy processing a scan?
  captureInterval?: number;
  isDetecting?: boolean; // Is the parent component detecting an ID card?
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScanSuccess,
  onScanError,
  scanPrompt = 'Position ID card inside the frame',
  disabled = false,
  // Manual mode props
  showStopButton = false,
  onManualStop,
  setCapturedImageUri, // Still optional for Add Student
  // Auto mode props
  autoScanMode = false,
  isProcessing = false,
  captureInterval = 1500,
  isDetecting = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Internal state
  const [isStarting, setIsStarting] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const { toast } = useToast();

  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const cleanupCalledRef = useRef(false);

  // Add new state for camera support check
  const [isCameraSupported, setIsCameraSupported] = useState<boolean>(true);

  // Add new state for browser compatibility
  const [browserCompatibility, setBrowserCompatibility] = useState<{
    isSupported: boolean;
    message: string;
    requiresHttps: boolean;
    browserInfo: string;
  }>({
    isSupported: true,
    message: '',
    requiresHttps: false,
    browserInfo: ''
  });

  // Check for camera support on mount
  useEffect(() => {
    const checkBrowserCompatibility = async () => {
      // Get browser information
      const userAgent = navigator.userAgent;
      let browserName = 'Unknown';
      
      if (userAgent.includes('Chrome')) browserName = 'Chrome';
      else if (userAgent.includes('Firefox')) browserName = 'Firefox';
      else if (userAgent.includes('Safari')) browserName = 'Safari';
      else if (userAgent.includes('Edge')) browserName = 'Edge';
      else if (userAgent.includes('MSIE') || userAgent.includes('Trident/')) browserName = 'Internet Explorer';

      // Check if running in a browser environment
      if (typeof window === 'undefined') {
        return {
          isSupported: false,
          message: 'Camera access is only available in browser environments.',
          requiresHttps: false,
          browserInfo: browserName
        };
      }

      // Check if running on HTTPS or localhost
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const isHttps = window.location.protocol === 'https:';
      
      if (!isLocalhost && !isHttps) {
        return {
          isSupported: false,
          message: 'Camera access requires HTTPS or localhost. Please use a secure connection.',
          requiresHttps: true,
          browserInfo: browserName
        };
      }

      // Try to detect camera support using multiple methods
      const checkCameraSupport = async () => {
        try {
          // Method 1: Check if mediaDevices exists
          if (!navigator.mediaDevices) {
            // Try to polyfill mediaDevices if it doesn't exist
            (navigator as any).mediaDevices = {};
          }

          // Method 2: Check if getUserMedia exists in mediaDevices
          if (!navigator.mediaDevices.getUserMedia) {
            // Try to polyfill getUserMedia
            (navigator.mediaDevices as any).getUserMedia = function(constraints: MediaStreamConstraints) {
              const getUserMedia = (navigator as any).webkitGetUserMedia || 
                                 (navigator as any).mozGetUserMedia || 
                                 (navigator as any).msGetUserMedia;

              if (!getUserMedia) {
                return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
              }

              return new Promise((resolve, reject) => {
                getUserMedia.call(navigator, constraints, resolve, reject);
              });
            };
          }

          // Method 3: Try to enumerate devices
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            console.log('Available video devices:', videoDevices);
            return videoDevices.length > 0;
          } catch (error) {
            console.error('Error enumerating devices:', error);
          }

          // Method 4: Try to get user media
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (stream) {
              stream.getTracks().forEach(track => track.stop());
              return true;
            }
          } catch (error) {
            console.error('Error accessing camera:', error);
            if (error instanceof Error) {
              if (error.name === 'NotAllowedError') {
                return {
                  isSupported: true,
                  message: 'Camera access was denied. Please allow camera access in your browser settings.',
                  requiresHttps: false,
                  browserInfo: browserName
                };
              } else if (error.name === 'NotFoundError') {
                return {
                  isSupported: true,
                  message: 'No camera found. Please connect a camera and try again.',
                  requiresHttps: false,
                  browserInfo: browserName
                };
              }
            }
          }

          return false;
        } catch (error) {
          console.error('Error checking camera support:', error);
          return false;
        }
      };

      const cameraSupport = await checkCameraSupport();
      
      if (!cameraSupport) {
        return {
          isSupported: false,
          message: `Your browser (${browserName}) does not support camera access. Please ensure:
            1. You are using a modern browser (Chrome, Firefox, or Edge)
            2. Camera permissions are enabled in your browser settings
            3. No other application is using the camera
            4. Your camera is properly connected and working`,
          requiresHttps: false,
          browserInfo: browserName
        };
      }

      return {
        isSupported: true,
        message: '',
        requiresHttps: false,
        browserInfo: browserName
      };
    };

    checkBrowserCompatibility().then(compatibility => {
      setBrowserCompatibility(compatibility);
      setIsCameraSupported(compatibility.isSupported);
      
      if (!compatibility.isSupported) {
        setError(compatibility.message);
      }
    });
  }, []);

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
      if (message.includes('MEDIA_ERR_SRC_NOT_SUPPORTED') || message.includes('MEDIA_ERR_DECODE') || (event as any)?.message?.includes('Could not start video source')) {
         message = "Could not start video source. Check camera connection/permissions. Try selecting a different camera.";
      }

      setError(message);
      if (onScanError) onScanError(new Error(message));
      setIsActive(false);
      setIsStarting(false);
      setIsSwitchingCamera(false);
      cleanupCamera("video error handler");
  }, [onScanError]); // Removed cleanupCamera dependency

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
      cleanupCalledRef.current = false;
  }, []);

  // --- Cleanup Function ---
  const cleanupCamera = useCallback((caller?: string) => {
    const logPrefix = `[Cleanup ${caller || 'unknown'}]`;
    if (cleanupCalledRef.current) {
        console.log(`${logPrefix} Already called, skipping redundant cleanup.`);
        return;
    }
    console.log(`${logPrefix} Starting cleanup... Stream ref: ${streamRef.current?.id}`);
    cleanupCalledRef.current = true;

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
            stream.getTracks().forEach(track => track.stop());
            video.srcObject = null;
            console.log(`${logPrefix} Cleared video srcObject.`);
            if (streamRef.current && streamRef.current.id === stream.id) {
                streamRef.current = null;
                console.log(`${logPrefix} Cleared matching stream ref.`);
            }
        } else if (streamRef.current) {
            console.log(`${logPrefix} No srcObject, but streamRef exists (${streamRef.current.id}). Stopping tracks on ref.`);
             streamRef.current.getTracks().forEach(track => track.stop());
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

    // Clear parent image state ONLY IF the setter function is provided (for manual mode preview)
    try {
        if (typeof setCapturedImageUri === 'function') {
            setCapturedImageUri(null);
            console.log(`${logPrefix} Called setCapturedImageUri(null).`);
        } else {
           // console.log(`${logPrefix} setCapturedImageUri prop not provided or not a function.`);
        }
    } catch (e) {
        console.error(`${logPrefix} Error calling setCapturedImageUri during cleanup:`, e);
    }

    console.log(`${logPrefix} Cleanup finished.`);
    setTimeout(() => { cleanupCalledRef.current = false; }, 100);
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

      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }

      scanIntervalRef.current = setInterval(() => {
        if (isActive && !isProcessing && !isStarting && !isSwitchingCamera) {
          console.log(`${logPrefix} Capturing frame...`);
          const frame = captureFrame();
          if (frame) {
            try {
                console.log(`${logPrefix} Calling onScanSuccess.`);
                onScanSuccess(frame);
            } catch (e) {
                console.error(`${logPrefix} Error calling onScanSuccess:`, e);
                setError("Internal component error: Failed to process captured frame.");
            }
          } else {
            console.warn(`${logPrefix} Failed to capture frame in interval.`);
          }
        }
      }, captureInterval);

      return () => {
        if (scanIntervalRef.current) {
          console.log(`${logPrefix} Clearing auto-scan interval on effect cleanup.`);
          clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = null;
        }
      };
    } else {
      if (scanIntervalRef.current) {
        const logPrefix = "[AutoScanEffect Cleanup]";
        console.log(`${logPrefix} Conditions not met, clearing auto-scan interval.`);
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    }
  }, [autoScanMode, isActive, isProcessing, isStarting, isSwitchingCamera, captureInterval, captureFrame, onScanSuccess]);

  // --- Handle Manual Stop ---
  const handleManualStopClick = useCallback(() => {
    const logPrefix = "[handleManualStopClick]";
    if (autoScanMode || typeof onManualStop !== 'function') {
      console.warn(`${logPrefix} Manual stop called inappropriately. Ignoring.`);
      return;
    }
    console.log(`${logPrefix} Manual stop requested.`);

    const lastFrameUri = captureFrame();

    if (typeof setCapturedImageUri === 'function') {
        try {
           setCapturedImageUri(lastFrameUri);
           console.log(`${logPrefix} Updated parent captured image URI.`);
        } catch (e) {
          console.error(`${logPrefix} Error calling setCapturedImageUri during stop:`, e);
          setError("Internal component error: Failed to update image state on stop.");
        }
    }

    cleanupCamera("manual stop");

    console.log(`${logPrefix} Calling onManualStop with image URI (or null):`, lastFrameUri ? 'Yes' : 'No');
    onManualStop(lastFrameUri);
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
  const startCamera = useCallback(async () => {
    if (!isCameraSupported) {
      setError('Camera access is not supported by this browser. Please use a modern browser that supports camera access.');
      return;
    }

    if (isStarting || isActive || disabled) {
      console.log("[startCamera] Ignoring start request. Conditions:", { isStarting, isActive, disabled });
        return;
    }

    setIsStarting(true);
    setError(null);
    cleanupCalledRef.current = false;

    try {
      const constraints = {
        video: {
          facingMode: 'environment',
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      const video = videoRef.current;
      
      if (!video) {
        throw new Error('Video element not found');
      }

      video.srcObject = stream;
      video.addEventListener('error', handleVideoError);
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('play', handleVideoPlay);

      await video.play();
      setHasCameraPermission(true);
    } catch (error: any) {
      console.error("[startCamera] Error:", error);
      let errorMessage = 'Failed to access camera.';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Camera access was denied. Please allow camera access in your browser settings.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No camera found. Please connect a camera and try again.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Camera is already in use by another application.';
      } else if (error.name === 'OverconstrainedError') {
        errorMessage = 'Camera constraints could not be satisfied. Try selecting a different camera.';
      }

      setError(errorMessage);
      if (onScanError) onScanError(error);
      cleanupCamera("startCamera error");
    }
  }, [isStarting, isActive, disabled, selectedDeviceId, handleVideoError, handleLoadedMetadata, handleVideoPlay, onScanError, cleanupCamera, isCameraSupported]);

  // Effect to enumerate devices on mount
  useEffect(() => {
      enumerateDevices();
  }, [enumerateDevices]);

  // Effect to cleanup on error or permission denial
  useEffect(() => {
      if (error && !isStarting && !isSwitchingCamera) {
          console.log("[ErrorEffect] Cleaning up camera due to error state change:", error);
          cleanupCamera("error effect");
      }
      if (hasCameraPermission === false && !isStarting && !isSwitchingCamera) {
         console.log("[PermissionEffect] Cleaning up camera due to permission denial.");
         cleanupCamera("permission denied effect");
      }
  }, [error, hasCameraPermission, isStarting, isSwitchingCamera, cleanupCamera]);

  // --- Unmount Cleanup ---
  useEffect(() => {
    const componentName = "BarcodeScanner";
    console.log(`${componentName}: Mounting.`);
    return () => {
      console.log(`${componentName}: Unmounting. Cleaning up camera.`);
      cleanupCamera("unmount");
    };
  }, [cleanupCamera]);

  // --- Handle initial button press ---
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
      console.log(`[handleCameraSwitch] Ignoring switch to ${newDeviceId}. Conditions:`, { sameId: newDeviceId === selectedDeviceId, isSwitching: isSwitchingCamera, isStarting });
      return;
    }
    console.log(`[handleCameraSwitch] Switching to device ID: ${newDeviceId}`);
    setIsSwitchingCamera(true);
    setError(null);
    setSelectedDeviceId(newDeviceId);
    localStorage.setItem('preferredCameraId', newDeviceId);

    cleanupCamera("camera switch");
    setTimeout(() => {
      startCamera();
    }, 200);
  }, [selectedDeviceId, isSwitchingCamera, isStarting, startCamera, cleanupCamera]);

  const clearError = () => setError(null);

  return (
    <div className={`flex flex-col items-center gap-4 w-full max-w-xs ${disabled && !isStarting && !isActive ? 'opacity-50 pointer-events-none' : ''}`}>

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
                       {videoDevices.map((device, index) => (
                           <SelectItem key={device.deviceId || `device-${index}`} value={device.deviceId}>
                               {device.label || `Camera ${index + 1}`}
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
       <div className={`w-full aspect-[2/3] border rounded-lg overflow-hidden shadow-md bg-muted relative ${isActive || isStarting || error || hasCameraPermission === false ? 'block' : 'hidden'}`}>
         {/* Video element */}
         <div className={`relative w-full h-full ${isActive || isStarting ? 'block' : 'hidden'}`}>
             <video
                 ref={videoRef}
                 className={`w-full h-full object-cover block bg-black transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`}
                 playsInline
                 muted
                 autoPlay
                 aria-label="Camera feed for ID card capture"
             />
             {/* Loading Overlay */}
             {(isStarting || isSwitchingCamera) && !error && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white z-10 pointer-events-none">
                     <Loader2 className="h-8 w-8 animate-spin mb-2" />
                     <p className="text-sm text-muted-foreground">{isSwitchingCamera ? 'Switching camera...' : 'Starting camera...'}</p>
                 </div>
             )}
             {/* Scan Guidance Overlay */}
             {isActive && !isStarting && !isSwitchingCamera && (
                 <div className="absolute inset-0 pointer-events-none z-5">
                     <div className="absolute inset-x-[10%] inset-y-[5%] border-2 border-accent/50 rounded pointer-events-none" aria-hidden="true"></div>
                     <p className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-center text-xs text-white bg-black/50 px-2 py-1 rounded">
                     {scanPrompt}
                     </p>
                      {/* Scanning/Detecting/Processing indicators */}
                      {autoScanMode && !isProcessing && (
                         <ScanLine className="absolute top-4 right-4 h-5 w-5 text-green-400 animate-pulse" />
                      )}
                      {isDetecting && (
                        <div className="absolute top-4 left-4 flex items-center gap-1 text-xs text-white bg-blue-900/70 px-2 py-0.5 rounded">
                            <Eye className="h-3 w-3 animate-pulse" />
                            Detecting...
                        </div>
                      )}
                      {isProcessing && !isDetecting && (
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
         <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true"></canvas>
       </div>

       {/* Control Buttons */}
       <div className="flex gap-2">
         {!isActive && !isStarting && hasCameraPermission !== false && !error ? (
           <Button onClick={handleInitialStartClick} disabled={disabled || isStarting || isSwitchingCamera} className="transition-subtle">
             <Camera className="mr-2 h-4 w-4" /> Start Camera
           </Button>
         ) :
         isActive && !isStarting && !isSwitchingCamera && !autoScanMode && showStopButton && onManualStop ? (
             <Button onClick={handleManualStopClick} variant="destructive" disabled={disabled || isStarting || isSwitchingCamera} className="transition-subtle">
               <StopCircle className="mr-2 h-4 w-4" /> Stop Scanning
             </Button>
         ) : null
         }
       </div>
     </div>
  );
};

export default BarcodeScanner;
