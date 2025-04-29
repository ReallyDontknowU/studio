'use client';

import React, { useState, useEffect, useCallback } from 'react';
import BarcodeScanner from '@/components/barcode-scanner';
import { useToast } from '@/hooks/use-toast';
import type { Student, EntryLog, EntryType } from '@/lib/types';
import { extractBarcodeData } from '@/ai/flows/extract-barcode-data';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, LogIn, LogOut, Info, UserCheck, UserX } from 'lucide-react';
import { MIN_LIBRARY_INTERVAL_SECONDS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

// Helper function to get student data (replace with actual API call)
const getStudentById = (id: string): Student | null => {
  const students: Student[] = JSON.parse(localStorage.getItem('students') || '[]');
  return students.find(s => s.id === id) || null;
};

// Helper function to get last entry/exit log for a student (replace with actual API call)
const getLastLogForStudent = (studentId: string): EntryLog | null => {
  const logs: EntryLog[] = JSON.parse(localStorage.getItem('entryLogs') || '[]');
  const studentLogs = logs.filter(log => log.studentId === studentId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
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
  const [lastScanResult, setLastScanResult] = useState<{ student: Student; log: EntryLog } | null>(null);
  const [isScannerActive, setIsScannerActive] = useState(true); // Keep scanner active

  const handleScanSuccess = async (imageDataUri: string) => {
    if (isProcessing) return; // Prevent concurrent processing

    setIsProcessing(true);
    setProcessingError(null);
    setLastScanResult(null); // Clear previous result display

    try {
        // 1. Extract ID from barcode image
        const extractionResult = await extractBarcodeData({ barcodeImage: imageDataUri });

        if (!extractionResult || !extractionResult.idNumber) {
            throw new Error("Could not extract ID number from the barcode.");
        }

        const studentId = extractionResult.idNumber;

        // 2. Find Student in the database/storage
        const student = getStudentById(studentId);
        if (!student) {
            throw new Error(`Student with ID ${studentId} not found in the system. Please register the student first.`);
        }

        // 3. Determine Entry or Exit
        const lastLog = getLastLogForStudent(studentId);
        let currentAction: EntryType = 'Entry'; // Default to Entry
        const now = new Date();

        if (lastLog) {
            const timeDiffSeconds = (now.getTime() - new Date(lastLog.timestamp).getTime()) / 1000;

            if (timeDiffSeconds < MIN_LIBRARY_INTERVAL_SECONDS) {
                throw new Error(`Please wait at least ${MIN_LIBRARY_INTERVAL_SECONDS} seconds before scanning again.`);
            }

            if (lastLog.type === 'Entry') {
                currentAction = 'Exit';
            } else {
                currentAction = 'Entry';
            }
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

        // 5. Save the Log Entry
        saveEntryLog(newLog);

        // 6. Display Success feedback
         setLastScanResult({ student, log: newLog });
         toast({
            title: `${currentAction} Recorded`,
            description: `${student.name} (${student.id}) recorded as ${currentAction.toLowerCase()} at ${format(now, 'Pp')}.`,
             variant: currentAction === 'Entry' ? 'default' : 'destructive', // Use destructive style for exit? Or keep default?
             icon: currentAction === 'Entry' ? <LogIn className="h-5 w-5 text-green-500" /> : <LogOut className="h-5 w-5 text-red-500" />,
         });

    } catch (error: any) {
      console.error('Error processing scan:', error);
      const errorMessage = error.message || 'An unknown error occurred during processing.';
      setProcessingError(errorMessage);
      toast({
        title: 'Processing Error',
        description: errorMessage,
        variant: 'destructive',
      });
       // Display error specific icons
      if (errorMessage.includes("not found")) {
          setLastScanResult({ student: { id: "Unknown", name:"Unknown Student", branch: "Unknown", rollNo:"-", yearOfStudy:"FY", createdAt: new Date()}, log: {id:"err", studentId:"?", studentName: "?", branch:"?", timestamp: new Date(), type:"Entry"}}); // Dummy structure for display
      }
    } finally {
      setIsProcessing(false);
       // Consider if scanner should pause or restart automatically
       // For continuous scanning, maybe don't deactivate here.
       // setIsScannerActive(false); // Optionally pause scanner after each scan
    }
  };

  // Function to manually reactivate scanner if paused
  const reactivateScanner = () => {
      setIsScannerActive(true);
      setProcessingError(null);
      setLastScanResult(null);
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
                    onScanError={(err) => setProcessingError(`Scanner Error: ${err.message}`)}
                    buttonText="Start Scanning" // Text might not be shown if auto-starts
                    scanPrompt="Scan Student Barcode"
                    disabled={isProcessing} // Disable scanning *button* while processing, video feed handles itself
                 />
             ) : (
                  <Button onClick={reactivateScanner} className="transition-subtle">
                      Start Scanning Again
                  </Button>
             )}


            {isProcessing && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground mt-4">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Processing scan...</span>
                </div>
            )}

             {processingError && !isProcessing && (
                <Alert variant="destructive" className="w-full max-w-md mt-4">
                    <Info className="h-4 w-4" />
                    <AlertTitle>Scan Error</AlertTitle>
                    <AlertDescription>{processingError}</AlertDescription>
                    {/* Optionally add a button to clear error and retry? */}
                     {!isScannerActive && <Button onClick={reactivateScanner} size="sm" variant="outline" className="mt-2">Try Again</Button>}
                </Alert>
             )}

             {/* Display Last Scan Result */}
             {lastScanResult && !isProcessing && (
                 <Card className={`w-full max-w-md mt-4 ${processingError?.includes("not found") ? 'border-destructive bg-destructive/10' : lastScanResult.log.type === 'Entry' ? 'border-green-500 bg-green-500/10' : 'border-red-500 bg-red-500/10'}`}>
                     <CardHeader>
                         <CardTitle className="flex items-center gap-2 text-lg">
                             {processingError?.includes("not found") ?
                                 <><UserX className="text-destructive" /> Unknown Student</> :
                                 lastScanResult.log.type === 'Entry' ?
                                 <><UserCheck className="text-green-600" /> Entry Recorded</> :
                                 <><LogOut className="text-red-600" /> Exit Recorded</>
                              }
                         </CardTitle>
                         <CardDescription>
                            {processingError?.includes("not found") ?
                                `ID "${processingError.match(/ID (.*?) not found/)?.[1] || '?'}" not found.` :
                                `Scan Time: ${format(lastScanResult.log.timestamp, 'Pp')}`
                            }
                         </CardDescription>
                     </CardHeader>
                    {!processingError?.includes("not found") && (
                         <CardContent className="text-sm space-y-1">
                             <p><strong>Student:</strong> {lastScanResult.student.name}</p>
                             <p><strong>ID:</strong> {lastScanResult.student.id}</p>
                             <p><strong>Branch:</strong> {lastScanResult.student.branch}</p>
                         </CardContent>
                     )}
                 </Card>
             )}

          </CardContent>
       </Card>
    </div>
  );
}
