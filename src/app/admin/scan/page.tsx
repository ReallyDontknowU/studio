
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import BarcodeScanner from '@/components/barcode-scanner';
import { useToast } from '@/hooks/use-toast';
import type { Student, EntryLog, EntryType } from '@/lib/types';
import { extractBarcodeData } from '@/ai/flows/extract-barcode-data';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, LogIn, LogOut, AlertCircle, UserCheck, UserX } from 'lucide-react'; // Updated Icon import
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
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
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
  const [lastScanResult, setLastScanResult] = useState<{ student: Partial<Student>; log: Partial<EntryLog> & { type: EntryType | 'Error' } } | null>(null); // Adjusted type for error display
  const [isScannerActive, setIsScannerActive] = useState(true); // Keep scanner active by default

  const handleScanSuccess = async (imageDataUri: string) => {
    if (isProcessing) return; // Prevent concurrent processing

    setIsProcessing(true);
    setProcessingError(null);
    setLastScanResult(null); // Clear previous result display

    try {
        console.log("Admin Scan: Processing image...");
        // 1. Extract ID from barcode image
        const extractionResult = await extractBarcodeData({ barcodeImage: imageDataUri });
        console.log("Admin Scan: Extraction result:", extractionResult);

        if (!extractionResult || !extractionResult.idNumber) {
            throw new Error("Could not extract ID number from the barcode.");
        }

        const studentId = extractionResult.idNumber.trim(); // Trim whitespace
        console.log(`Admin Scan: Extracted ID: ${studentId}`);


        // 2. Find Student in the database/storage
        const student = getStudentById(studentId);
        console.log(`Admin Scan: Student lookup result for ID ${studentId}:`, student);
        if (!student) {
            throw new Error(`Student with ID ${studentId} not found in the system. Please register the student first.`);
        }

        // 3. Determine Entry or Exit
        const lastLog = getLastLogForStudent(studentId);
        let currentAction: EntryType = 'Entry'; // Default to Entry
        const now = new Date();

        if (lastLog) {
            const timeDiffSeconds = (now.getTime() - new Date(lastLog.timestamp).getTime()) / 1000;
            console.log(`Admin Scan: Last log for ${studentId}:`, lastLog, `Time difference: ${timeDiffSeconds}s`);


            if (timeDiffSeconds < MIN_LIBRARY_INTERVAL_SECONDS) {
                throw new Error(`Please wait at least ${MIN_LIBRARY_INTERVAL_SECONDS} seconds before scanning ${student.name} again.`);
            }

            if (lastLog.type === 'Entry') {
                currentAction = 'Exit';
            } else {
                currentAction = 'Entry';
            }
        } else {
            console.log(`Admin Scan: No previous log found for ${studentId}. Defaulting to Entry.`);
        }


        // 4. Create new Log Entry
        const newLog: EntryLog = {
            id: `log_${Date.now()}_${studentId}`, // Simple unique ID for demo
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
            variant: currentAction === 'Entry' ? 'default' : 'default', // Keep default style for both
            // Use custom icons within description or title if needed, or a generic success icon
         });
         console.log(`Admin Scan: Success - ${student.name} recorded as ${currentAction}.`);


    } catch (error: any) {
      console.error('Admin Scan: Error processing scan:', error);
      const errorMessage = error.message || 'An unknown error occurred during processing.';
      setProcessingError(errorMessage);
      toast({
        title: 'Processing Error',
        description: errorMessage,
        variant: 'destructive',
      });
       // Display error specific info
       let errorStudentId = "Unknown";
       const match = errorMessage.match(/ID (.*?) not found/);
       if (match) {
            errorStudentId = match[1];
       }
       setLastScanResult({
            student: { id: errorStudentId, name:"Unknown Student" },
            log: { type: 'Error', timestamp: new Date() }
       });

    } finally {
      setIsProcessing(false);
       // Keep scanner active unless explicitly stopped or error requires manual intervention
       // setIsScannerActive(false); // Only pause if desired after each scan
    }
  };

  // Function to manually reactivate scanner if needed (e.g., if paused)
  const reactivateScanner = () => {
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

             {isScannerActive ? (
                 <BarcodeScanner
                    onScanSuccess={handleScanSuccess}
                    onScanError={(err) => {
                        console.error("Admin Scan: Scanner component error:", err);
                        // Display scanner-specific errors if needed, or rely on handleScanSuccess catch block
                        setProcessingError(`Scanner Error: ${err.message}. Please ensure camera access is granted.`);
                        // Optionally stop the scanner on component error
                        // setIsScannerActive(false);
                    }}
                    buttonText="Start Scanning" // Text shown before camera starts
                    scanPrompt="Scan Student Barcode"
                    disabled={isProcessing} // Disable capture button while processing
                 />
             ) : (
                  // Button to restart scanner if it was paused/stopped
                  <Button onClick={reactivateScanner} className="transition-subtle">
                      Start Scanning Session
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
                         : 'border-red-500 bg-red-500/10' // Assuming Exit uses red border
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
                            {lastScanResult.log.timestamp ? `Scan Time: ${format(lastScanResult.log.timestamp, 'Pp')}` : processingError}
                         </CardDescription>
                     </CardHeader>
                    {lastScanResult.log.type !== 'Error' && lastScanResult.student && ( // Only show details on success
                         <CardContent className="text-sm space-y-1">
                             <p><strong>Student:</strong> {lastScanResult.student.name || 'N/A'}</p>
                             <p><strong>ID:</strong> {lastScanResult.student.id || 'N/A'}</p>
                             <p><strong>Branch:</strong> {lastScanResult.student.branch || 'N/A'}</p>
                         </CardContent>
                     )}
                     {lastScanResult.log.type === 'Error' && (
                         <CardContent className="text-sm space-y-1">
                              <p><strong>Attempted ID:</strong> {lastScanResult.student?.id || 'Unknown'}</p>
                              <p className="text-destructive">{processingError || "An unknown error occurred."}</p>
                         </CardContent>
                     )}
                 </Card>
             )}
             {/* Separate display for processing errors if not attached to lastScanResult */}
              {processingError && !lastScanResult && !isProcessing && (
                 <Alert variant="destructive" className="w-full max-w-md mt-4">
                     <AlertCircle className="h-4 w-4" />
                     <AlertTitle>Processing Error</AlertTitle>
                     <AlertDescription>{processingError}</AlertDescription>
                     {/* Optionally add a button to clear error and retry? */}
                      {!isScannerActive && <Button onClick={reactivateScanner} size="sm" variant="outline" className="mt-2">Try Again</Button>}
                 </Alert>
              )}


          </CardContent>
       </Card>
    </div>
  );
}
