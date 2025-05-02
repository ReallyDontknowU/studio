
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
  const streamRef = useRef<MediaStream | null>(null); // Use ref for stream to ensure cleanup access
  const [isStarting, setIsStarting] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false); // Indicate active scanning process
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Flag to prevent multiple success callbacks for a single scan session
  const processingSuccessRef = useRef(false);

  const stopCamera = useCallback((calledFrom?: string) => {
    console.log(`[${calledFrom || 'unknown'}] Attempting to stop camera stream...`);

    if (requestRef.current) {
       cancelAnimationFrame(requestRef.current);
       requestRef.current = undefined;
       console.log(`[${calledFrom || 'unknown'}] Cancelled animation frame.`);
    }

    // Reset ZXing reader first
    if (readerRef.current) {
      try {
        readerRef.current.reset();
        console.log(`[${calledFrom || 'unknown'}] ZXing Reader reset called.`);
      } catch (resetError) {
         console.warn(`[${calledFrom || 'unknown'}] Error resetting ZXing Reader:`, resetError);
      } finally {
        readerRef.current = null; // Ensure it's nullified
      }
    } else {
        console.log(`[${calledFrom || 'unknown'}] No ZXing Reader instance to reset.`);
    }

     // Stop tracks from the stream reference
    if (streamRef.current) {
      console.log(`[${calledFrom || 'unknown'}] Stopping tracks on stream: ${streamRef.current.id}`);
      streamRef.current.getTracks().forEach((track, index) => {
        track.stop();
        console.log(`[${calledFrom || 'unknown'}] Track ${index} (${track.kind} - ${track.label}) stopped.`);
      });
      streamRef.current = null; // Clear the stream ref
      console.log(`[${calledFrom || 'unknown'}] Stream ref cleared.`);
    } else {
        console.log(`[${calledFrom || 'unknown'}] No stream ref to clear.`);
    }

     // Clear video element source
    if (videoRef.current && videoRef.current.srcObject) {
       try {
            // Double-check if srcObject is a MediaStream before accessing tracks
            const currentSrcObject = videoRef.current.srcObject;
            if (currentSrcObject instanceof MediaStream) {
                currentSrcObject.getTracks().forEach(track => track.stop());
                console.log(`[${calledFrom || 'unknown'}] Tracks stopped from video element srcObject.`);
            }
       } catch (e) {
            console.warn(`[${calledFrom || 'unknown'}] Error stopping tracks from video element srcObject:`, e);
       } finally {
           videoRef.current.srcObject = null; // Ensure video element source is cleared
           console.log(`[${calledFrom || 'unknown'}] Video srcObject cleared.`);
       }
    } else {
         console.log(`[${calledFrom || 'unknown'}] No video element or srcObject to clear.`);
    }

    setIsActive(false);
    setIsStarting(false);
    setIsScanning(false); // Ensure scanning state is false
    processingSuccessRef.current = false; // Reset success flag
    console.log(`[${calledFrom || 'unknown'}] Camera stopped, state updated.`);
  }, []); // No dependencies needed as it uses refs

  // Component Unmount Cleanup
  useEffect(() => {
    return () => {
      console.log("BarcodeScanner cleanup effect: Stopping camera on unmount.");
      stopCamera("unmount cleanup");
    };
  }, [stopCamera]);


   // Function to capture the current frame when barcode is detected
   const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Check active state *after* video/canvas check for better error context
    if (!video || !canvas) {
         console.warn("CaptureFrame failed: VideoRef or CanvasRef is null.", { videoExists: !!video, canvasExists: !!canvas, isActive });
         return null;
    }
     if (!isActive) {
         console.warn("CaptureFrame failed: Scanner is not active.");
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
          console.warn("CaptureFrame failed: Video not ready or dimensions invalid.", { readyState: video.readyState, width: video.videoWidth, height: video.videoHeight });
          // Don't stop here necessarily, maybe the next frame will be ready
          return null; // Indicate failure to capture this specific frame
      }
  }, [isActive, onScanError, stopCamera]); // Add dependencies


  // Scanning loop using requestAnimationFrame
  const runScanLoop = useCallback(() => {
     // Check conditions to continue scanning
    if (!isActive || !isScanning || processingSuccessRef.current || !readerRef.current || !videoRef.current) {
      console.log("runScanLoop: Stopping loop.", { isActive, isScanning, processing: processingSuccessRef.current, hasReader: !!readerRef.current, hasVideo: !!videoRef.current });
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
        // console.log("runScanLoop: Decoding frame..."); // Avoid excessive logging here
        reader.decodeFromVideoElement(videoElement).then(result => {
            if (processingSuccessRef.current) return; // Already handled

            console.log("Barcode detected:", result.getText());
            processingSuccessRef.current = true; // Set flag immediately
            setIsScanning(false); // Stop further scanning attempts in this loop iteration

            // Capture the current frame *synchronously* if possible after detection
            const imageDataUri = captureFrame();

            if (imageDataUri) {
                console.log("Frame captured, calling onScanSuccess.");
                onScanSuccess(imageDataUri); // Pass the captured image URI
                // DO NOT stop camera here for continuous scanning. Parent component decides.
                 console.log("Scan successful, loop will stop due to processingSuccessRef=true or !isScanning.");
            } else {
                // Handle capture failure scenario, but detection occurred
                console.error("Failed to capture frame immediately after barcode detection.");
                const captureFailError = new Error("Frame capture failed after detection.");
                setError(captureFailError.message);
                if (onScanError) onScanError(captureFailError);
                stopCamera("capture frame failed after success"); // Stop if capture fails post-detection
            }

        }).catch(err => {
            if (processingSuccessRef.current || !isScanning) return; // Ignore errors if already processing success or scanning stopped

            // Handle specific ZXing errors without stopping the scan loop
             if (err instanceof NotFoundException) {
                 // Expected, no barcode found in this frame. Continue loop.
             } else if (err instanceof ChecksumException || err instanceof FormatException) {
                 // console.warn(`Ignoring scan error: ${err.name}`); // Can be noisy
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
    } else {
        // console.log("runScanLoop: Video not ready, skipping decode."); // Can be noisy
    }

    // Continue the loop only if still active and scanning
    if (isActive && isScanning && !processingSuccessRef.current) {
         requestRef.current = requestAnimationFrame(runScanLoop);
    } else {
        console.log("runScanLoop: Not requesting next frame.", { isActive, isScanning, processing: processingSuccessRef.current });
         if (requestRef.current) {
             cancelAnimationFrame(requestRef.current);
             requestRef.current = undefined;
         }
    }

  }, [isActive, isScanning, captureFrame, onScanSuccess, stopCamera, onScanError]);


   const handleCanPlay = useCallback(() => {
     console.log("Video 'canplay' event triggered.");
     const videoElement = videoRef.current;
     if (videoElement && videoElement.readyState >= videoElement.HAVE_ENOUGH_DATA && streamRef.current /* Check stream ref */) {
        videoElement.play().then(() => {
         console.log("Video playback started successfully via canplay.");
         setIsActive(true); // Camera is now active
         setIsScanning(true); // Start the scanning process state
         setIsStarting(false); // Finished starting process
         processingSuccessRef.current = false; // Reset success flag on new stream start

         // Initialize the reader here if not already present
         if (!readerRef.current) {
             const hints = new Map();
             // Add hints if needed, e.g., for specific formats
             // hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE]);
             readerRef.current = new BrowserMultiFormatReader(hints, 500 /* timeBetweenScansMillis */);
             console.log("ZXing Reader initialized.");
         } else {
             console.log("ZXing Reader already initialized.");
         }

         // Start the scanning loop
         console.log("Starting scan loop...");
         requestRef.current = requestAnimationFrame(runScanLoop);

       }).catch(playErr => {
         console.error("Video play failed on canplay:", playErr);
         setError(`Could not start video playback. Error: ${playErr.name || 'Unknown playback error'}`);
         toast({ title: "Playback Error", description: `Could not play video stream. Ensure camera is connected and permissions are granted.`, variant: "destructive" });
         setIsStarting(false);
         stopCamera("handleCanPlay error");
       });
     } else {
         console.warn("Video not ready to play on 'canplay' event or stream missing.", {readyState: videoElement?.readyState, hasStream: !!streamRef.current});
     }
   }, [stopCamera, toast, runScanLoop]); // Dependencies


    // Effect to attach stream and add 'canplay' listener
   useEffect(() => {
     const videoElement = videoRef.current;
     if (videoElement && streamRef.current) {
       if (videoElement.srcObject !== streamRef.current) {
         console.log("Attaching new stream to video element:", streamRef.current.id);
         videoElement.srcObject = streamRef.current;
         // Ensure event listener is added only once per stream attachment
         videoElement.removeEventListener('canplay', handleCanPlay);
         videoElement.addEventListener('canplay', handleCanPlay);
         console.log("'canplay' listener added.");
         videoElement.load(); // Important for some browsers to reload metadata
         console.log("videoElement.load() called.");
       }
     } else if (videoElement && !streamRef.current && videoElement.srcObject) {
         // If stream state is cleared but video element still has a source, clear it
         console.log("Clearing dangling srcObject from video element.");
         videoElement.srcObject = null;
     }

     // Cleanup for this effect: remove the listener when handleCanPlay changes (should be stable due to useCallback)
     return () => {
       if (videoElement) {
         videoElement.removeEventListener('canplay', handleCanPlay);
         console.log("'canplay' listener removed on effect cleanup.");
       }
     };
   }, [handleCanPlay]); // Depend only on the memoized handleCanPlay


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

    // Ensure any previous camera instance is fully stopped **before** requesting new one
    console.log("startCamera: Ensuring previous camera is stopped first...");
    stopCamera("startCamera preamble");
     // Short delay to allow resources to potentially release
     await new Promise(resolve => setTimeout(resolve, 100));

    try {
      console.log("Requesting camera access...");
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access (getUserMedia) is not supported by this browser.');
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: "environment", // Prioritize rear camera
             // Lower resolution might help performance/compatibility
            width: { ideal: 640 },
            height: { ideal: 480 }
            // width: { ideal: 1280 },
            // height: { ideal: 720 }
        },
        audio: false,
      });
      console.log("Camera stream obtained:", mediaStream.id);
      streamRef.current = mediaStream; // Set the stream REF
      // Trigger the useEffect to attach the stream by manually setting state (even if same value)
      // This seems redundant but ensures the attachment effect runs.
      // A better way might be needed if this causes issues.
      // Let's rely on the useEffect [handleCanPlay] which depends on streamRef.current via handleCanPlay.

      // Manually attach if videoRef exists (redundant with useEffect, but might speed up initial display)
       if (videoRef.current) {
           console.log("startCamera: Attaching stream directly after getUserMedia.");
           videoRef.current.srcObject = mediaStream;
            // Re-add listener directly as useEffect might not have run yet? Risky.
           // videoRef.current.removeEventListener('canplay', handleCanPlay);
           // videoRef.current.addEventListener('canplay', handleCanPlay);
           videoRef.current.load(); // Try load again
       }


    } catch (err: any) {
      console.error('Error accessing or starting camera:', err);
      let message = `Could not access the camera. Please ensure permissions are granted and the camera isn't in use. Error: ${err.name} - ${err.message}`;
      if (err.name === 'NotAllowedError') {
        message = 'Camera permission denied. Please allow camera access in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        message = 'No camera found. Please ensure a camera is connected and enabled.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        message = 'Camera is already in use or could not be started. Close other applications that might be using it.';
      } else if (err.name === 'OverconstrainedError') {
         message = `Could not satisfy camera constraints (e.g., resolution). Trying default constraints failed. Error: ${err.message}`;
      } else if (err.name === 'SecurityError') {
         message = 'Camera access denied due to security settings or missing HTTPS connection.';
      }
      setError(message);
      toast({ title: 'Camera Error', description: message, variant: 'destructive' });
      if (onScanError) onScanError(err instanceof Error ? err : new Error(message));
      setIsStarting(false); // Ensure starting state is false on error
      stopCamera("startCamera error catch"); // Clean up on error
    }
  }, [toast, onScanError, stopCamera, isActive, isStarting, handleCanPlay]); // Dependencies


    // Effect to handle general video errors during playback
    useEffect(() => {
        const videoElement = videoRef.current;
        const handleError = (e: Event) => {
            console.error('Video playback error event:', e);
            const videoError = videoElement?.error;
            let message = `Video playback error: ${videoError?.message || 'Unknown error'}. Code: ${videoError?.code}`;
            // Provide more user-friendly messages based on error code
            switch (videoError?.code) {
                case MediaError.MEDIA_ERR_ABORTED:
                    message = "Video playback was aborted.";
                    break;
                case MediaError.MEDIA_ERR_NETWORK:
                    message = "A network error occurred while fetching the video stream.";
                    break;
                case MediaError.MEDIA_ERR_DECODE:
                    message = "An error occurred while decoding the video stream.";
                    break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    message = "The video format or source is not supported.";
                    break;
                default:
                    message = `An unknown video playback error occurred (Code: ${videoError?.code}).`;
            }
            console.error(message); // Log the interpreted message
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
         {/* Video Feed - always render video tag */}
        <div className={`relative w-full aspect-video ${isStarting ? 'hidden' : 'block'}`}>
           <video
            ref={videoRef}
            className="w-full h-full object-contain block bg-black" // Use object-contain
            playsInline // Essential for iOS Safari
            muted // Muted prevents requesting microphone access
            // Autoplay might cause issues, rely on play() in handleCanPlay
            // autoPlay
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

       {/* Stop Button - Shown when camera is on */}
       {isActive && !isStarting && (
         <Button onClick={() => stopCamera("manual stop button")} variant="outline" disabled={isStarting} className="transition-subtle">
           <Ban className="mr-2 h-4 w-4" /> Stop Scanning
         </Button>
       )}


       {/* Error Display */}
      {error && !isStarting && ( // Show errors when not in the process of starting
        <Alert variant="destructive" className="w-full mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Scanner Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          {/* Offer 'Try Again' only if the scanner is not currently active */}
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
            0% { transform: translateY(5%); } /* Start slightly inset */
            100% { transform: translateY(95%); } /* End slightly inset */
         }
         .animate-scan-line {
             animation: scan-line 2.5s linear infinite alternate; /* Use alternate for back-and-forth */
             height: 2px; /* Make line thinner */
             box-shadow: 0 0 5px 1px hsl(var(--accent) / 0.7); /* Add a subtle glow */

         }
       `}</style>
    </div>
  );
};

export default BarcodeScanner;
