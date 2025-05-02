
'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, Ban, AlertCircle, Loader2 } from 'lucide-react'; // Removed ScanLine
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BrowserMultiFormatReader, NotFoundException, ChecksumException, FormatException, DecodeHintType } from '@zxing/library';

interface BarcodeScannerProps {
  onScanSuccess: (imageDataUri: string) => void;
  onScanError?: (error: Error) => void;
  onManualStop?: (imageDataUri: string | null) => void; // New prop for manual stop
  buttonText?: string;
  scanPrompt?: string;
  disabled?: boolean;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScanSuccess,
  onScanError,
  onManualStop, // Destructure new prop
  buttonText = 'Start Scanning',
  scanPrompt = 'Position barcode in front of the camera...',
  disabled = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number>(); // For requestAnimationFrame loop

  const [isStarting, setIsStarting] = useState(false); // Camera hardware/permission acquisition phase
  const [isActive, setIsActive] = useState(false); // Stream is acquired and video element should be visible
  const [isScanning, setIsScanning] = useState(false); // Actively decoding frames
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Flag to prevent multiple success callbacks for a single scan session
  const processingSuccessRef = useRef(false);

  // --- Cleanup Function ---
  const cleanupCamera = useCallback((caller?: string) => {
    console.log(`[${caller || 'cleanup'}] Cleaning up camera resources.`);
    processingSuccessRef.current = false; // Ensure processing flag is reset

    // Stop scanning loop
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = undefined;
      console.log(`[${caller || 'cleanup'}] Cancelled animation frame.`);
    }

    // Reset ZXing reader
    if (readerRef.current) {
      try {
        // No need to explicitly call reset, just nullify the ref
        // readerRef.current.reset(); // reset() can sometimes cause issues if called after stream stop
        console.log(`[${caller || 'cleanup'}] Nullifying ZXing Reader reference.`);
      } catch (resetError) {
        console.warn(`[${caller || 'cleanup'}] Error during ZXing Reader handling:`, resetError);
      } finally {
        readerRef.current = null;
      }
    }

     // Stop media tracks *before* clearing video source
     if (streamRef.current) {
        console.log(`[${caller || 'cleanup'}] Stopping tracks on stream: ${streamRef.current.id}`);
        streamRef.current.getTracks().forEach(track => {
            track.stop();
            console.log(`[${caller || 'cleanup'}] Stopped track: ${track.label} (${track.kind}, state: ${track.readyState})`);
        });
        streamRef.current = null; // Clear stream ref *after* stopping tracks
        console.log(`[${caller || 'cleanup'}] Cleared stream ref.`);
     } else {
         console.log(`[${caller || 'cleanup'}] No active stream ref found to stop tracks.`);
     }


    // Stop video playback and clear source
    const video = videoRef.current;
    if (video) {
        if (!video.paused) {
            video.pause();
            console.log(`[${caller || 'cleanup'}] Paused video playback.`);
        }
        // Important: Set srcObject to null *after* stopping tracks
        if (video.srcObject) {
            video.srcObject = null;
            console.log(`[${caller || 'cleanup'}] Cleared video srcObject.`);
        } else {
             console.log(`[${caller || 'cleanup'}] Video srcObject was already null.`);
        }
    }


    // Reset state, but maybe keep error for display unless explicitly cleared elsewhere?
    setIsStarting(false);
    setIsActive(false);
    setIsScanning(false);
    // Decide if error should be cleared here or handled by the calling context
    // setError(null);
    console.log(`[${caller || 'cleanup'}] State reset (isActive: false, isScanning: false).`);
  }, []); // No dependencies, uses refs

  // --- Unmount Cleanup ---
  useEffect(() => {
    return () => {
      console.log("BarcodeScanner: Unmounting. Cleaning up camera.");
      cleanupCamera("unmount");
    };
  }, [cleanupCamera]);

  // --- Frame Capture ---
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !isActive || video.readyState < video.HAVE_CURRENT_DATA || video.videoWidth === 0) {
      console.warn("CaptureFrame: Conditions not met.", { videoExists: !!video, canvasExists: !!canvas, isActive, readyState: video?.readyState, width: video?.videoWidth });
      return null;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      console.error("CaptureFrame: Canvas context is null.");
      setError("Failed to get canvas context for frame capture.");
      if (onScanError) onScanError(new Error("Canvas context unavailable."));
      cleanupCamera("captureFrame context error");
      return null;
    }

    try {
      // Set canvas dimensions based on video's actual rendered size
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      // Draw the current video frame onto the canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      // Get the image data as a PNG Data URI
      const imageDataUri = canvas.toDataURL('image/png');
      console.log("CaptureFrame: Success.");
      return imageDataUri;
    } catch (e: any) {
      console.error("CaptureFrame: Error during drawImage or toDataURL:", e);
      setError(`Failed to capture frame: ${e.message || 'Unknown canvas error'}`);
      if (onScanError) onScanError(e instanceof Error ? e : new Error(`Frame capture failed: ${e.message || 'Unknown canvas error'}`));
      cleanupCamera("captureFrame draw error");
      return null;
    }
  }, [isActive, onScanError, cleanupCamera]); // Dependencies

  // --- Scanning Loop ---
  const runScanLoop = useCallback(() => {
    // Ensure loop stops if component becomes inactive, scanning is disabled, or already processing success
    if (!isActive || !isScanning || processingSuccessRef.current || !readerRef.current || !videoRef.current) {
        console.log("runScanLoop: Stopping loop.", { isActive, isScanning, processing: processingSuccessRef.current, hasReader: !!readerRef.current, hasVideo: !!videoRef.current });
        scanLoopRef.current = undefined; // Ensure ref is cleared when loop stops
        return;
    }

    const reader = readerRef.current;
    const videoElement = videoRef.current;

    // Check if video is ready to be decoded
    if (videoElement.readyState >= videoElement.HAVE_ENOUGH_DATA) {
      reader.decodeFromVideoElement(videoElement).then(result => {
        // Double-check conditions in case state changed during async operation
        if (processingSuccessRef.current || !isScanning || !isActive) {
            console.log("runScanLoop (decode success): Conditions changed, ignoring result.");
            return;
        }

        console.log("runScanLoop: Barcode detected:", result.getText());
        processingSuccessRef.current = true; // Set flag *immediately* to prevent further processing/loops
        // Keep isScanning true visually for a moment, but stop the actual loop via processingSuccessRef

        const imageDataUri = captureFrame();

        if (imageDataUri) {
          console.log("runScanLoop: Frame captured, calling onScanSuccess.");
          onScanSuccess(imageDataUri); // Trigger the success callback with the captured frame
          // Consider if automatic cleanup or manual stop is desired after success
          // cleanupCamera("scan success"); // Option 1: Stop camera immediately after success
          // Option 2: Keep camera running, maybe add a visual indicator of success?

          // Example: Auto-stop after success (remove if continuous scanning is needed)
          console.log("runScanLoop: Auto-stopping camera after successful scan.");
          cleanupCamera("auto-stop after success");


        } else {
          // If frame capture fails *after* detection, it's a problem
          console.error("runScanLoop: Failed to capture frame after barcode detection.");
          const captureFailError = new Error("Frame capture failed after detection.");
          setError(captureFailError.message);
          if (onScanError) onScanError(captureFailError);
          cleanupCamera("capture frame fail after success"); // Stop on critical error
        }

      }).catch(err => {
         // Ignore errors if loop should have already stopped
        if (processingSuccessRef.current || !isScanning || !isActive) {
            // console.log("runScanLoop (decode catch): Conditions changed, ignoring error.");
            return;
        }

        // Handle specific ZXing errors, ignore 'NotFound' which is expected
        if (err instanceof NotFoundException) {
          // Normal case: no barcode found in this frame, continue loop
        } else if (err instanceof ChecksumException || err instanceof FormatException) {
           console.warn(`runScanLoop: Ignoring minor scan error: ${err.name}`); // Optional: log minor errors
        } else {
          // Handle more significant errors
          console.error('runScanLoop: Significant error during barcode decoding:', err);
          const errorMsg = `Scanning error: ${err instanceof Error ? err.message : String(err)}`;
          setError(errorMsg);
          if (onScanError) {
            onScanError(err instanceof Error ? err : new Error(errorMsg));
          }
          cleanupCamera("scan decode error catch"); // Stop on significant error
        }
      });
    } else {
        // console.log("runScanLoop: Video not ready yet."); // Can be noisy if logged every frame
    }

    // Request the next frame if conditions are still met
    if (isActive && isScanning && !processingSuccessRef.current) {
      scanLoopRef.current = requestAnimationFrame(runScanLoop);
    } else {
       // Ensure the ref is cleared if the loop logic decides not to request the next frame
       // This prevents potential dangling requestAnimationFrame callbacks
       scanLoopRef.current = undefined;
       console.log("runScanLoop: Not requesting next frame.", { isActive, isScanning, processing: processingSuccessRef.current });
    }
  }, [isActive, isScanning, captureFrame, onScanSuccess, cleanupCamera, onScanError]); // Dependencies


  // --- Start Camera ---
  const startCamera = useCallback(async () => {
    console.log("startCamera: Initiated.");
    if (isStarting || isActive) {
      console.warn("startCamera: Aborted - already starting or active.");
      return;
    }
    setError(null); // Clear previous errors
    setIsStarting(true); // Indicate camera acquisition phase
    setIsActive(false); // Ensure video element is hidden initially
    setIsScanning(false);
    processingSuccessRef.current = false;

    // Ensure any previous instances are thoroughly cleaned up before starting a new one
    cleanupCamera("startCamera preamble");
    // Give a brief moment for resources to potentially release (heuristic)
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      console.log("startCamera: Requesting media stream...");
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access (getUserMedia) is not supported by this browser.');
      }
      // Request camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment", // Prefer rear camera
          width: { ideal: 640 }, // Standard VGA width
          height: { ideal: 480 } // Standard VGA height
          // Using specific vertical resolutions can sometimes fail if not supported
          // width: { ideal: 480 },
          // height: { ideal: 640 }
        },
        audio: false, // No audio needed
      });
      console.log("startCamera: Stream obtained:", stream.id);
      streamRef.current = stream; // Store the active stream

      const video = videoRef.current;
      if (!video) {
          // This should ideally not happen if the component is mounted
          stream.getTracks().forEach(track => track.stop()); // Release stream if video element disappears
          throw new Error("Video element reference is not available.");
      }

      // Attach the obtained stream to the video element
      video.srcObject = stream;

      // Attempt to play the video stream
      await video.play();
      console.log("startCamera: Video playback initiated.");

      // Initialize ZXing Reader *after* video starts playing
      const hints = new Map();
      // Specify barcode formats if known (e.g., Code 128 common on IDs)
      // hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE]);
      // Reduce time between scans slightly? (default 500ms)
      readerRef.current = new BrowserMultiFormatReader(hints, 400);
      console.log("startCamera: ZXing Reader initialized.");


      // Update state: Camera is active and scanning should begin
      setIsActive(true);
      setIsScanning(true);
      processingSuccessRef.current = false; // Ensure flag is reset before loop starts

      // Start the scanning loop
      console.log("startCamera: Starting scan loop.");
      if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current); // Clear any previous loop just in case
      scanLoopRef.current = requestAnimationFrame(runScanLoop);


    } catch (err: any) {
      console.error('startCamera: Error accessing or starting camera:', err);
      let message = `Could not access the camera. Error: ${err.name || 'UnknownError'} - ${err.message || 'No details available'}`;
       // Provide more user-friendly messages for common errors
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
           message = 'Camera permission denied. Please allow access in your browser settings and reload the page.';
      } else if (['NotFoundError', 'DevicesNotFoundError'].includes(err.name)) {
           message = 'No camera found. Ensure it is connected, enabled, and not disabled by system settings.';
      } else if (['NotReadableError', 'TrackStartError', 'AbortError', 'OverconstrainedError'].includes(err.name)) {
           // This is often the "already in use" error
           message = 'Camera is already in use or could not be started. Please close other applications or browser tabs that might be using the camera and try again.';
      } else if (err.name === 'SecurityError') {
           message = 'Camera access denied due to security settings. This feature requires a secure connection (HTTPS).';
      } else if (err.message && err.message.includes('Invalid constraints')) {
           message = 'The requested camera settings (like resolution) are not supported by your device.';
      }


      setError(message);
      toast({ title: 'Camera Error', description: message, variant: 'destructive' });
      if (onScanError) onScanError(err instanceof Error ? err : new Error(message));
      // Critical: Ensure cleanup happens even if start fails
      cleanupCamera("startCamera error handler");
    } finally {
        // Mark the starting phase as complete, regardless of success or failure
        setIsStarting(false);
        console.log("startCamera: Finished start attempt.");
    }
  }, [toast, onScanError, cleanupCamera, isStarting, isActive, runScanLoop]); // Dependencies

  // --- Manual Stop ---
  const handleStopClick = () => {
    console.log("Manual stop button clicked.");
    const lastFrame = captureFrame(); // Capture frame *before* cleanup
    cleanupCamera("manual stop");
    setError(null); // Clear error when manually stopping

    // Call the onManualStop callback with the captured frame
    if (onManualStop) {
      onManualStop(lastFrame);
    }
  };

  // --- Video Element Error Handling ---
  useEffect(() => {
    const videoElement = videoRef.current;
    const handleError = (event: Event) => {
        console.error('Video Element Error Event:', event);
        const videoError = videoElement?.error;
        console.error('Video Element MediaError:', videoError);
        let message = "An unknown video error occurred.";
        if(videoError) {
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
        // Attempt cleanup if a video error occurs, as the stream might be broken
        cleanupCamera("video error event handler");
    };

    if (videoElement) {
      videoElement.addEventListener('error', handleError);
      console.log("Attached video error handler");
    }
    // Cleanup function for the effect
    return () => {
      if (videoElement) {
        videoElement.removeEventListener('error', handleError);
        console.log("Removed video error handler");
      }
    };
  }, [cleanupCamera, toast]); // Re-attach if cleanupCamera or toast changes


  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-xs"> {/* Consistent width */}
       {/* Container for Video and Overlays - Maintain Aspect Ratio */}
       <div className={`w-full border rounded-lg overflow-hidden shadow-md bg-muted relative aspect-[3/4] ${isActive || isStarting ? 'block' : 'hidden'}`}> {/* Use aspect ratio for vertical ID cards */}

            {/* Video Feed - Always rendered when active/starting for stability */}
            <video
                ref={videoRef}
                className={`w-full h-full object-cover block bg-black transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} // Show only when truly active
                playsInline // Essential for iOS inline playback
                muted // Mute to avoid audio feedback loops/issues
                aria-label="Camera feed for barcode scanning"
            />

            {/* Loading Overlay */}
            {isStarting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white z-10 pointer-events-none">
                    <Loader2 className="h-8 w-8 animate-spin mb-2" />
                    <p className="text-sm text-muted-foreground">Starting camera...</p>
                </div>
            )}

             {/* Scanning Visual Cue & Prompt */}
             {isActive && ( // Show cues only when camera feed is live
               <div className="absolute inset-0 pointer-events-none z-5">
                 {isScanning && !processingSuccessRef.current && ( // Show only when actively scanning
                     <>
                        {/* Vertical Scan Line Animation */}
                        <div className="absolute left-0 top-0 w-full h-1 bg-gradient-to-r from-transparent via-accent to-transparent opacity-70 animate-scan-line-vertical"></div>
                         {/* Vertical Frame/Overlay - Adjusted for vertical aspect ratio */}
                        <div className="absolute inset-x-4 inset-y-8 border-2 border-accent/50 rounded pointer-events-none"></div>
                     </>
                 )}
                 {/* Prompt Text */}
                 <p className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-center text-xs text-white bg-black/50 px-2 py-1 rounded">
                   {isScanning && !processingSuccessRef.current ? scanPrompt : (processingSuccessRef.current ? 'Processing...' : (isActive ? 'Camera ready' : ''))}
                 </p>
               </div>
            )}
       </div>


      {/* Control Buttons */}
      <div className="flex gap-4">
          {/* Show Start button only if not active and not currently starting */}
          {!isActive && !isStarting && (
            <Button onClick={startCamera} disabled={disabled || isStarting} className="transition-subtle">
              <Camera className="mr-2 h-4 w-4" /> {buttonText}
            </Button>
          )}

           {/* Stop button (Conditional rendering based on onManualStop prop) */}
           {isActive && !isStarting && onManualStop && ( // Only show if handler provided
             <Button onClick={handleStopClick} variant="outline" disabled={isStarting} className="transition-subtle">
               <Ban className="mr-2 h-4 w-4" /> Stop & Use This Frame
             </Button>
           )}
      </div>

       {/* Error Display */}
      {error && !isStarting && ( // Show error if it exists and we are not in the process of starting
        <Alert variant="destructive" className="w-full mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Scanner Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          {/* Offer to try again only if the camera is not currently active */}
          {!isActive && (
            <Button onClick={startCamera} variant="ghost" size="sm" className="mt-2 text-xs">
              <RefreshCw className="mr-1 h-3 w-3" /> Try Again
            </Button>
          )}
        </Alert>
      )}

      {/* Hidden canvas used for capturing frames */}
      <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true"></canvas>

      {/* CSS for animations (ensure this is included) */}
      <style jsx global>{`
         @keyframes scan-line-vertical {
            0% { transform: translateY(10%); } /* Start near top */
            100% { transform: translateY(90%); } /* End near bottom */
         }
         .animate-scan-line-vertical {
             animation: scan-line-vertical 2.5s linear infinite alternate;
             height: 2px; /* Keep it as a thin line */
             box-shadow: 0 0 5px 1px hsl(var(--accent) / 0.7);
         }
       `}</style>
    </div>
  );
};

export default BarcodeScanner;
