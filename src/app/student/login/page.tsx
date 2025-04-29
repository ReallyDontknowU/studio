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
import BarcodeScanner from '@/components/barcode-scanner'; // Import scanner component
import { extractBarcodeData } from '@/ai/flows/extract-barcode-data'; // Import AI flow
import type { Student } from '@/lib/types'; // Import Student type

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
  const [isLoading, setIsLoading] = useState(false); // General loading (login attempt)
  const [isProcessingImage, setIsProcessingImage] = useState(false); // Specific loading for scan/upload
  const [mode, setMode] = useState<LoginMode>('manual'); // Default to manual input
  const fileInputRef = useRef<HTMLInputElement>(null);


  const attemptLogin = useCallback((idToLogin: string) => {
    setIsLoading(true);
    setError('');
    const normalizedId = idToLogin?.trim(); // Trim whitespace

    if (!normalizedId) {
        setError('Student ID cannot be empty.');
        setIsLoading(false);
        return;
    }

    // Basic validation (replace with actual authentication logic)
    if (checkStudentExists(normalizedId)) {
      toast({
        title: 'Login Successful',
        description: `Welcome back, Student ${normalizedId}!`,
      });
       // Simulate network request
      setTimeout(() => {
        router.push(`/student/dashboard?id=${normalizedId}`); // Pass ID for demo
        setIsLoading(false);
      }, 1000);
    } else {
       setError(`Student ID "${normalizedId}" not found. Please register if you are new.`);
       setIsLoading(false);
       setMode('manual'); // Keep form visible if login fails
    }
  }, [router, toast]);

   const handleManualLogin = (event: React.FormEvent) => {
        event.preventDefault();
        attemptLogin(studentId);
   };

    const processImageAndLogin = useCallback(async (imageDataUri: string) => {
        setIsProcessingImage(true);
        setError(null);
        try {
            const extractionResult = await extractBarcodeData({ barcodeImage: imageDataUri });

            if (!extractionResult || !extractionResult.idNumber) {
                throw new Error("Could not extract ID number from the image. Please enter manually.");
            }

            const extractedId = extractionResult.idNumber;
            toast({ title: "ID Extracted", description: `Found ID: ${extractedId}. Attempting login...`});
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
             setMode('manual'); // Revert to manual mode on error
        } finally {
            setIsProcessingImage(false);
        }
    }, [toast, attemptLogin]);


    const handleScanSuccess = (imageDataUri: string) => {
        processImageAndLogin(imageDataUri);
    };

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
                    setMode('manual'); // Allow manual entry on error
                }
            };
            reader.onerror = () => {
                setError("Error reading the uploaded file.");
                toast({ title: "File Read Error", description: "An error occurred while reading the file.", variant: "destructive" });
                setMode('manual'); // Allow manual entry on error
            }
            reader.readAsDataURL(file);
        }
        // Reset file input value
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const triggerFileUpload = () => {
        fileInputRef.current?.click();
    };


  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-gradient-to-br from-background to-secondary">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">Student Portal</CardTitle>
          <CardDescription>Login or Register to track your library visits.</CardDescription>
        </CardHeader>

         {/* Content based on mode */}
          {mode === 'manual' && (
             <form onSubmit={handleManualLogin}>
              <CardContent className="space-y-4">
                 {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Login Failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="studentId">Student ID (Barcode Number)</Label>
                  <Input
                    id="studentId"
                    type="text"
                    placeholder="Enter your ID number"
                    value={studentId}
                    onChange={(e) => { setStudentId(e.target.value); setError(''); }} // Clear error on input change
                    required
                    disabled={isLoading || isProcessingImage}
                  />
                </div>
                 <Button type="submit" className="w-full transition-subtle" disabled={isLoading || isProcessingImage || !studentId}>
                  {isLoading ? 'Logging in...' : 'Login Manually'}
                </Button>

                {/* Options to switch mode */}
                 <div className="text-center text-sm text-muted-foreground mt-4 mb-2">Or login using:</div>
                 <div className="flex justify-center items-center gap-4">
                     <Button type="button" variant="outline" size="sm" onClick={() => { setMode('scan'); setError(''); setStudentId('');}} disabled={isLoading || isProcessingImage}>
                         <Camera className="mr-1 h-4 w-4" /> Scan ID
                     </Button>
                     <Button type="button" variant="outline" size="sm" onClick={() => { setMode('upload'); setError(''); setStudentId('');}} disabled={isLoading || isProcessingImage}>
                         <Upload className="mr-1 h-4 w-4" /> Upload ID
                     </Button>
                 </div>

              </CardContent>
             </form>
          )}

           {mode === 'scan' && (
             <CardContent className="flex flex-col items-center gap-4">
                {error && (
                    <Alert variant="destructive" className="w-full">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Scan Error</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                <p className="text-sm text-muted-foreground">Scan your ID barcode to log in.</p>
                <BarcodeScanner
                    onScanSuccess={handleScanSuccess}
                    onScanError={(err) => {
                        setError(`Scanner error: ${err.message}. Please try manual login or register.`);
                        setMode('manual'); // Fallback to manual
                    }}
                    buttonText="Start Camera"
                    scanPrompt="Position barcode inside the frame"
                    disabled={isProcessingImage || isLoading}
                 />
                 {isProcessingImage && (
                     <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                     </div>
                 )}
                  <Button variant="link" onClick={() => { setMode('manual'); setError(''); }} disabled={isProcessingImage || isLoading}>
                      Enter ID Manually Instead
                  </Button>
             </CardContent>
           )}

          {mode === 'upload' && (
             <CardContent className="flex flex-col items-center gap-4">
                 {error && (
                    <Alert variant="destructive" className="w-full">
                        <Info className="h-4 w-4" />
                        <AlertTitle>Upload Issue</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                 )}
                 <p className="text-sm text-muted-foreground">Upload an image of your ID barcode.</p>
                 <Input
                     id="file-upload"
                     type="file"
                     accept="image/*"
                     ref={fileInputRef}
                     onChange={handleFileUpload}
                     className="hidden"
                     disabled={isProcessingImage || isLoading}
                 />
                 <Button onClick={triggerFileUpload} variant="default" className="w-full max-w-xs transition-subtle" disabled={isProcessingImage || isLoading}>
                    {isProcessingImage ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : <><Upload className="mr-2 h-4 w-4" /> Choose Image</>}
                 </Button>

                  <Button variant="link" onClick={() => { setMode('manual'); setError(''); }} disabled={isProcessingImage || isLoading}>
                      Enter ID Manually Instead
                  </Button>
             </CardContent>
           )}


        <CardFooter className="flex flex-col gap-2 pt-4 border-t mt-4">
          <p className="text-sm text-center text-muted-foreground">New student?</p>
          <Link href="/student/register" passHref>
            <Button variant="outline" className="w-full transition-subtle" disabled={isLoading || isProcessingImage}>
              <UserPlus className="mr-2" /> Register Here
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
