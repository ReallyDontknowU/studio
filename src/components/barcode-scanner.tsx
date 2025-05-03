
'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, AlertCircle, Loader2, ScanLine, VideoOff, StopCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BrowserMultiFormatReader, NotFoundException, ChecksumException, FormatException, DecodeHintType, BarcodeFormat, Exception as ZXingException } from '@zxing/library';
import Image from 'next/image';

interface BarcodeScannerProps {
  onScanSuccess: (imageDataUri: string) => void;
  onScanError?: (error: Error) => void;
  scanPrompt?: string;
  disabled?: boolean;
  onManualStop?: (imageDataUri: string | null) => void;
  capturedImageUri: string | null;
  setCapturedImageUri: (uri: string | null) => void;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScanSuccess,
  onScanError,
  scanPrompt = 'Position barcode in front of the camera...',
  disabled = false,
  onManualStop,
  capturedImageUri,
  setCapturedImageUri
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processingSuccessRef = useRef(false);

  const [isStarting, setIsStarting] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false); // Only controls visual indicator, not the loop
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
      }
      setError(message);
      toast({ title: "Video Playback Error", description: message, variant: "destructive" });
      if (onScanError) onScanError(new Error(message));
      cleanupCamera("video error event handler");
  }, [toast, onScanError]); // cleanupCamera removed from deps, see definition

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
  }, []);


  // --- Cleanup Function ---
  const cleanupCamera = useCallback((caller?: string) => {
    const logPrefix = `[Cleanup ${caller || 'unknown'}]`;
    console.log(`${logPrefix} Starting cleanup...`);
    processingSuccessRef.current = false;

    setIsScanning(false); // Explicitly set scanning state to false

    const video = videoRef.current;
    if (video) {
        video.removeEventListener('error', handleVideoError);
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('play', handleVideoPlay);
        if (video.srcObject) {
            console.log(`${logPrefix} Stopping tracks on stream: ${streamRef.current?.id}`);
            (video.srcObject as MediaStream).getTracks().forEach(track => track.stop());
            video.srcObject = null;
            streamRef.current = null; // Clear stream ref when tracks are stopped
            console.log(`${logPrefix} Cleared video srcObject and stream ref.`);
        }
        if (!video.paused) {
            video.pause();
            console.log(`${logPrefix} Paused video playback.`);
        }
    } else {
      console.log(`${logPrefix} No video element ref to cleanup.`);
    }

    if (readerRef.current) {
        try {
            readerRef.current.reset();
            console.log(`${logPrefix} ZXing Reader reset called.`);
        } catch (e) {
            console.warn(`${logPrefix} Error calling reader.reset():`, e);
        }
        readerRef.current = null;
    }

    setIsActive(false);
    setIsStarting(false);
    // Do not clear error here, let the parent component manage it if needed.
    // setCapturedImageUri(null); // Let parent manage clearing captured image if necessary
    console.log(`${logPrefix} Cleanup finished.`);
  }, [handleVideoError, handleLoadedMetadata, handleVideoPlay]); // Dependencies on stable callbacks


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
    if (lastFrameUri) {
      setCapturedImageUri(lastFrameUri); // Update parent state with the last frame
    } else {
      setCapturedImageUri(null); // Clear parent state if capture failed
    }

    cleanupCamera("manual stop");

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
    setError(null);
    setHasCameraPermission(null);
    setIsStarting(true);
    // Ensure initial state is clean
    setIsActive(false);
    setIsScanning(false);
    processingSuccessRef.current = false;
    setCapturedImageUri(null);

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
          facingMode: "environment",
          width: { ideal: 1280, max: 1920 }, // Keep high resolution for better barcode reading
          height: { ideal: 720, max: 1080 },
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
      video.removeEventListener('error', handleVideoError); // Remove previous listeners just in case
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

      // Initialize ZXing Reader only after successful play attempt
      const hints = new Map<DecodeHintType, any>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13,
        BarcodeFormat.UPC_A, BarcodeFormat.PDF_417, BarcodeFormat.QR_CODE,
        BarcodeFormat.DATA_MATRIX
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      readerRef.current = new BrowserMultiFormatReader(hints, 500); // Increased timeout slightly
      console.log(`${logPrefix} ZXing Reader initialized.`);

    } catch (err: any) {
        console.error(`${logPrefix} Error during camera start or playback:`, err);
        let message = `Could not start camera. Error: ${err.name || 'UnknownError'} - ${err.message || 'No details'}`;
        let permissionRelated = false;

        // More specific error messages
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
        } else if (err.name === 'TypeError' && err.message.includes('getUserMedia')) {
             message = 'Camera access (getUserMedia) is not supported by this browser or context (e.g., HTTP).';
        }
         // Check specifically for play() related errors
        else if (err instanceof DOMException && err.name === 'NotAllowedError') {
             message = 'Video playback blocked. Ensure the action was triggered by user interaction (e.g., button click).';
        }
        else if (err instanceof DOMException && err.name === 'NotSupportedError') {
             message = 'Video format or source not supported for playback.';
        }
         else if (err.message?.includes('Could not start video source')) {
             message = 'Could not start video source. Check console for details.'; // Generic playback issue
         }


        setError(message);
        setHasCameraPermission(permissionRelated ? false : null);
        toast({ title: 'Camera Start Error', description: message, variant: 'destructive', duration: 8000 });
        if (onScanError) onScanError(err instanceof Error ? err : new Error(message));
        cleanupCamera("startCamera error handler");
    } finally {
      setIsStarting(false);
      console.log(`${logPrefix} Finished start attempt. State:`, { isStarting, isActive, isScanning });
    }
  }, [toast, onScanError, cleanupCamera, handleVideoError, handleLoadedMetadata, handleVideoPlay, setCapturedImageUri]);


  // --- Effect to attach/detach video listeners ---
  // This might be redundant if cleanupCamera is called correctly on unmount/state change
  // Let's remove it for now and rely on cleanup in startCamera and unmount effect.
  // useEffect(() => {
  //   // Listeners are attached in startCamera, removed in cleanupCamera
  //   return () => {
  //       if (isActive || isStarting) {
  //           console.log("Scanner effect cleanup: Calling cleanupCamera due to unmount/dependency change.");
  //           cleanupCamera("effect cleanup");
  //       }
  //   };
  // }, [isActive, isStarting, cleanupCamera]);


  // --- Unmount Cleanup ---
  useEffect(() => {
    return () => {
      console.log("BarcodeScanner: Unmounting. Cleaning up camera.");
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
    if (!isActive) { // Allow capture even if visual scanning indicator is off, as long as camera is active
      console.warn(`${logPrefix} Camera not active.`);
      return;
    }
    const imageDataUri = captureFrame();
    if (imageDataUri) {
      console.log(`${logPrefix} Frame captured successfully.`);
      setCapturedImageUri(imageDataUri); // Update parent state
      onScanSuccess(imageDataUri); // Pass to parent
      // Decide whether to stop camera after successful capture. Currently it doesn't.
      // cleanupCamera("capture success");
    } else {
      console.error(`${logPrefix} Failed to capture frame.`);
      // Error handling is done within captureFrame
    }
  }, [isActive, captureFrame, onScanSuccess, setCapturedImageUri]); // Removed cleanupCamera dependency here


  return (
    <div className={`flex flex-col items-center gap-4 w-full max-w-xs ${disabled && !isStarting ? 'opacity-50 pointer-events-none' : ''}`}>

      {/* Camera View Area */}
       {/* Make container slightly taller for vertical ID cards (e.g., 4:3 or 3:4 aspect ratio) */}
      <div className={`w-full aspect-[3/4] border rounded-lg overflow-hidden shadow-md bg-muted relative ${isStarting || isActive ? 'block' : 'hidden'}`}>
        <video
          ref={videoRef}
          className={`w-full h-full object-cover block bg-black transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`}
          playsInline // Ensure playsInline is present
          muted // Ensure muted is present
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

       {/* Display Captured Image Preview */}
       {capturedImageUri && !isActive && ( // Show only when camera is off and image exists
           <div className="w-full max-w-xs p-2 border rounded-md bg-muted">
               <p className="text-sm font-medium text-center mb-2">Captured Image:</p>
               <Image
                   src={capturedImageUri}
                   alt="Captured Barcode/ID"
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
            {/* Changed Capture button text */}
            <Button onClick={handleCaptureClick} disabled={disabled || isStarting} className="transition-subtle">
              <ScanLine className="mr-2 h-4 w-4" /> Capture Image
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
    </div>
  );
};

export default BarcodeScanner;
