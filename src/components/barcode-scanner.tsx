
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

    // Stop scanning loop
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = undefined;
      console.log(`[${caller || 'cleanup'}] Cancelled animation frame.`);
    }

    // Reset ZXing reader
    if (readerRef.current) {
      try {
        readerRef.current.reset();
        console.log(`[${caller || 'cleanup'}] ZXing Reader reset.`);
      } catch (resetError) {
        console.warn(`[${caller || 'cleanup'}] Error resetting ZXing Reader:`, resetError);
      } finally {
        readerRef.current = null;
      }
    }

    // Stop video playback and clear source
    const video = videoRef.current;
    if (video) {
        if (!video.paused) {
            video.pause();
            console.log(`[${caller || 'cleanup'}] Paused video playback.`);
        }
        if (video.srcObject) {
            // Important: Get tracks from the streamRef, not potentially stale srcObject
            if (streamRef.current) {
                console.log(`[${caller || 'cleanup'}] Stopping tracks on stream: ${streamRef.current.id}`);
                streamRef.current.getTracks().forEach(track => {
                    track.stop();
                    console.log(`[${caller || 'cleanup'}] Stopped track: ${track.label} (${track.kind})`);
                });
            } else {
                 console.log(`[${caller || 'cleanup'}] No stream ref found, attempting to stop tracks on srcObject.`);
                 // Fallback: try stopping tracks directly from srcObject if streamRef is null
                 const currentSrcObject = video.srcObject;
                 if (currentSrcObject instanceof MediaStream) {
                    currentSrcObject.getTracks().forEach(track => track.stop());
                 }
            }
            video.srcObject = null;
            console.log(`[${caller || 'cleanup'}] Cleared video srcObject.`);
        }
    }

     // Clear the stream reference *after* stopping tracks
    if (streamRef.current) {
        streamRef.current = null;
        console.log(`[${caller || 'cleanup'}] Cleared stream ref.`);
    }


    // Reset state
    setIsStarting(false);
    setIsActive(false);
    setIsScanning(false);
    processingSuccessRef.current = false;
    // Keep error state intact for display unless explicitly clearing
    console.log(`[${caller || 'cleanup'}] State reset.`);
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
      console.warn("CaptureFrame: Conditions not met.", { video, canvas, isActive, readyState: video?.readyState, width: video?.videoWidth });
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
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageDataUri = canvas.toDataURL('image/png'); // Use PNG for better quality than default JPEG
      console.log("CaptureFrame: Success.");
      return imageDataUri;
    } catch (e: any) {
      console.error("CaptureFrame: Error during drawImage or toDataURL:", e);
      setError(`Failed to capture frame: ${e.message || 'Unknown canvas error'}`);
      if (onScanError) onScanError(e instanceof Error ? e : new Error(`Frame capture failed: ${e.message || 'Unknown canvas error'}`));
      cleanupCamera("captureFrame draw error");
      return null;
    }
  }, [isActive, onScanError, cleanupCamera]);

  // --- Scanning Loop ---
  const runScanLoop = useCallback(() => {
    // Conditions to stop the loop
    if (!isActive || !isScanning || processingSuccessRef.current || !readerRef.current || !videoRef.current) {
        console.log("runScanLoop: Stopping loop.", { isActive, isScanning, processing: processingSuccessRef.current, hasReader: !!readerRef.current, hasVideo: !!videoRef.current });
        scanLoopRef.current = undefined; // Ensure ref is cleared
        return;
    }

    const reader = readerRef.current;
    const videoElement = videoRef.current;

    if (videoElement.readyState >= videoElement.HAVE_ENOUGH_DATA) {
      reader.decodeFromVideoElement(videoElement).then(result => {
        if (processingSuccessRef.current || !isScanning) return; // Already handled or stopped

        console.log("Barcode detected:", result.getText());
        processingSuccessRef.current = true; // Set flag *immediately*
        setIsScanning(false); // Signal scanning process stopped for this detection

        const imageDataUri = captureFrame();

        if (imageDataUri) {
          console.log("Frame captured, calling onScanSuccess.");
          onScanSuccess(imageDataUri);
           // Auto-restart scanning after a short delay
           setTimeout(() => {
              processingSuccessRef.current = false;
              if (isActive) { // Check if still active before restarting scan state
                  setIsScanning(true); // Re-enable scanning state
                  scanLoopRef.current = requestAnimationFrame(runScanLoop); // Restart loop
              } else {
                  console.log("runScanLoop: Delay ended, but scanner is no longer active. Not restarting loop.")
              }
           }, 1500); // e.g., 1.5 seconds delay before next scan attempt

        } else {
          console.error("Failed to capture frame after barcode detection.");
          const captureFailError = new Error("Frame capture failed after detection.");
          setError(captureFailError.message);
          if (onScanError) onScanError(captureFailError);
          cleanupCamera("capture frame fail after success"); // Stop on critical error
        }

      }).catch(err => {
        if (processingSuccessRef.current || !isScanning) return; // Ignore errors if stopped

        if (err instanceof NotFoundException) {
          // Normal case: no barcode found, continue loop
        } else if (err instanceof ChecksumException || err instanceof FormatException) {
          // console.warn(`Ignoring scan error: ${err.name}`); // Optional: log minor errors
        } else {
          console.error('Significant error during barcode scanning:', err);
          const errorMsg = `Scanning error: ${err instanceof Error ? err.message : String(err)}`;
          setError(errorMsg);
          if (onScanError) {
            onScanError(err instanceof Error ? err : new Error(errorMsg));
          }
          cleanupCamera("scan error catch"); // Stop on significant error
        }
      });
    } else {
        // console.log("runScanLoop: Video not ready."); // Can be noisy
    }

    // Continue the loop if conditions met and not currently processing a success
    if (isActive && isScanning && !processingSuccessRef.current) {
      scanLoopRef.current = requestAnimationFrame(runScanLoop);
    } else {
      console.log("runScanLoop: Not requesting next frame.", { isActive, isScanning, processing: processingSuccessRef.current });
       // Ensure the ref is cleared if the loop logic decides not to request the next frame
       if (!processingSuccessRef.current) { // Don't clear if waiting for timeout
          scanLoopRef.current = undefined;
       }
    }
  }, [isActive, isScanning, captureFrame, onScanSuccess, cleanupCamera, onScanError]);


  // --- Start Camera ---
  const startCamera = useCallback(async () => {
    console.log("startCamera: Initiated.");
    if (isStarting || isActive) {
      console.log("startCamera: Aborted - already starting or active.");
      return;
    }
    setError(null); // Clear previous errors
    setIsStarting(true);
    setIsActive(false);
    setIsScanning(false);
    processingSuccessRef.current = false;

    // Ensure cleanup before starting
    cleanupCamera("startCamera preamble");
    await new Promise(resolve => setTimeout(resolve, 50)); // Short delay

    try {
      console.log("startCamera: Requesting media stream...");
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access (getUserMedia) is not supported by this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          // Request a resolution closer to vertical aspect ratio if supported
          width: { ideal: 480 },
          height: { ideal: 640 }
          // If the above causes issues, revert to:
          // width: { ideal: 640 },
          // height: { ideal: 480 }
        },
        audio: false,
      });
      console.log("startCamera: Stream obtained:", stream.id);
      streamRef.current = stream; // Store stream in ref

      const video = videoRef.current;
      if (!video) {
          throw new Error("Video element reference is not available.");
      }

      // Attach stream to video element
      video.srcObject = stream;

      // Play the video - crucial step
      await video.play();
      console.log("startCamera: Video playback initiated.");

      // Once playback starts, update state and init scanner
      setIsActive(true); // Show video element
      setIsScanning(true); // Enable scanning state
      processingSuccessRef.current = false; // Reset success flag

       // Initialize ZXing Reader
      const hints = new Map();
      // Specify formats if needed, e.g., Code 128 for IDs, QR codes, etc.
      // hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE]);
      readerRef.current = new BrowserMultiFormatReader(hints, 500); // Adjust timeBetweenScansMillis if needed
      console.log("startCamera: ZXing Reader initialized.");

      // Start the scanning loop
      console.log("startCamera: Starting scan loop.");
      scanLoopRef.current = requestAnimationFrame(runScanLoop);


    } catch (err: any) {
      console.error('Error accessing or starting camera:', err);
      let message = `Could not access the camera. Error: ${err.name} - ${err.message}`;
       // Simplify error messages for common cases
      if (err.name === 'NotAllowedError') message = 'Camera permission denied. Please allow access in browser settings.';
      else if (['NotFoundError', 'DevicesNotFoundError'].includes(err.name)) message = 'No camera found. Ensure it is connected and enabled.';
      else if (['NotReadableError', 'TrackStartError', 'AbortError', 'OverconstrainedError'].includes(err.name)) message = 'Camera is already in use or could not be started. Close other applications that might be using it.';
      else if (err.name === 'SecurityError') message = 'Camera access denied due to security settings (e.g., requires HTTPS).';

      setError(message);
      toast({ title: 'Camera Error', description: message, variant: 'destructive' });
      if (onScanError) onScanError(err instanceof Error ? err : new Error(message));
      cleanupCamera("startCamera error"); // Cleanup on error
    } finally {
        setIsStarting(false); // Ensure starting phase is ended
        console.log("startCamera: Finished start attempt.");
    }
  }, [toast, onScanError, cleanupCamera, isStarting, isActive, runScanLoop]); // Dependencies

  // --- Manual Stop ---
  const handleStopClick = () => {
    console.log("Manual stop button clicked.");
    cleanupCamera("manual stop");
    setError(null); // Clear error when manually stopping
  };

  // --- Video Element Error Handling ---
  useEffect(() => {
    const videoElement = videoRef.current;
    const handleError = (event: Event) => {
        console.error('Video Element Error:', event, videoElement?.error);
        const videoError = videoElement?.error;
        let message = "An unknown video error occurred.";
        if(videoError) {
            switch (videoError.code) {
                case MediaError.MEDIA_ERR_ABORTED: message = "Video playback aborted."; break;
                case MediaError.MEDIA_ERR_NETWORK: message = "Network error fetching video stream."; break;
                case MediaError.MEDIA_ERR_DECODE: message = "Error decoding video stream."; break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: message = "Video source not supported."; break;
            }
        }
        setError(message);
        toast({ title: "Video Error", description: message, variant: "destructive" });
        cleanupCamera("video error event");
    };

    if (videoElement) {
      videoElement.addEventListener('error', handleError);
    }
    return () => {
      if (videoElement) {
        videoElement.removeEventListener('error', handleError);
      }
    };
  }, [cleanupCamera, toast]); // Re-attach if cleanupCamera changes


  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-xs"> {/* Reduced max-width for vertical */}
       {/* Container for Video and Loading State - Vertical Aspect Ratio */}
       <div className={`w-full border rounded-lg overflow-hidden shadow-md bg-muted relative aspect-[3/4] ${isStarting || isActive ? 'block' : 'hidden'}`}>

            {/* Video Feed - Always rendered for stability, hidden via parent */}
            <video
                ref={videoRef}
                className={`w-full h-full object-cover block bg-black ${isStarting ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`} // Use object-cover for vertical
                playsInline
                muted
                aria-label="Camera feed for barcode scanning"
            />

            {/* Loading Overlay */}
            {isStarting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white z-10">
                    <Loader2 className="h-8 w-8 animate-spin mb-2" />
                    <p className="text-sm text-muted-foreground">Starting camera...</p>
                </div>
            )}

             {/* Scanning Visual Cue & Prompt */}
             {isActive && (
               <div className="absolute inset-0 pointer-events-none z-5">
                 {isScanning && (
                     <>
                        {/* Scan Line Animation - Vertical */}
                        <div className="absolute left-0 top-0 w-full h-1 bg-gradient-to-r from-transparent via-accent to-transparent opacity-70 animate-scan-line-vertical"></div>
                         {/* Vertical Frame border */}
                        <div className="absolute inset-x-4 inset-y-10 border-2 border-accent/50 rounded pointer-events-none"></div>
                     </>
                 )}
                 {/* Prompt Text */}
                 <p className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-center text-xs text-white bg-black/50 px-2 py-1 rounded">
                   {isScanning ? scanPrompt : (isActive ? 'Camera active' : '')}
                 </p>
               </div>
            )}
       </div>


      {/* Control Buttons */}
      <div className="flex gap-4">
          {!isActive && !isStarting && (
            <Button onClick={startCamera} disabled={disabled || isStarting} className="transition-subtle">
              <Camera className="mr-2 h-4 w-4" /> {buttonText}
            </Button>
          )}

           {/* Removed the Stop Button based on the last request */}
           {/* {isActive && !isStarting && (
             <Button onClick={handleStopClick} variant="outline" disabled={isStarting} className="transition-subtle">
               <Ban className="mr-2 h-4 w-4" /> Stop Scanning
             </Button>
           )} */}
      </div>

       {/* Error Display */}
      {error && !isStarting && (
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

      {/* CSS for animations */}
      <style jsx global>{`
         @keyframes scan-line-vertical {
            0% { transform: translateY(10%); } /* Start near top */
            100% { transform: translateY(90%); } /* End near bottom */
         }
         .animate-scan-line-vertical {
             animation: scan-line-vertical 2.5s linear infinite alternate;
             height: 2px; /* Keep it as a line */
             box-shadow: 0 0 5px 1px hsl(var(--accent) / 0.7);
         }
       `}</style>
    </div>
  );
};

export default BarcodeScanner;

