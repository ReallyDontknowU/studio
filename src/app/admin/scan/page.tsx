

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import BarcodeScanner from '@/components/barcode-scanner';
import { useToast } from '@/hooks/use-toast';
import type { Student, EntryLog, EntryType } from '@/lib/types';
import { extractBarcodeData } from '@/ai/flows/extract-barcode-data';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, LogIn, LogOut, AlertCircle, UserCheck, UserX, ImageOff } from 'lucide-react'; // Added ImageOff
import { MIN_LIBRARY_INTERVAL_SECONDS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import Image from 'next/image'; // Import Image

// Helper function to get student data (replace with actual API call)
const getStudentById = (id: string): Student | null => {
  const students: Student[] = JSON.parse(localStorage.getItem('students') || '[]');
  // Case-insensitive comparison for ID
  return students.find(s => s.id.toLowerCase() === id.toLowerCase()) || null;
};

// Helper function to get last entry/exit log for a student (replace with actual API call)
const getLastLogForStudent = (studentId: string): EntryLog | null => {
  const logs: EntryLog[] = JSON.parse(localStorage.getItem('entryLogs') || '[]');
  // Case-insensitive comparison for studentId when filtering
  const studentLogs = logs
      .filter(log => log.studentId.toLowerCase() === studentId.toLowerCase())
      .map(log => ({ ...log, timestamp: new Date(log.timestamp) })) // Ensure Date objects
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return studentLogs.length > 0 ? studentLogs[0] : null;
};


// Helper function to save entry log (replace with actual API call)
const saveEntryLog = (log: EntryLog): void => {
   const logs: EntryLog[] = JSON.parse(localStorage.getItem('entryLogs') || '[]');
   logs.push(log);
   localStorage.setItem('entryLogs', JSON.stringify(logs));
    // TODO: Also save to Excel/SQLite
};

// Simplified image comparison (for demonstration - replace with more robust method)
const compareImagesRoughly = (imageUri1?: string, imageUri2?: string): boolean => {
    if (!imageUri1 || !imageUri2) {
        console.log("Rough comparison skipped: One or both URIs missing.");
        return false; // Cannot compare if one is missing
    }
    // Very basic comparison based on length or a small segment
    // A real implementation would involve feature extraction or perceptual hashing
    const segmentLength = Math.min(100, imageUri1.length, imageUri2.length); // Use a safe segment length
    const segment1 = imageUri1.substring(imageUri1.length - segmentLength);
    const segment2 = imageUri2.substring(imageUri2.length - segmentLength);
    const match = segment1 === segment2;
    console.log(`Comparing image segments (last ${segmentLength} chars): Match = ${match}`);
    // console.log(`Segment 1 (stored): ${segment1}`); // Can be noisy
    // console.log(`Segment 2 (scanned): ${segment2}`);
    return match;
}

export default function AdminScanPage() {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
   // Update lastScanResult structure to include image URI
   const [lastScanResult, setLastScanResult] = useState<{
      student: Partial<Student>;
      log: Partial<EntryLog> & { type: EntryType | 'Error' };
      scannedImageUri?: string; // Add scanned image URI
      imageMatch?: boolean; // Add comparison result
   } | null>(null);
  const [isScannerActive, setIsScannerActive] = useState(false); // Start inactive, user clicks button

  const processDetectedBarcode = useCallback(async (imageDataUri: string) => {
    if (isProcessing) return; // Prevent concurrent processing

    setIsProcessing(true);
    setProcessingError(null);
    setLastScanResult(null); // Clear previous result display
    setIsScannerActive(false); // Scanner likely stopped itself, but ensure state reflects this

    let extractedId: string | null = null;
    let student: Student | null = null;
    let imageMatchResult: boolean | undefined = undefined; // undefined means not compared or no stored image

    try {
        console.log("Admin Scan: Processing detected barcode image...");
        // 1. Extract ID from barcode image (passed from scanner)
        const extractionResult = await extractBarcodeData({ barcodeImage: imageDataUri });
        console.log("Admin Scan: Extraction result:", extractionResult);

        if (!extractionResult || !extractionResult.idNumber) {
            throw new Error("Could not extract ID number from the barcode image.");
        }

        extractedId = extractionResult.idNumber.trim().toLowerCase(); // Normalize ID
        console.log(`Admin Scan: Extracted ID: ${extractedId}`);

        // 2. Find Student in the database/storage
        student = getStudentById(extractedId);
        console.log(`Admin Scan: Student lookup result for ID ${extractedId}:`, student);
        if (!student) {
            throw new Error(`Student with ID ${extractedId.toUpperCase()} not found. Please register first.`);
        }

        // 2.5 Compare scanned image with stored image
        if (student.idCardImageUri) {
            imageMatchResult = compareImagesRoughly(student.idCardImageUri, imageDataUri);
            console.log(`Admin Scan: Image comparison result for ${extractedId}: ${imageMatchResult}`);
            if (!imageMatchResult) {
                // Log a warning toast but proceed
                 toast({
                     title: "Image Mismatch Warning",
                     description: `Scanned ID image might differ from the registered image for ${student.name}.`,
                     variant: "destructive", // Use destructive variant for visibility
                     duration: 5000, // Show warning for 5 seconds
                 });
            }
        } else {
            console.log(`Admin Scan: No registered ID card image found for ${extractedId} to compare.`);
             toast({
                 title: "No Registered Image",
                 description: `No ID image on file for ${student.name} to compare against.`,
                 variant: "default",
                 duration: 3000,
             });
        }


        // 3. Determine Entry or Exit
        const lastLog = getLastLogForStudent(extractedId);
        let currentAction: EntryType = 'Entry';
        const now = new Date();

        if (lastLog) {
            const timeDiffSeconds = (now.getTime() - lastLog.timestamp.getTime()) / 1000;
            console.log(`Admin Scan: Last log for ${extractedId}:`, lastLog, `Time difference: ${timeDiffSeconds}s`);

            if (timeDiffSeconds < MIN_LIBRARY_INTERVAL_SECONDS) {
                throw new Error(`Please wait ${MIN_LIBRARY_INTERVAL_SECONDS}s before scanning ${student.name} again.`);
            }
            currentAction = lastLog.type === 'Entry' ? 'Exit' : 'Entry';
        } else {
            console.log(`Admin Scan: No previous log found for ${extractedId}. Defaulting to Entry.`);
        }

        // 4. Create new Log Entry
        const newLog: EntryLog = {
            id: `log_${Date.now()}_${extractedId}`,
            studentId: student.id, // Use the canonical ID from the student record
            studentName: student.name,
            branch: student.branch,
            timestamp: now,
            type: currentAction,
        };
        console.log("Admin Scan: Creating new log entry:", newLog);

        // 5. Save the Log Entry
        saveEntryLog(newLog);
        console.log("Admin Scan: Log entry saved.");

        // 6. Display Success feedback (including image info)
        setLastScanResult({
            student,
            log: newLog,
            scannedImageUri: imageDataUri, // Store scanned image
            imageMatch: imageMatchResult   // Store comparison result
        });
        toast({
            title: `${currentAction} Recorded`,
            description: `${student.name} (${student.id.toUpperCase()}) recorded as ${currentAction.toLowerCase()} at ${format(now, 'Pp')}.`,
            variant: 'default',
         });
         console.log(`Admin Scan: Success - ${student.name} recorded as ${currentAction}.`);

    } catch (error: any) {
        console.error('Admin Scan: Error processing scan:', error);
        const errorMessage = error.message || 'An unknown error occurred.';
        setProcessingError(errorMessage);
        toast({
            title: 'Processing Error',
            description: errorMessage,
            variant: 'destructive',
        });

        // Display error specific info, including attempted ID and potentially the student data if found before error
        let errorStudentData: Partial<Student> = { id: extractedId || "Unknown", name: "Unknown Student" };
        if (student) { // If student was found before the error occurred (e.g., rate limit)
            errorStudentData = student;
        } else if (extractedId) { // If ID was extracted but student not found
             errorStudentData = { id: extractedId, name: "Student Not Found" };
        }

        setLastScanResult({
            student: errorStudentData,
            log: { type: 'Error', timestamp: new Date() },
            scannedImageUri: imageDataUri, // Include scanned image even on error
            imageMatch: imageMatchResult, // Include comparison result if available
        });

    } finally {
        setIsProcessing(false);
        // Restart scanner automatically after a delay
        setTimeout(() => {
            if (!isScannerActive && !isProcessing) {
                console.log("Admin Scan: Restarting scanner session after processing.");
                startScannerSession();
            }
        }, 2000); // Increased delay to 2 seconds
    }
  }, [isProcessing, toast, isScannerActive]); // Added isScannerActive dependency


  const handleScanError = useCallback((error: Error) => {
    console.error("Admin Scan: Scanner component error:", error);
    const errMsg = `Scanner Error: ${error.message}. Check camera permissions and ensure it's not in use.`;
    setProcessingError(errMsg);
    toast({
        title: 'Scanner Hardware Error',
        description: errMsg,
        variant: 'destructive',
      });
    setIsScannerActive(false); // Stop the scanner display on hardware/permission error
    setIsProcessing(false); // Ensure processing state is false
  }, [toast]);


  // Function to manually activate scanner
  const startScannerSession = () => {
      setIsScannerActive(true);
      setProcessingError(null); // Clear error when explicitly restarting
      setLastScanResult(null); // Clear last result
  };


  return (
    <div className="container mx-auto px-4 py-8 flex flex-col items-center gap-8">
       <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
             <CardTitle className="text-2xl font-bold text-primary">Record Entry/Exit</CardTitle>
             <CardDescription>Scan student ID barcodes to log library visits.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">

             {/* Conditionally render Scanner or Start Button */}
             {isScannerActive ? (
                 <BarcodeScanner
                    onScanSuccess={processDetectedBarcode} // Use the processing callback
                    onScanError={handleScanError}
                    scanPrompt="Scanning for barcode..."
                    disabled={isProcessing} // Disable interaction while processing previous scan
                    autoStartScanLoop={true} // Enable automatic scanning loop
                 />
             ) : (
                 <Button onClick={startScannerSession} className="transition-subtle" disabled={isProcessing}>
                     {isProcessing ? 'Processing...' : 'Start Scanning Session'}
                 </Button>
             )}


            {isProcessing && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground mt-4">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Processing scan...</span>
                </div>
            )}

             {/* Display Last Scan Result or Error */}
             {lastScanResult && !isProcessing && (
                 <Card className={`w-full max-w-md mt-4 ${
                    lastScanResult.log.type === 'Error'
                       ? 'border-destructive bg-destructive/10'
                       : lastScanResult.log.type === 'Entry'
                         ? 'border-green-500 bg-green-500/10'
                         : 'border-red-500 bg-red-500/10'
                    } ${lastScanResult.imageMatch === false ? 'border-yellow-500' : ''}`}> {/* Highlight mismatch */}
                     <CardHeader>
                         <CardTitle className="flex items-center gap-2 text-lg">
                             {lastScanResult.log.type === 'Error' ? (
                                 <><UserX className="text-destructive" /> Scan Error</>
                             ) : lastScanResult.log.type === 'Entry' ? (
                                 <><UserCheck className="text-green-600" /> Entry Recorded</>
                             ) : (
                                 <><LogOut className="text-red-600" /> Exit Recorded</>
                              )}
                         </CardTitle>
                         <CardDescription>
                            {lastScanResult.log.timestamp ? `Scan Time: ${format(lastScanResult.log.timestamp, 'Pp')}` : processingError || "Details unavailable"}
                         </CardDescription>
                     </CardHeader>
                     <CardContent className="text-sm space-y-2">
                        {/* Display Scanned Image */}
                        {lastScanResult.scannedImageUri && (
                            <div className="flex flex-col items-center mb-2">
                                <p className="text-xs font-medium text-muted-foreground mb-1">Scanned Image:</p>
                                <Image
                                    src={lastScanResult.scannedImageUri}
                                    alt="Scanned ID"
                                    width={100}
                                    height={150}
                                    className={`rounded border ${lastScanResult.imageMatch === false ? 'border-yellow-500 border-2' : 'border-muted'}`}
                                />
                                {lastScanResult.imageMatch === false && (
                                    <span className="text-xs text-yellow-600 font-semibold mt-1">Image Mismatch!</span>
                                )}
                                 {lastScanResult.imageMatch === undefined && lastScanResult.log.type !== 'Error' && (
                                     <span className="text-xs text-muted-foreground mt-1">(No stored image for comparison)</span>
                                 )}
                            </div>
                        )}

                        {/* Display Student Details */}
                        <div>
                            <p><strong>Student:</strong> {lastScanResult.student?.name || 'N/A'}</p>
                            <p><strong>ID:</strong> {lastScanResult.student?.id?.toUpperCase() || 'N/A'}</p>
                            {lastScanResult.log.type !== 'Error' && (
                                <p><strong>Branch:</strong> {lastScanResult.student?.branch || 'N/A'}</p>
                            )}
                        </div>

                        {/* Display Error Message if applicable */}
                        {lastScanResult.log.type === 'Error' && (
                            <p className="text-destructive font-medium pt-1">{processingError || "An unknown error occurred."}</p>
                        )}
                    </CardContent>
                 </Card>
             )}

             {/* Separate display for processing/scanner errors if not attached to lastScanResult */}
              {processingError && !lastScanResult && !isProcessing && (
                 <Alert variant="destructive" className="w-full max-w-md mt-4">
                     <AlertCircle className="h-4 w-4" />
                     <AlertTitle>Error During Scan</AlertTitle>
                     <AlertDescription>{processingError}</AlertDescription>
                     {!isScannerActive && <Button onClick={startScannerSession} size="sm" variant="outline" className="mt-2">Try Again</Button>}
                 </Alert>
              )}
          </CardContent>
       </Card>
    </div>
  );
}
