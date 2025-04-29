
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import BarcodeScanner from '@/components/barcode-scanner';
import { useToast } from '@/hooks/use-toast';
import type { Student, EntryLog, EntryType } from '@/lib/types';
import { extractBarcodeData } from '@/ai/flows/extract-barcode-data';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, LogIn, LogOut, AlertCircle, UserCheck, UserX } from 'lucide-react';
import { MIN_LIBRARY_INTERVAL_SECONDS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

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

export default function AdminScanPage() {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [lastScanResult, setLastScanResult] = useState<{ student: Partial<Student>; log: Partial<EntryLog> & { type: EntryType | 'Error' } } | null>(null);
  const [isScannerActive, setIsScannerActive] = useState(false); // Start inactive, user clicks button

  const processDetectedBarcode = useCallback(async (imageDataUri: string) => {
    if (isProcessing) return; // Prevent concurrent processing

    setIsProcessing(true);
    setProcessingError(null);
    setLastScanResult(null); // Clear previous result display
    setIsScannerActive(false); // Scanner likely stopped itself, but ensure state reflects this

    try {
        console.log("Admin Scan: Processing detected barcode image...");
        // 1. Extract ID from barcode image (passed from scanner)
        const extractionResult = await extractBarcodeData({ barcodeImage: imageDataUri });
        console.log("Admin Scan: Extraction result:", extractionResult);

        if (!extractionResult || !extractionResult.idNumber) {
            throw new Error("Could not extract ID number from the barcode image.");
        }

        const studentId = extractionResult.idNumber.trim().toLowerCase(); // Normalize ID
        console.log(`Admin Scan: Extracted ID: ${studentId}`);

        // 2. Find Student in the database/storage
        const student = getStudentById(studentId);
        console.log(`Admin Scan: Student lookup result for ID ${studentId}:`, student);
        if (!student) {
            throw new Error(`Student with ID ${studentId.toUpperCase()} not found. Please register first.`);
        }

        // 3. Determine Entry or Exit
        const lastLog = getLastLogForStudent(studentId);
        let currentAction: EntryType = 'Entry';
        const now = new Date();

        if (lastLog) {
            const timeDiffSeconds = (now.getTime() - lastLog.timestamp.getTime()) / 1000;
            console.log(`Admin Scan: Last log for ${studentId}:`, lastLog, `Time difference: ${timeDiffSeconds}s`);

            if (timeDiffSeconds < MIN_LIBRARY_INTERVAL_SECONDS) {
                throw new Error(`Please wait ${MIN_LIBRARY_INTERVAL_SECONDS}s before scanning ${student.name} again.`);
            }
            currentAction = lastLog.type === 'Entry' ? 'Exit' : 'Entry';
        } else {
            console.log(`Admin Scan: No previous log found for ${studentId}. Defaulting to Entry.`);
        }

        // 4. Create new Log Entry
        const newLog: EntryLog = {
            id: `log_${Date.now()}_${studentId}`,
            studentId: student.id,
            studentName: student.name,
            branch: student.branch,
            timestamp: now,
            type: currentAction,
        };
        console.log("Admin Scan: Creating new log entry:", newLog);

        // 5. Save the Log Entry
        saveEntryLog(newLog);
        console.log("Admin Scan: Log entry saved.");

        // 6. Display Success feedback
        setLastScanResult({ student, log: newLog });
        toast({
            title: `${currentAction} Recorded`,
            description: `${student.name} (${student.id}) recorded as ${currentAction.toLowerCase()} at ${format(now, 'Pp')}.`,
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

        // Display error specific info
        let errorStudentId = "Unknown";
        const match = errorMessage.match(/ID (.*?) not found/i); // Case-insensitive match
        if (match && match[1]) {
            errorStudentId = match[1].toUpperCase();
        } else {
            // Try extracting from the image if possible (e.g., if ID extraction failed)
            // This part is tricky without knowing the exact imageDataUri format/content
             // For now, keep it simple
        }

        setLastScanResult({
            student: { id: errorStudentId, name:"Unknown Student" },
            log: { type: 'Error', timestamp: new Date() }
        });

    } finally {
        setIsProcessing(false);
        // Do not automatically restart scanner here. User might want to see the result/error.
        // setIsScannerActive(true);
    }
  }, [isProcessing, toast]); // Dependencies


  const handleScanError = useCallback((error: Error) => {
    console.error("Admin Scan: Scanner component error:", error);
    // Display scanner-specific errors if needed, or rely on processDetectedBarcode catch block
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
                    }`}>
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
                    {lastScanResult.log.type !== 'Error' && lastScanResult.student && ( // Only show details on success
                         <CardContent className="text-sm space-y-1">
                             <p><strong>Student:</strong> {lastScanResult.student.name || 'N/A'}</p>
                             <p><strong>ID:</strong> {lastScanResult.student.id?.toUpperCase() || 'N/A'}</p>
                             <p><strong>Branch:</strong> {lastScanResult.student.branch || 'N/A'}</p>
                         </CardContent>
                     )}
                     {lastScanResult.log.type === 'Error' && (
                         <CardContent className="text-sm space-y-1">
                              <p><strong>Attempted ID:</strong> {lastScanResult.student?.id || 'Unknown'}</p>
                              <p className="text-destructive font-medium">{processingError || "An unknown error occurred."}</p>
                         </CardContent>
                     )}
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
