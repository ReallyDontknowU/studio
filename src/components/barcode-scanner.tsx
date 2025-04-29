
'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, Ban, AlertCircle, Loader2, ScanLine } from 'lucide-react'; // Added Loader2, ScanLine
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';

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
  buttonText = 'Start Scanning', // Changed default text
  scanPrompt = 'Position barcode in front of the camera...', // Changed default text
  disabled = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // Still needed for capture
  const readerRef = useRef<BrowserMultiFormatReader | null>(null); // Ref for the ZXing reader
  const [isStarting, setIsStarting] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false); // Indicate active scanning process
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const stopCamera = useCallback(() => {
    console.log("Attempting to stop camera stream...");
    readerRef.current?.reset(); // Reset ZXing reader
    readerRef.current = null;

    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        console.log(`Track stopped: ${track.label}`);
      });
      setStream(null);
    }
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
    setIsStarting(false);
    setIsScanning(false); // Stop scanning state
    console.log("Camera stopped state updated.");
  }, [stream]);

  useEffect(() => {
    return () => {
      console.log("BarcodeScanner cleanup effect: Stopping camera.");
      stopCamera();
    };
  }, [stopCamera]);

   // Function to capture the current frame when barcode is detected
   const captureFrame = useCallback((): string | null => {
    if (videoRef.current && canvasRef.current && isActive) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context && video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          const imageDataUri = canvas.toDataURL('image/png');
          console.log("Frame captured successfully for scan success.");
          return imageDataUri;
        } catch (e: any) {
          console.error("Error converting canvas to data URL:", e);
          const captureErrorMsg = `Failed to capture frame: ${e.message}`;
          setError(captureErrorMsg); // Set error state
          if (onScanError) onScanError(new Error(captureErrorMsg));
          return null;
        }
      } else {
          console.warn("CaptureFrame failed: Context or video dimensions invalid.");
          return null; // Indicate failure to capture
      }
    }
    return null;
  }, [isActive, onScanError]); // Add dependencies

  // Main scanning loop effect
  useEffect(() => {
    if (isActive && videoRef.current && !isScanning) {
      console.log("Camera active, starting barcode scanning loop...");
      setIsScanning(true);
      setError(null); // Clear previous errors

      if (!readerRef.current) {
        readerRef.current = new BrowserMultiFormatReader();
        console.log("ZXing Reader initialized.");
      }
      const reader = readerRef.current;
      const videoElement = videoRef.current;

      reader.decodeFromVideoElement(videoElement).then((result) => {
        console.log("Barcode detected:", result.getText());
        // Capture the current frame
        const imageDataUri = captureFrame();
        if (imageDataUri) {
          onScanSuccess(imageDataUri); // Pass the captured image URI
        } else {
          // Handle capture failure scenario if needed
           console.error("Failed to capture frame after barcode detection.");
           setError("Barcode detected, but failed to capture the image frame.");
           if (onScanError) onScanError(new Error("Frame capture failed after detection."));
        }
        stopCamera(); // Stop everything on success
      }).catch((err) => {
        if (err instanceof NotFoundException) {
          // This is expected, means no barcode found in this frame.
          // console.log('No barcode found in this frame.');
          // The loop continues automatically via decodeFromVideoElement
        } else if (err.name === 'ReaderException' && err.message.includes('Checksum')) {
           // Ignore checksum errors, often due to partial scans
           // console.warn('Checksum error during scan, ignoring.');
        } else if (err.name === 'FormatException') {
           // Ignore format errors, often due to blurry frames
           // console.warn('Format error during scan, ignoring.');
        } else {
          // Handle other significant errors
          console.error('Error during barcode scanning:', err);
          setError(`Scanning error: ${err.message || 'Unknown scanning error'}`);
          if (onScanError) {
            onScanError(err instanceof Error ? err : new Error(String(err)));
          }
          stopCamera(); // Stop on significant error
        }
      }).finally(() => {
          // Note: decodeFromVideoElement runs continuously until reset or stream ends.
          // Setting isScanning false here would cause immediate restart in this effect.
          // We rely on stopCamera() to properly terminate the process.
          //setIsScanning(false); // Don't set here, loop continues or stops via stopCamera()
      });
    } else if (!isActive && isScanning) {
        // If camera becomes inactive but we were scanning, reset state
        console.log("Camera became inactive, ensuring scanning state is false.");
        setIsScanning(false);
    }
  }, [isActive, isScanning, onScanSuccess, stopCamera, captureFrame, onScanError]); // Add captureFrame and onScanError


   const handleCanPlay = useCallback(() => {
     console.log("Video can play event triggered.");
     if (videoRef.current) {
       videoRef.current.play().then(() => {
         console.log("Video playback started successfully via canplay.");
         setIsActive(true); // Camera is now fully active and streaming
         setIsStarting(false); // Finished starting process
         // The useEffect for scanning will now kick in
       }).catch(playErr => {
         console.error("Video play failed on canplay:", playErr);
         setError(`Could not start video playback. Error: ${playErr.name}`);
         toast({ title: "Playback Error", description: `Could not play video stream. Please check browser settings.`, variant: "destructive" });
         setIsStarting(false);
         stopCamera();
       });
     }
   }, [stopCamera, toast]); // Dependencies for handleCanPlay


    // Effect to attach stream and add 'canplay' listener
   useEffect(() => {
     const videoElement = videoRef.current;
     if (videoElement && stream) {
       if (videoElement.srcObject !== stream) {
         console.log("Attaching new stream to video element.");
         videoElement.srcObject = stream;
         videoElement.removeEventListener('canplay', handleCanPlay); // Remove previous listener first
         videoElement.addEventListener('canplay', handleCanPlay);
         videoElement.load();
       }
     }

     return () => {
       if (videoElement) {
         videoElement.removeEventListener('canplay', handleCanPlay);
       }
     };
   }, [stream, handleCanPlay]); // Depend on stream and the memoized handleCanPlay


  const startCamera = useCallback(async () => {
    console.log("startCamera called.");
    if (isStarting || isActive) {
        console.log("Camera start aborted: Already starting or active.");
        return;
    }
    setError(null);
    setIsStarting(true);
    setIsActive(false);
    setIsScanning(false); // Ensure scanning is false initially

    // Stop any existing stream first
    stopCamera();

    try {
      console.log("Requesting camera access...");
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access (getUserMedia) is not supported by this browser.');
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: "environment",
            // Optionally add constraints for resolution if needed
            // width: { ideal: 640 },
            // height: { ideal: 480 }
        },
        audio: false,
      });
      console.log("Camera stream obtained:", mediaStream.id);
      setStream(mediaStream);
      // isActive will be set true in handleCanPlay
    } catch (err: any) {
      console.error('Error accessing or starting camera:', err);
      let message = 'Could not access the camera. Please ensure permissions are granted and no other app is using it.';
      // ... (keep existing error handling messages) ...
      setError(message);
      toast({ title: 'Camera Error', description: message, variant: 'destructive' });
      if (onScanError) onScanError(new Error(message));
      setIsStarting(false);
      stopCamera();
    }
  }, [toast, onScanError, stopCamera, isActive, isStarting]);

    // Effect to handle general video errors during playback
    useEffect(() => {
        const videoElement = videoRef.current;
        const handleError = (e: Event) => {
            console.error('Video playback error event:', e);
            const videoError = videoElement?.error;
            setError(`Video playback error: ${videoError?.message || 'Unknown error'}. Code: ${videoError?.code}`);
            setIsStarting(false);
            setIsActive(false);
            setIsScanning(false); // Stop scanning state
            stopCamera();
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
      <div className={`w-full border rounded-lg overflow-hidden shadow-md bg-muted ${isActive || isStarting ? 'block' : 'hidden'}`}>
        {isStarting && !isActive && (
          <div className="w-full aspect-video flex flex-col items-center justify-center bg-black text-white">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <p className="text-sm text-muted-foreground">Starting camera...</p>
          </div>
        )}
        <div className={`relative w-full aspect-video ${isStarting && !isActive ? 'hidden' : 'block'}`}>
          <video
            ref={videoRef}
            className="w-full h-full object-contain block bg-black"
            playsInline muted
            aria-label="Camera feed for barcode scanning"
          />
           {/* Visual cue for scanning */}
           {isActive && isScanning && (
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                 <div className="w-11/12 h-px bg-accent animate-pulse" style={{ animation: 'scan-line 2s linear infinite' }}></div>
                 {/* Add corner borders or overlay */}
                 <div className="absolute inset-2 border-2 border-accent/50 rounded"></div>
               </div>
            )}
        </div>
        {(isActive || isStarting) && (
          <>
             <p className="text-center text-sm text-muted-foreground mt-2 px-2 h-5">
               {isActive ? (isScanning ? scanPrompt : 'Preparing to scan...') : 'Waiting for camera...'}
             </p>
            <div className="flex justify-center gap-2 mt-2 mb-2">
              {/* Removed Capture button - scanning is automatic */}
              <Button onClick={stopCamera} variant="outline" size="sm" className="transition-subtle">
                <Ban className="mr-1 h-4 w-4" /> Stop Scanning
              </Button>
            </div>
          </>
        )}
      </div>

      {!isActive && !isStarting && (
        <Button onClick={startCamera} disabled={disabled || isStarting} className="transition-subtle">
          <Camera className="mr-2 h-4 w-4" /> {buttonText}
        </Button>
      )}

      {error && !isStarting && (
        <Alert variant="destructive" className="w-full mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Scanner Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          {!isActive && !isStarting && (
            <Button onClick={startCamera} variant="ghost" size="sm" className="mt-2 text-xs">
              <RefreshCw className="mr-1 h-3 w-3" /> Try Again
            </Button>
          )}
        </Alert>
      )}

      {/* Hidden canvas for image capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true"></canvas>

      {/* Add CSS for the scanning line animation */}
      <style jsx global>{`
         @keyframes scan-line {
            0% { transform: translateY(-50%); }
            50% { transform: translateY(50%); }
            100% { transform: translateY(-50%); }
         }
       `}</style>
    </div>
  );
};

export default BarcodeScanner;
