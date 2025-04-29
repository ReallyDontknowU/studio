
'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, Ban, AlertCircle } from 'lucide-react'; // Added AlertCircle
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from './ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; // Added AlertTitle

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
  const [isScanning, setIsScanning] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false); // Used for camera starting phase
  const [isStreamReady, setIsStreamReady] = useState(false); // Tracks if video stream dimensions are known
  const { toast } = useToast();

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsScanning(false);
      setIsStreamReady(false); // Reset stream ready state
      if (videoRef.current) {
         videoRef.current.srcObject = null;
         // Optional: Reset video display properties if needed
         // videoRef.current.style.display = 'none';
      }
      console.log("Camera stopped.");
    }
  }, [stream]);

  const startCamera = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    setIsStreamReady(false); // Reset ready state on new attempt
    try {
      console.log("Requesting camera access...");
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access (getUserMedia) is not supported by this browser.');
      }

      // Use more generic video constraints first, fallback can be added if needed
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true, // Request any video input
        audio: false,
      });

      console.log("Camera stream obtained:", mediaStream);
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        // Don't set isScanning=true until video is playing
      } else {
          throw new Error("Video element reference is not available.");
      }

    } catch (err: any) {
      console.error('Error accessing or starting camera:', err);
      let message = 'Could not access the camera. Please ensure permissions are granted and no other app is using it.';
      if (err.name === 'NotAllowedError') {
        message = 'Camera permission denied. Please grant permission in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        message = 'No suitable camera found. Ensure a camera is connected and enabled.';
      } else if (err.name === 'NotReadableError') {
         message = 'Camera might be already in use by another application or browser tab.';
      } else if (err.name === 'AbortError') {
         message = 'Camera access request was aborted.';
      } else if (err.message.includes('not supported')) {
         message = err.message;
      }
      setError(message);
      toast({
        title: 'Camera Error',
        description: message,
        variant: 'destructive',
      });
      if (onScanError) {
        onScanError(err);
      }
      setIsLoading(false); // Ensure loading stops on error
      stopCamera(); // Ensure camera stops on error
    }
  }, [toast, onScanError, stopCamera]);

  // Handle video loadedmetadata: stream dimensions are known
  useEffect(() => {
    const videoElement = videoRef.current;
    const handleMetadataLoaded = () => {
        console.log("Video metadata loaded. Attempting to play...");
        videoElement?.play().then(() => {
            console.log("Video playback started successfully.");
            setIsStreamReady(true); // Mark stream as ready (dimensions known)
            setIsScanning(true); // Now set scanning to true
            setIsLoading(false); // Stop loading indicator
        }).catch(playErr => {
            console.error("Video play failed:", playErr);
            setError("Could not start video playback. Ensure autoplay is allowed.");
            setIsLoading(false);
            stopCamera();
        });
    };

    if (videoElement && stream && !isStreamReady) {
        videoElement.addEventListener('loadedmetadata', handleMetadataLoaded);
        return () => {
            videoElement.removeEventListener('loadedmetadata', handleMetadataLoaded);
        };
    }
  }, [stream, isStreamReady, stopCamera]); // Depend on stream and ready state


  const captureImage = useCallback(() => {
    if (videoRef.current && canvasRef.current && isScanning && isStreamReady) {
       console.log("Capturing image from video stream...");
      // Consider adding a brief loading state specifically for capture if needed
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        // Set canvas dimensions to match video stream EXACTLY for accurate capture
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        if (canvas.width === 0 || canvas.height === 0) {
             console.error("Video dimensions are zero, cannot capture.");
             setError("Failed to capture: Video dimensions are invalid.");
             toast({ title: 'Capture Error', description: 'Could not capture image due to invalid video dimensions.', variant: 'destructive'});
             return; // Prevent further processing
        }

        // Draw the current video frame onto the canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get the image data as a data URI
        try {
            const imageDataUri = canvas.toDataURL('image/png'); // Or 'image/jpeg'
            console.log("Image captured successfully.");
            onScanSuccess(imageDataUri);
        } catch (e: any) {
             console.error("Error converting canvas to data URL:", e);
             setError(`Failed to capture image: ${e.message}`);
             toast({ title: 'Capture Error', description: `Could not generate image data: ${e.message}`, variant: 'destructive'});
        } finally {
             stopCamera(); // Stop camera after attempt (success or fail)
        }

      } else {
          console.error("Could not get canvas 2D context.");
          setError("Failed to capture image: Canvas context unavailable.");
          toast({ title: 'Error', description: 'Could not get canvas context for capture.', variant: 'destructive' });
          stopCamera();
      }
    } else {
        console.warn("Capture attempt failed: Scanner not ready.", { isScanning, isStreamReady, video: !!videoRef.current, canvas: !!canvasRef.current });
        if (!isStreamReady) setError("Cannot capture: Video stream not fully ready.");
    }
  }, [isScanning, isStreamReady, onScanSuccess, stopCamera, toast]);

   // Cleanup effect to stop camera when component unmounts
   useEffect(() => {
    return () => {
      console.log("BarcodeScanner unmounting. Stopping camera.");
      stopCamera();
    };
   }, [stopCamera]);

   // Effect to handle general video errors during playback
   useEffect(() => {
    const videoElement = videoRef.current;
    const handleError = (e: Event) => {
      console.error('Video playback error event:', e);
      const videoError = videoElement?.error;
      setError(`Video playback error: ${videoError?.message || 'Unknown error'}. Code: ${videoError?.code}`);
      stopCamera();
      setIsLoading(false); // Ensure loading indicator stops
      setIsScanning(false); // Ensure scanning state is false
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
      {!isScanning && !isLoading && !error && ( // Show button only if not scanning, loading, or in error state initially
        <Button onClick={startCamera} disabled={disabled} className="transition-subtle">
          <Camera className="mr-2 h-4 w-4" /> {buttonText}
        </Button>
      )}

       {isLoading && ( // Show loading skeleton while camera starts
           <div className="w-full border rounded-lg overflow-hidden shadow-md bg-muted p-2">
                <Skeleton className="w-full aspect-video" />
                <p className="text-center text-sm text-muted-foreground mt-2">Starting camera...</p>
           </div>
       )}


      {isScanning && ( // Show video feed and controls only when scanning is active
        <div className="w-full border rounded-lg overflow-hidden shadow-md bg-black p-2"> {/* Use black background for video */}
          <div className="relative aspect-video w-full">
             {/* Video element should always be in the DOM for the ref to work */}
             <video
                ref={videoRef}
                className={`w-full h-full object-contain rounded ${!isStreamReady ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300 block bg-black`} // Ensure it's a block element and covers area
                playsInline // Important for mobile browsers
                muted // Mute audio to enable autoplay and avoid feedback
                autoPlay // Try to autoplay
                aria-label="Camera feed for barcode scanning"
             />
             {isStreamReady && ( // Show overlay only when stream is ready
                 <div className="absolute inset-0 border-4 border-accent rounded pointer-events-none opacity-70 animate-pulse" aria-hidden="true"></div>
             )}
              {!isStreamReady && stream && ( // Show a specific loading message if stream exists but not ready
                   <div className="absolute inset-0 flex items-center justify-center text-white text-sm bg-black bg-opacity-50">
                      Preparing video...
                   </div>
               )}
          </div>
          <p className="text-center text-sm text-muted-foreground mt-2">{scanPrompt}</p>
          <div className="flex justify-center gap-2 mt-2">
            <Button onClick={captureImage} disabled={!isStreamReady || disabled} variant="default" size="sm" className="transition-subtle">
              <Camera className="mr-1 h-4 w-4" /> Capture
            </Button>
            <Button onClick={stopCamera} variant="outline" size="sm" className="transition-subtle">
              <Ban className="mr-1 h-4 w-4" /> Cancel
            </Button>
          </div>
        </div>
      )}

       {/* Error display area */}
        {error && !isLoading && ( // Show error only if not loading
            <Alert variant="destructive" className="w-full mt-2">
             <AlertCircle className="h-4 w-4" />
             <AlertTitle>Camera Error</AlertTitle>
             <AlertDescription>{error}</AlertDescription>
              {/* Provide a retry button only if not currently scanning */}
             {!isScanning && (
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
