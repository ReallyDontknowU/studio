
'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, UserPlus, Camera, Upload, Loader2, Info } from 'lucide-react';
import BarcodeScanner from '@/components/barcode-scanner'; // Import updated scanner component
import { extractBarcodeData } from '@/ai/flows/extract-barcode-data';
import type { Student } from '@/lib/types';

type LoginMode = 'manual' | 'scan' | 'upload';

// Function to check if a student ID exists in the main students list
const checkStudentExists = (idToCheck: string): boolean => {
    if (!idToCheck) return false;
    const students: Student[] = JSON.parse(localStorage.getItem('students') || '[]');
    return students.some(student => student.id.toLowerCase() === idToCheck.toLowerCase());
};

export default function StudentLoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false); // General loading (login attempt/AI processing)
  const [isProcessingImage, setIsProcessingImage] = useState(false); // Specific loading for scan/upload visual feedback
  const [mode, setMode] = useState<LoginMode>('manual');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const attemptLogin = useCallback((idToLogin: string) => {
    setIsLoading(true); // Start loading for the login check itself
    setError('');
    const normalizedId = idToLogin?.trim().toLowerCase();

    if (!normalizedId) {
        setError('Student ID cannot be empty.');
        setIsLoading(false);
        return;
    }

    // Simulate backend check
    setTimeout(() => {
        if (checkStudentExists(normalizedId)) {
            toast({
                title: 'Login Successful',
                description: `Welcome back, Student ${normalizedId.toUpperCase()}! Redirecting...`,
            });
            router.push(`/student/dashboard?id=${normalizedId}`);
            // No need to set loading false here, navigation will occur
        } else {
            setError(`Student ID "${normalizedId.toUpperCase()}" not found. Please register if you are new.`);
            setIsLoading(false); // Stop loading on failure
            setMode('manual'); // Revert to manual input if login fails
        }
    }, 500); // Simulate network delay for login check
  }, [router, toast]);

  const processImageAndLogin = useCallback(async (imageDataUri: string) => {
    setIsProcessingImage(true); // Indicate visual processing state
    setIsLoading(true); // Also set general loading for AI call + login attempt
    setError('');
    setMode('manual'); // Switch view back to manual while processing (shows loader/error better)

    try {
        console.log("Student Login: Processing image...");
        const extractionResult = await extractBarcodeData({ barcodeImage: imageDataUri });
        console.log("Student Login: Extraction result:", extractionResult);


        if (!extractionResult || !extractionResult.idNumber) {
            throw new Error("Could not extract ID number from the image. Please enter manually.");
        }

        const extractedId = extractionResult.idNumber.trim();
        toast({ title: "ID Extracted", description: `Found ID: ${extractedId.toUpperCase()}. Attempting login...`});

        // Now attempt login with the extracted ID
        attemptLogin(extractedId);

    } catch (error: any) {
        console.error('Error processing image for login:', error);
        const errorMessage = error.message || 'An unknown error occurred during image processing.';
        setError(errorMessage + " Please try manual login or register.");
        toast({
            title: 'Image Processing Error',
            description: errorMessage,
            variant: 'destructive',
        });
        setIsLoading(false); // Stop loading on error
    } finally {
        setIsProcessingImage(false); // Stop visual processing indicator
        // Loading state (isLoading) is handled by attemptLogin on success/failure
    }
  }, [toast, attemptLogin]);

  // Callback for successful scan from BarcodeScanner component
  const handleScanSuccess = useCallback((imageDataUri: string) => {
    processImageAndLogin(imageDataUri);
  }, [processImageAndLogin]);

  // Callback for errors originating within the BarcodeScanner component
  const handleScanError = useCallback((err: Error) => {
      setError(`Scanner error: ${err.message}. Please try manual login or upload.`);
      toast({ title: "Scanner Error", description: err.message, variant: "destructive" });
      setMode('manual'); // Fallback to manual mode
      setIsLoading(false);
      setIsProcessingImage(false);
  }, [toast]);


  // File Upload Handling remains the same
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              if (typeof reader.result === 'string') {
                  processImageAndLogin(reader.result);
              } else {
                  setError("Failed to read the uploaded file.");
                  toast({ title: "File Read Error", description: "Could not read the uploaded file.", variant: "destructive" });
                  setMode('manual');
              }
          };
          reader.onerror = () => {
              setError("Error reading the uploaded file.");
              toast({ title: "File Read Error", description: "An error occurred while reading the file.", variant: "destructive" });
              setMode('manual');
          }
          reader.readAsDataURL(file);
      }
      if (fileInputRef.current) {
          fileInputRef.current.value = "";
      }
  };

  const triggerFileUpload = () => {
      fileInputRef.current?.click();
  };

  // Manual Login Form Submission
   const handleManualLogin = (event: React.FormEvent) => {
        event.preventDefault();
        attemptLogin(studentId);
   };


  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-gradient-to-br from-background to-secondary">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">Student Portal</CardTitle>
          <CardDescription>Login or Register to track your library visits.</CardDescription>
        </CardHeader>

         {/* Always show manual form container, but content changes */}
          <CardContent className="space-y-4">
             {/* Error Display Area */}
             {error && (
                 <Alert variant="destructive">
                     <AlertCircle className="h-4 w-4" />
                     <AlertTitle>Error</AlertTitle>
                     <AlertDescription>{error}</AlertDescription>
                 </Alert>
             )}

             {/* Loading Indicator */}
              {isLoading && (
                 <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>{isProcessingImage ? 'Processing image...' : 'Attempting login...'}</span>
                 </div>
              )}


            {/* Mode-Specific Content */}
            {!isLoading && (
                 <>
                     {mode === 'manual' && (
                         <form onSubmit={handleManualLogin} className="space-y-4">
                             <div className="space-y-2">
                                 <Label htmlFor="studentId">Student ID (Barcode Number)</Label>
                                 <Input
                                     id="studentId"
                                     type="text"
                                     placeholder="Enter your ID number"
                                     value={studentId}
                                     onChange={(e) => { setStudentId(e.target.value); setError(''); }}
                                     required
                                     disabled={isLoading}
                                 />
                             </div>
                             <Button type="submit" className="w-full transition-subtle" disabled={isLoading || !studentId}>
                                 Login Manually
                             </Button>
                             {/* Options to switch mode */}
                             <div className="text-center text-sm text-muted-foreground mt-4 mb-2">Or login using:</div>
                             <div className="flex justify-center items-center gap-4">
                                 <Button type="button" variant="outline" size="sm" onClick={() => { setMode('scan'); setError(''); setStudentId('');}} disabled={isLoading}>
                                     <Camera className="mr-1 h-4 w-4" /> Scan ID
                                 </Button>
                                 <Button type="button" variant="outline" size="sm" onClick={() => { setMode('upload'); setError(''); setStudentId('');}} disabled={isLoading}>
                                     <Upload className="mr-1 h-4 w-4" /> Upload ID
                                 </Button>
                             </div>
                         </form>
                     )}

                     {mode === 'scan' && (
                         <div className="flex flex-col items-center gap-4">
                             <p className="text-sm text-muted-foreground">Scan your ID barcode to log in.</p>
                             <BarcodeScanner
                                 onScanSuccess={handleScanSuccess}
                                 onScanError={handleScanError}
                                 buttonText="Start Camera" // Button text before activating
                                 scanPrompt="Scanning for barcode..."
                                 disabled={isLoading} // Disable if already processing/loading
                             />
                             <Button variant="link" onClick={() => { setMode('manual'); setError(''); }} disabled={isLoading}>
                                 Cancel Scan & Enter Manually
                             </Button>
                         </div>
                     )}

                     {mode === 'upload' && (
                         <div className="flex flex-col items-center gap-4">
                             <p className="text-sm text-muted-foreground">Upload an image of your ID barcode.</p>
                             <Input
                                 id="file-upload"
                                 type="file"
                                 accept="image/*"
                                 ref={fileInputRef}
                                 onChange={handleFileUpload}
                                 className="hidden"
                                 disabled={isLoading}
                             />
                             <Button onClick={triggerFileUpload} variant="default" className="w-full max-w-xs transition-subtle" disabled={isLoading}>
                                 <Upload className="mr-2 h-4 w-4" /> Choose Image
                             </Button>
                             <Button variant="link" onClick={() => { setMode('manual'); setError(''); }} disabled={isLoading}>
                                 Cancel Upload & Enter Manually
                             </Button>
                         </div>
                     )}
                 </>
            )}
          </CardContent>

          {/* Footer for Registration Link */}
          {!isLoading && ( // Hide footer during loading states
            <CardFooter className="flex flex-col gap-2 pt-4 border-t mt-4">
                <p className="text-sm text-center text-muted-foreground">New student?</p>
                <Link href="/student/register" passHref>
                    <Button variant="outline" className="w-full transition-subtle" disabled={isLoading}>
                        <UserPlus className="mr-2" /> Register Here
                    </Button>
                </Link>
            </CardFooter>
          )}
      </Card>
    </div>
  );
}
