
'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, Ban, AlertCircle, Loader2, ScanLine } from 'lucide-react'; // Added Loader2, ScanLine
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BrowserMultiFormatReader, NotFoundException, ChecksumException, FormatException, DecodeHintType } from '@zxing/library';

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
  buttonText = 'Start Scanning',
  scanPrompt = 'Position barcode in front of the camera...',
  disabled = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // Still needed for capture
  const readerRef = useRef<BrowserMultiFormatReader | null>(null); // Ref for the ZXing reader
  const requestRef = useRef<number>(); // For requestAnimationFrame loop
  const [isStarting, setIsStarting] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false); // Indicate active scanning process
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Flag to prevent multiple success callbacks for a single scan session
  const processingSuccessRef = useRef(false);

  const stopCamera = useCallback((calledFrom?: string) => {
    console.log(`Attempting to stop camera stream... (Called from: ${calledFrom || 'unknown'})`);
    if (requestRef.current) {
       cancelAnimationFrame(requestRef.current);
       requestRef.current = undefined;
       console.log("Cancelled animation frame.");
    }
    if (readerRef.current) {
      readerRef.current.reset(); // Reset ZXing reader
      readerRef.current = null;
      console.log("ZXing Reader reset.");
    } else {
        console.log("No ZXing Reader to reset.");
    }

    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        console.log(`Track stopped: ${track.kind} - ${track.label}`);
      });
      setStream(null); // Clear the stream state
      console.log("Stream tracks stopped and state cleared.");
    } else {
        console.log("No stream state to clear.");
    }

    if (videoRef.current && videoRef.current.srcObject) {
       try {
            const currentStream = videoRef.current.srcObject as MediaStream;
            currentStream?.getTracks().forEach(track => track.stop());
            console.log("Tracks stopped from video element srcObject.");
       } catch (e) {
            console.warn("Error stopping tracks from video element srcObject:", e);
       }
      videoRef.current.srcObject = null; // Ensure video element source is cleared
      console.log("Video srcObject cleared.");
    } else {
         console.log("No video element or srcObject to clear.");
    }

    setIsActive(false);
    setIsStarting(false);
    setIsScanning(false); // Ensure scanning state is false
    processingSuccessRef.current = false; // Reset success flag
    console.log("Camera stopped, state updated.");
  }, [stream]); // Dependency: stream

  useEffect(() => {
    // Cleanup function: This runs when the component unmounts
    return () => {
      console.log("BarcodeScanner cleanup effect: Stopping camera.");
      stopCamera("unmount cleanup");
    };
  }, [stopCamera]); // Dependency: stopCamera


   // Function to capture the current frame when barcode is detected
   const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !isActive) {
         console.warn("CaptureFrame failed: VideoRef, CanvasRef, or isActive is false.", { videoExists: !!video, canvasExists: !!canvas, isActive });
         return null;
    }

    const context = canvas.getContext('2d');

    if (!context) {
        console.error("CaptureFrame failed: Canvas context is null.");
        setError("Failed to get canvas context for frame capture.");
        if (onScanError) onScanError(new Error("Canvas context unavailable."));
        stopCamera("captureFrame context error");
        return null;
    }

      // Ensure video has dimensions and context is available
      if (video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        try {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageDataUri = canvas.toDataURL('image/png'); // Use PNG for better quality
          console.log("Frame captured successfully.");
          return imageDataUri;
        } catch (e: any) {
          console.error("Error capturing or converting frame:", e);
          // Check for Tainted Canvas error specifically
          if (e.name === 'SecurityError') {
             console.error("Tainted Canvas Error: Cannot export canvas data.");
             setError("Tainted canvas error during frame capture. This is unusual for camera streams.");
          } else {
            setError(`Failed to capture frame: ${e.message || 'Unknown canvas error'}`);
          }

          if (onScanError) onScanError(e instanceof Error ? e : new Error(`Frame capture failed: ${e.message || 'Unknown canvas error'}`));
          stopCamera("captureFrame draw/toDataURL error"); // Stop on critical capture error
          return null;
        }
      } else {
          console.warn("CaptureFrame failed: Video not ready, dimensions invalid, or context unavailable.", { readyState: video.readyState, width: video.videoWidth, height: video.videoHeight, contextExists: !!context });
          // Don't stop here necessarily, maybe the next frame will be ready
          return null; // Indicate failure to capture this specific frame
      }
  }, [isActive, onScanError, stopCamera]); // Add dependencies


  // Scanning loop using requestAnimationFrame
  const runScanLoop = useCallback(() => {
    if (!isActive || !isScanning || processingSuccessRef.current || !readerRef.current || !videoRef.current) {
      // Stop the loop if conditions aren't met
      if (requestRef.current) {
          cancelAnimationFrame(requestRef.current);
          requestRef.current = undefined;
      }
      return;
    }

    const reader = readerRef.current;
    const videoElement = videoRef.current;

    // Check if video is ready before attempting decode
    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        reader.decodeFromVideoElement(videoElement).then(result => {
            if (processingSuccessRef.current) return; // Already handled

            console.log("Barcode detected:", result.getText());
            processingSuccessRef.current = true; // Set flag immediately

            // Capture the current frame *synchronously* if possible after detection
            const imageDataUri = captureFrame();

            if (imageDataUri) {
                console.log("Frame captured, calling onScanSuccess.");
                onScanSuccess(imageDataUri); // Pass the captured image URI
                console.log("Stopping camera after successful scan.");
                stopCamera("scan success"); // Stop everything on success
            } else {
                // Handle capture failure scenario, but detection occurred
                console.error("Failed to capture frame immediately after barcode detection.");
                const captureFailError = new Error("Frame capture failed after detection.");
                setError(captureFailError.message);
                if (onScanError) onScanError(captureFailError);
                stopCamera("capture frame failed after success"); // Stop as we can't proceed
            }

        }).catch(err => {
            if (processingSuccessRef.current) return; // Ignore errors if already processing success

            // Handle specific ZXing errors without stopping the scan loop
             if (err instanceof NotFoundException) {
                 // Expected, no barcode found in this frame. Continue loop.
             } else if (err instanceof ChecksumException || err instanceof FormatException) {
                 console.warn(`Ignoring scan error: ${err.name}`);
             } else {
                 // Handle other significant errors
                 console.error('Significant error during barcode scanning:', err);
                 const errorMsg = `Scanning error: ${err instanceof Error ? err.message : String(err)}`;
                 setError(errorMsg);
                 if (onScanError) {
                    onScanError(err instanceof Error ? err : new Error(errorMsg));
                 }
                 stopCamera("scan error catch"); // Stop on significant error
             }
        });
    }

    // Continue the loop
     requestRef.current = requestAnimationFrame(runScanLoop);

  }, [isActive, isScanning, captureFrame, onScanSuccess, stopCamera, onScanError]);


   const handleCanPlay = useCallback(() => {
     console.log("Video can play event triggered.");
     const videoElement = videoRef.current;
     if (videoElement && videoElement.readyState >= videoElement.HAVE_ENOUGH_DATA) {
        videoElement.play().then(() => {
         console.log("Video playback started successfully via canplay.");
         setIsActive(true); // Camera is now active
         setIsScanning(true); // Start the scanning process state
         setIsStarting(false); // Finished starting process
         processingSuccessRef.current = false; // Reset success flag on new stream start

         // Initialize the reader here
         if (!readerRef.current) {
             const hints = new Map();
             // Add hints if needed, e.g., for specific formats
             // hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE]);
             readerRef.current = new BrowserMultiFormatReader(hints);
             console.log("ZXing Reader initialized.");
         }

         // Start the scanning loop
         requestRef.current = requestAnimationFrame(runScanLoop);

       }).catch(playErr => {
         console.error("Video play failed on canplay:", playErr);
         setError(`Could not start video playback. Error: ${playErr.name || 'Unknown playback error'}`);
         toast({ title: "Playback Error", description: `Could not play video stream. Please check browser settings and ensure no other app is using the camera.`, variant: "destructive" });
         setIsStarting(false);
         stopCamera("handleCanPlay error");
       });
     } else {
         console.warn("Video not ready to play on 'canplay' event yet.");
     }
   }, [stopCamera, toast, runScanLoop]); // Dependencies


    // Effect to attach stream and add 'canplay' listener
   useEffect(() => {
     const videoElement = videoRef.current;
     if (videoElement && stream) {
       if (videoElement.srcObject !== stream) {
         console.log("Attaching new stream to video element.");
         videoElement.srcObject = stream;
         // Ensure event listener is added only once per stream attachment
         videoElement.removeEventListener('canplay', handleCanPlay);
         videoElement.addEventListener('canplay', handleCanPlay);
         videoElement.load(); // Important for some browsers to reload metadata
       }
     } else if (videoElement && !stream && videoElement.srcObject) {
         // If stream state is cleared but video element still has a source, clear it
         console.log("Clearing dangling srcObject from video element.");
         videoElement.srcObject = null;
     }

     // Cleanup for this effect: remove the listener when stream changes or component unmounts
     return () => {
       if (videoElement) {
         videoElement.removeEventListener('canplay', handleCanPlay);
         console.log("'canplay' listener removed.");
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
    processingSuccessRef.current = false; // Reset success flag

    // Ensure any previous camera instance is fully stopped
    stopCamera("startCamera preamble");

    try {
      console.log("Requesting camera access...");
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access (getUserMedia) is not supported by this browser.');
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: "environment", // Prioritize rear camera
            width: { ideal: 1280 },
            height: { ideal: 720 }
        },
        audio: false,
      });
      console.log("Camera stream obtained:", mediaStream.id);
      setStream(mediaStream); // Set the stream state -> triggers useEffect to attach stream
    } catch (err: any) {
      console.error('Error accessing or starting camera:', err);
      let message = 'Could not access the camera. Please ensure permissions are granted in your browser settings and that the camera is not being used by another application.';
      if (err.name === 'NotAllowedError') {
        message = 'Camera permission denied. Please allow camera access in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        message = 'No camera found. Please ensure a camera is connected and enabled.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        message = 'Camera is already in use or could not be started. Close other applications that might be using it.';
      } else if (err.name === 'OverconstrainedError') {
         message = `Could not satisfy camera constraints (e.g., requested resolution). Trying with default constraints. Error: ${err.message}`;
      } else if (err.name === 'SecurityError') {
         message = 'Camera access denied due to security settings or missing HTTPS connection.';
      }
      setError(message);
      toast({ title: 'Camera Error', description: message, variant: 'destructive' });
      if (onScanError) onScanError(err instanceof Error ? err : new Error(message));
      setIsStarting(false);
      stopCamera("startCamera error catch");
    }
  }, [toast, onScanError, stopCamera, isActive, isStarting]); // Dependencies

    // Effect to handle general video errors during playback
    useEffect(() => {
        const videoElement = videoRef.current;
        const handleError = (e: Event) => {
            console.error('Video playback error event:', e);
            const videoError = videoElement?.error;
            let message = `Video playback error: ${videoError?.message || 'Unknown error'}. Code: ${videoError?.code}`;
            if (videoError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                message = "The video format might not be supported.";
            } else if (videoError?.code === MediaError.MEDIA_ERR_NETWORK) {
                message = "A network error occurred while fetching the video.";
            } else if (videoError?.code === MediaError.MEDIA_ERR_DECODE) {
                message = "An error occurred while decoding the video.";
            }
             else if (videoError?.code === MediaError.MEDIA_ERR_ABORTED) {
                message = "Video playback was aborted."; // Less critical usually
            }
            setError(message);
            setIsStarting(false);
            setIsActive(false);
            setIsScanning(false); // Stop scanning state
            stopCamera("video error handler");
        };
        if (videoElement) {
            videoElement.addEventListener('error', handleError);
            console.log("Video error listener added.");
        }
        return () => {
            if (videoElement) {
                videoElement.removeEventListener('error', handleError);
                console.log("Video error listener removed.");
            }
        };
    }, [stopCamera]);


  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      <div className={`w-full border rounded-lg overflow-hidden shadow-md bg-muted ${isActive || isStarting ? 'block' : 'hidden'}`}>
        {/* Loading Indicator */}
        {isStarting && (
          <div className="w-full aspect-video flex flex-col items-center justify-center bg-black text-white">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <p className="text-sm text-muted-foreground">Starting camera...</p>
          </div>
        )}
         {/* Video Feed - always render video tag if stream might be attached */}
        <div className={`relative w-full aspect-video ${isStarting ? 'hidden' : 'block'}`}>
           <video
            ref={videoRef}
            className="w-full h-full object-contain block bg-black" // Use object-contain
            playsInline // Essential for iOS Safari
            muted // Muted prevents requesting microphone access
            autoPlay // Attempt autoplay
            aria-label="Camera feed for barcode scanning"
           />
           {/* Visual cue for scanning */}
           {isActive && isScanning && (
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent to-transparent opacity-70 animate-scan-line"></div>
                 <div className="absolute inset-2 border-2 border-accent/50 rounded pointer-events-none"></div>
               </div>
            )}
             {/* Prompt Text */}
             <p className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-center text-xs text-white bg-black/50 px-2 py-1 rounded">
               {isActive ? (isScanning ? scanPrompt : 'Preparing to scan...') : ''}
             </p>
        </div>
      </div>

      {/* Start Button - Shown when camera is off */}
      {!isActive && !isStarting && (
        <Button onClick={startCamera} disabled={disabled || isStarting} className="transition-subtle">
          <Camera className="mr-2 h-4 w-4" /> {buttonText}
        </Button>
      )}

       {/* Error Display */}
      {error && !isStarting && ( // Show errors when not in the process of starting
        <Alert variant="destructive" className="w-full mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Scanner Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          {!isActive && (
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
            0% { transform: translateY(0%); }
            100% { transform: translateY(calc(100% - 4px)); } // Adjust based on line height
         }
         .animate-scan-line {
             animation: scan-line 2.5s linear infinite alternate; // Use alternate for back-and-forth
         }
       `}</style>
    </div>
  );
};

export default BarcodeScanner;

