
'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, Ban, AlertCircle, Loader2 } from 'lucide-react'; // Added Loader2
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from './ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface BarcodeScannerProps {
  onScanSuccess: (imageDataUri: string) => void;
  onScanError?: (error: Error) => void;
  buttonText?: string;
  scanPrompt?: string;
  disabled?: boolean;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScanSuccess,
  onScanError,
  buttonText = 'Scan Barcode',
  scanPrompt = 'Align barcode within the frame',
  disabled = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isStarting, setIsStarting] = useState(false); // State for initial camera start
  const [isActive, setIsActive] = useState(false); // State for camera actually running and streaming
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const stopCamera = useCallback(() => {
    console.log("Attempting to stop camera stream...");
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        console.log(`Track stopped: ${track.label}`);
      });
      setStream(null);
    }
    // Ensure video srcObject is cleared even if stream was already null
    if (videoRef.current && videoRef.current.srcObject) {
       try {
            const currentStream = videoRef.current.srcObject as MediaStream;
            currentStream?.getTracks().forEach(track => track.stop());
       } catch (e) {
            console.warn("Error stopping tracks from video element:", e);
       }
      videoRef.current.srcObject = null;
      console.log("Video srcObject cleared.");
    }
    setIsActive(false);
    setIsStarting(false); // Reset starting state as well
    console.log("Camera stopped state updated.");
  }, [stream]); // Include stream in dependencies

  // Cleanup effect: Stop camera when component unmounts or dependencies change causing stop
  useEffect(() => {
    return () => {
      console.log("BarcodeScanner cleanup effect: Stopping camera.");
      stopCamera();
    };
  }, [stopCamera]);

  const handleCanPlay = () => {
    console.log("Video can play event triggered.");
    if (videoRef.current) {
        videoRef.current.play().then(() => {
            console.log("Video playback started successfully via canplay.");
            setIsActive(true); // Camera is now fully active
            setIsStarting(false); // Finished starting
        }).catch(playErr => {
            console.error("Video play failed on canplay:", playErr);
            setError(`Could not start video playback. Error: ${playErr.name}`);
            toast({ title: "Playback Error", description: `Could not play video stream. Please check browser settings.`, variant: "destructive" });
            setIsStarting(false);
            stopCamera();
        });
    }
  };

  // Effect to attach stream and add 'canplay' listener
  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement && stream) {
        if (videoElement.srcObject !== stream) {
            console.log("Attaching new stream to video element.");
            videoElement.srcObject = stream;
            // Add listener only when stream is newly attached
            videoElement.addEventListener('canplay', handleCanPlay);
            videoElement.load(); // Explicitly load after setting srcObject
        }
    }

    // Cleanup listener when stream changes or component unmounts
    return () => {
        if (videoElement) {
            videoElement.removeEventListener('canplay', handleCanPlay);
        }
    };
  }, [stream]); // Re-run when stream changes


  const startCamera = useCallback(async () => {
    console.log("startCamera called.");
    // Prevent starting if already starting or active
    if (isStarting || isActive) {
        console.log("Camera start aborted: Already starting or active.");
        return;
    }

    setError(null);
    setIsStarting(true); // Indicate loading/starting process
    setIsActive(false); // Ensure not marked active until stream plays

    // Stop any existing stream first (important for retries)
    stopCamera();

    try {
      console.log("Requesting camera access...");
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access (getUserMedia) is not supported by this browser.');
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, // Prefer rear camera if available
        audio: false,
      });

      console.log("Camera stream obtained:", mediaStream.id);
      setStream(mediaStream); // This triggers the useEffect to attach the stream

      // Note: setIsActive(true) and setIsStarting(false) are now handled by handleCanPlay

    } catch (err: any) {
      console.error('Error accessing or starting camera:', err);
      let message = 'Could not access the camera. Please ensure permissions are granted and no other app is using it.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        message = 'Camera permission denied. Please grant permission in your browser settings and refresh.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        message = 'No suitable camera found. Ensure a camera is connected and enabled.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
         message = 'Camera might be already in use by another application or browser tab.';
      } else if (err.name === 'OverconstrainedError') {
          message = `Camera does not support requested settings (e.g., facingMode). Error: ${err.message}`;
      } else if (err.name === 'AbortError') {
         message = 'Camera access request was aborted.';
      } else if (err.message?.includes('not supported')) {
         message = err.message;
      }
      setError(message);
      toast({
        title: 'Camera Error',
        description: message,
        variant: 'destructive',
      });
      if (onScanError) {
        onScanError(new Error(message)); // Pass a proper Error object
      }
      setIsStarting(false); // Stop loading indicator on error
      stopCamera(); // Ensure stream resources are released on error
    }
  }, [toast, onScanError, stopCamera, isActive, isStarting]); // Dependencies

  const captureImage = useCallback(() => {
    if (videoRef.current && canvasRef.current && isActive) {
       console.log("Capturing image from video stream...");
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context && video.videoWidth > 0 && video.videoHeight > 0) {
        // Set canvas dimensions to match video stream EXACTLY for accurate capture
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw the current video frame onto the canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get the image data as a data URI
        try {
            const imageDataUri = canvas.toDataURL('image/png'); // Or 'image/jpeg'
            console.log("Image captured successfully.");
            stopCamera(); // Stop camera after successful capture
            onScanSuccess(imageDataUri);
        } catch (e: any) {
             console.error("Error converting canvas to data URL:", e);
             const captureErrorMsg = `Failed to capture image: ${e.message}`;
             setError(captureErrorMsg);
             toast({ title: 'Capture Error', description: `Could not generate image data: ${e.message}`, variant: 'destructive'});
             if (onScanError) onScanError(new Error(captureErrorMsg));
             stopCamera(); // Stop camera even on capture error
        }
      } else {
          const contextError = !context ? "Canvas context unavailable." : "";
          const dimError = video.videoWidth === 0 ? "Video width is zero." : "";
          const captureErrorMsg = `Failed to capture image: ${contextError} ${dimError}`.trim();
          console.error(captureErrorMsg);
          setError(captureErrorMsg);
          toast({ title: 'Capture Error', description: 'Could not capture image due to invalid video state.', variant: 'destructive'});
          if (onScanError) onScanError(new Error(captureErrorMsg));
          stopCamera(); // Stop camera if capture fails
      }
    } else {
        console.warn("Capture attempt failed: Scanner not active or refs missing.", { isActive, video: !!videoRef.current, canvas: !!canvasRef.current });
        if (!isActive) setError("Cannot capture: Camera is not active.");
    }
  }, [isActive, onScanSuccess, stopCamera, toast, onScanError]);

   // Effect to handle general video errors during playback
   useEffect(() => {
    const videoElement = videoRef.current;
    const handleError = (e: Event) => {
      console.error('Video playback error event:', e);
      const videoError = videoElement?.error;
      setError(`Video playback error: ${videoError?.message || 'Unknown error'}. Code: ${videoError?.code}`);
      setIsStarting(false); // Ensure loading indicator stops
      setIsActive(false); // Ensure scanning state is false
      stopCamera(); // Stop camera on playback error
    };

    if (videoElement) {
      videoElement.addEventListener('error', handleError);
    }

    return () => {
      if (videoElement) {
        videoElement.removeEventListener('error', handleError);
      }
    };
  }, [stopCamera]);


  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      {/* Always render video and canvas, control visibility */}
       <div className={`w-full border rounded-lg overflow-hidden shadow-md bg-muted ${isActive || isStarting ? 'block' : 'hidden'}`}>
           {isStarting && !isActive && (
               <div className="w-full aspect-video flex flex-col items-center justify-center bg-black text-white">
                 <Loader2 className="h-8 w-8 animate-spin mb-2" />
                 <p className="text-sm text-muted-foreground">Starting camera...</p>
               </div>
           )}
           <div className={`relative w-full aspect-video ${isStarting && !isActive ? 'hidden' : 'block'}`}> {/* Hide video area itself while skeleton shows */}
              <video
                  ref={videoRef}
                  className="w-full h-full object-contain block bg-black" // Ensure it's block and covers area
                  playsInline // Important for mobile browsers
                  muted // Mute audio to enable autoplay and avoid feedback
                  // autoPlay // Autoplay is handled by handleCanPlay now
                  aria-label="Camera feed for barcode scanning"
              />
              {isActive && ( // Show overlay only when camera is actively streaming
                   <div className="absolute inset-0 border-4 border-accent rounded pointer-events-none opacity-70 animate-pulse" aria-hidden="true"></div>
              )}
           </div>
           {(isActive || isStarting) && ( // Show controls only when trying to start or active
               <>
                   <p className="text-center text-sm text-muted-foreground mt-2 px-2">{isActive ? scanPrompt : "Waiting for camera..."}</p>
                   <div className="flex justify-center gap-2 mt-2 mb-2">
                       <Button onClick={captureImage} disabled={!isActive || disabled || isStarting} variant="default" size="sm" className="transition-subtle">
                           <Camera className="mr-1 h-4 w-4" /> Capture
                       </Button>
                       <Button onClick={stopCamera} variant="outline" size="sm" className="transition-subtle">
                           <Ban className="mr-1 h-4 w-4" /> Cancel
                       </Button>
                   </div>
               </>
           )}
      </div>

      {/* Button to start scanning - shown only if not active and not currently starting */}
      {!isActive && !isStarting && (
          <Button onClick={startCamera} disabled={disabled || isStarting} className="transition-subtle">
              <Camera className="mr-2 h-4 w-4" /> {buttonText}
          </Button>
      )}


       {/* Error display area */}
        {error && !isStarting && ( // Show error only if not loading/starting
            <Alert variant="destructive" className="w-full mt-2">
             <AlertCircle className="h-4 w-4" />
             <AlertTitle>Camera Error</AlertTitle>
             <AlertDescription>{error}</AlertDescription>
              {/* Provide a retry button */}
             {!isActive && !isStarting && ( // Show retry only if not active/starting
                 <Button onClick={startCamera} variant="ghost" size="sm" className="mt-2 text-xs">
                    <RefreshCw className="mr-1 h-3 w-3" /> Try Again
                 </Button>
             )}
            </Alert>
        )}

      {/* Hidden canvas for image capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true"></canvas>
    </div>
  );
};

export default BarcodeScanner;

