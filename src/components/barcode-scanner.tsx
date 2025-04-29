'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, Ban } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from './ui/skeleton';

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
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsScanning(false);
      if (videoRef.current) {
         videoRef.current.srcObject = null;
      }
    }
  }, [stream]);

  const startCamera = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by this browser.');
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // Prefer rear camera
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(err => {
                console.error("Video play failed:", err);
                setError("Could not start video playback.");
                stopCamera();
            });
        };
      }
      setIsScanning(true);
    } catch (err: any) {
      console.error('Error accessing camera:', err);
      let message = 'Could not access the camera. Please ensure permissions are granted.';
      if (err.name === 'NotAllowedError') {
        message = 'Camera permission denied. Please grant permission in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        message = 'No suitable camera found. Ensure a camera is connected and enabled.';
      }
       else if (err.message.includes('not supported')) {
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
       stopCamera(); // Ensure camera stops on error
    } finally {
      setIsLoading(false);
    }
  }, [toast, onScanError, stopCamera]);

  const captureImage = useCallback(() => {
    if (videoRef.current && canvasRef.current && isScanning) {
       setIsLoading(true); // Show loading state during capture processing
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        // Set canvas dimensions to match video stream
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw the current video frame onto the canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get the image data as a data URI (e.g., PNG or JPEG)
        const imageDataUri = canvas.toDataURL('image/png'); // Or 'image/jpeg'

        onScanSuccess(imageDataUri);
        stopCamera(); // Stop camera after successful capture
      } else {
          toast({ title: 'Error', description: 'Could not get canvas context.', variant: 'destructive' });
      }
       setIsLoading(false); // Hide loading state
    }
  }, [isScanning, onScanSuccess, stopCamera, toast]);

   // Cleanup effect to stop camera when component unmounts or scanning stops
   useEffect(() => {
    return () => {
      stopCamera();
    };
   }, [stopCamera]);

   // Effect to handle video ready state and potential play issues
   useEffect(() => {
    const videoElement = videoRef.current;
    const handleCanPlay = () => setIsLoading(false);
    const handleError = (e: Event) => {
      console.error('Video error:', e);
      setError('An error occurred with the video stream.');
      stopCamera();
      setIsLoading(false);
    };

    if (videoElement) {
      videoElement.addEventListener('canplay', handleCanPlay);
      videoElement.addEventListener('error', handleError);
    }

    return () => {
      if (videoElement) {
        videoElement.removeEventListener('canplay', handleCanPlay);
        videoElement.removeEventListener('error', handleError);
      }
    };
  }, [stream, stopCamera]);


  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {!isScanning ? (
        <Button onClick={startCamera} disabled={disabled || isLoading} className="transition-subtle">
          <Camera className="mr-2 h-4 w-4" /> {isLoading ? 'Starting Camera...' : buttonText}
        </Button>
      ) : (
        <div className="w-full max-w-sm border rounded-lg overflow-hidden shadow-md bg-muted p-2">
          <div className="relative aspect-video">
            {isLoading && !error && (
                 <Skeleton className="absolute inset-0 w-full h-full" />
            )}
             <video
                ref={videoRef}
                className={`w-full h-full object-cover rounded ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
                playsInline // Important for mobile browsers
                muted // Mute audio to avoid potential issues
                aria-label="Camera feed for barcode scanning"
             />
             {!isLoading && !error && (
                 <div className="absolute inset-0 border-4 border-accent rounded pointer-events-none opacity-70 animate-pulse"></div>
             )}
          </div>
          <p className="text-center text-sm text-muted-foreground mt-2">{scanPrompt}</p>
          <div className="flex justify-center gap-2 mt-2">
            <Button onClick={captureImage} disabled={isLoading} variant="default" size="sm" className="transition-subtle">
              <Camera className="mr-1 h-4 w-4" /> Capture
            </Button>
            <Button onClick={stopCamera} variant="outline" size="sm" className="transition-subtle">
              <Ban className="mr-1 h-4 w-4" /> Cancel
            </Button>
          </div>
        </div>
      )}
        {error && (
            <Alert variant="destructive" className="w-full max-w-sm mt-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
             <Button onClick={startCamera} variant="ghost" size="sm" className="mt-2 text-xs">
                <RefreshCw className="mr-1 h-3 w-3" /> Try Again
            </Button>
            </Alert>
        )}
      {/* Hidden canvas for image capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true"></canvas>
    </div>
  );
};

export default BarcodeScanner;
