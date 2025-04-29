'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import BarcodeScanner from '@/components/barcode-scanner';
import StudentForm, { StudentFormData } from '@/components/student-form';
import { useToast } from '@/hooks/use-toast';
import type { Student, ExtractedIdData } from '@/lib/types';
import Image from 'next/image';
import { extractBarcodeData } from '@/ai/flows/extract-barcode-data';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Image as ImageIcon, Info, Upload, Edit } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type RegistrationMode = 'scan' | 'upload' | 'manual' | null;

export default function StudentRegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [barcodeImageUri, setBarcodeImageUri] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedIdData | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false); // For scan/upload processing
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<RegistrationMode>(null); // To control UI flow
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processImageAndExtractId = useCallback(async (imageDataUri: string) => {
    setBarcodeImageUri(imageDataUri);
    setExtractedData(null); // Reset previous data
    setExtractionError(null);
    setIsProcessingImage(true);
    try {
        // Call the Genkit flow to extract data
        const result = await extractBarcodeData({ barcodeImage: imageDataUri });

        if (result && result.idNumber) {
             setExtractedData({ idNumber: result.idNumber });
             toast({
                title: "ID Extracted Successfully",
                description: `Extracted ID: ${result.idNumber}. Please complete the form.`,
             });
        } else {
             setExtractionError("Could not extract ID number automatically. Please enter it manually.");
             toast({
                title: "Extraction Incomplete",
                description: "Could not extract ID number automatically. Please fill in the form manually.",
                variant: "destructive",
            });
        }
    } catch (error: any) {
      console.error('Error extracting barcode data:', error);
      setExtractionError(`Failed to process image: ${error.message || 'Unknown error'}. Please enter ID manually.`);
      toast({
        title: 'Extraction Error',
        description: `An error occurred during image processing. Please try again or enter manually.`,
        variant: 'destructive',
      });
    } finally {
      setIsProcessingImage(false);
      setMode('manual'); // Switch to manual mode to show the form regardless of success/failure
    }
  }, [toast]);

  const handleScanSuccess = (imageDataUri: string) => {
    processImageAndExtractId(imageDataUri);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          processImageAndExtractId(reader.result);
        } else {
           setExtractionError("Failed to read the uploaded file.");
           toast({ title: "File Read Error", description: "Could not read the uploaded file.", variant: "destructive" });
           setMode('manual'); // Allow manual entry on error
        }
      };
      reader.onerror = () => {
           setExtractionError("Error reading the uploaded file.");
           toast({ title: "File Read Error", description: "An error occurred while reading the file.", variant: "destructive" });
           setMode('manual'); // Allow manual entry on error
      }
      reader.readAsDataURL(file);
    }
     // Reset file input value to allow uploading the same file again if needed
     if (fileInputRef.current) {
        fileInputRef.current.value = "";
     }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };


  const handleFormSubmit = async (formData: StudentFormData) => {
    setIsSubmitting(true);
    try {
      // Basic check: Ensure ID is present either from extraction or manual input
      if (!formData.id && !extractedData?.idNumber) {
         toast({ title: "Missing ID", description: "Student ID is required.", variant: "destructive"});
         setIsSubmitting(false);
         return;
      }

      // Use extracted ID if form ID is empty (e.g., if field was disabled after successful scan)
      const finalStudentId = formData.id || extractedData?.idNumber;
      if (!finalStudentId) {
         toast({ title: "Missing ID", description: "Could not determine Student ID.", variant: "destructive"});
         setIsSubmitting(false);
         return;
      }


      console.log('Submitting registration data:', { ...formData, id: finalStudentId, barcodeImageUri });

      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay

      const newStudent: Student = {
        ...formData,
        id: finalStudentId, // Ensure the final ID is used
        barcodeImageUri: barcodeImageUri || undefined, // Store URI if available
        createdAt: new Date(),
      };

       // Persist student data (e.g., localStorage for demo, or API call)
       const students = JSON.parse(localStorage.getItem('students') || '[]');
       // Check if ID already exists
       if (students.some((s: Student) => s.id === newStudent.id)) {
           toast({ title: "Registration Failed", description: `Student ID ${newStudent.id} is already registered.`, variant: "destructive" });
           setIsSubmitting(false);
           return;
       }

       students.push(newStudent);
       localStorage.setItem('students', JSON.stringify(students));
       // Also update the dummy list for login simulation
       const loginIds = JSON.parse(localStorage.getItem('registeredStudentIds') || '[]');
       if (!loginIds.includes(newStudent.id)) {
            loginIds.push(newStudent.id);
            localStorage.setItem('registeredStudentIds', JSON.stringify(loginIds));
       }


      toast({
        title: 'Registration Successful',
        description: `Welcome, ${formData.name}! You can now log in.`,
      });
      router.push('/student/login');

    } catch (error: any) {
      console.error('Error submitting registration:', error);
      toast({
        title: 'Registration Failed',
        description: `Could not save your details: ${error.message || 'Please try again.'}`,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset state and go back to mode selection
  const resetMode = () => {
    setMode(null);
    setBarcodeImageUri(null);
    setExtractedData(null);
    setExtractionError(null);
    setIsProcessingImage(false);
  }

  return (
    <div className="container mx-auto px-4 py-8 flex flex-col items-center gap-8">
       <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
             <CardTitle className="text-2xl font-bold text-primary">Student Registration</CardTitle>
             {!mode && <CardDescription>Choose how to provide your ID barcode number.</CardDescription>}
             {mode === 'scan' && <CardDescription>Scan your ID card barcode.</CardDescription>}
             {mode === 'upload' && <CardDescription>Upload an image of your ID card barcode.</CardDescription>}
             {mode === 'manual' && <CardDescription>Enter your details manually.</CardDescription>}
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">

             {/* Mode Selection */}
             {!mode && (
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                     <Button onClick={() => setMode('scan')} variant="outline" className="transition-subtle">
                        <ImageIcon className="mr-2 h-4 w-4" /> Scan Barcode
                     </Button>
                      <Button onClick={() => setMode('upload')} variant="outline" className="transition-subtle">
                         <Upload className="mr-2 h-4 w-4" /> Upload Image
                     </Button>
                     <Button onClick={() => setMode('manual')} variant="outline" className="transition-subtle">
                         <Edit className="mr-2 h-4 w-4" /> Enter Manually
                     </Button>
                 </div>
             )}

             {/* Scanner Mode */}
             {mode === 'scan' && (
                 <>
                     <BarcodeScanner
                        onScanSuccess={handleScanSuccess}
                        onScanError={(err) => {
                            setExtractionError(`Scanner error: ${err.message}. Please try again or enter manually.`);
                            setMode('manual'); // Fallback to manual on error
                        }}
                        buttonText="Start Camera"
                        scanPrompt="Position barcode inside the frame"
                        disabled={isProcessingImage || isSubmitting}
                     />
                     <Button variant="link" onClick={resetMode} className="text-sm">Cancel Scan</Button>
                 </>
             )}

             {/* Upload Mode */}
             {mode === 'upload' && (
                 <div className="flex flex-col items-center gap-4 w-full">
                    <Label htmlFor="file-upload" className="sr-only">Upload ID Card Image</Label>
                    <Input
                        id="file-upload"
                        type="file"
                        accept="image/*"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                        disabled={isProcessingImage || isSubmitting}
                    />
                    <Button onClick={triggerFileUpload} variant="default" className="w-full max-w-xs transition-subtle" disabled={isProcessingImage || isSubmitting}>
                        <Upload className="mr-2 h-4 w-4" /> Choose Image to Upload
                    </Button>
                     <p className="text-xs text-muted-foreground">Upload an image containing the barcode.</p>
                    <Button variant="link" onClick={resetMode} className="text-sm">Cancel Upload</Button>
                 </div>
             )}


             {/* Loading/Processing Indicator */}
             {isProcessingImage && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground mt-4">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Processing image...</span>
                </div>
             )}

             {/* Extraction Error Display (relevant when mode becomes 'manual' after failure) */}
             {mode === 'manual' && extractionError && !isProcessingImage && (
                <Alert variant="destructive" className="w-full">
                    <Info className="h-4 w-4" />
                    <AlertTitle>Extraction Issue</AlertTitle>
                    <AlertDescription>{extractionError}</AlertDescription>
                </Alert>
             )}

              {/* Display Scanned/Uploaded Image */}
             {mode === 'manual' && barcodeImageUri && !isProcessingImage && (
                <div className="mt-4 p-2 border rounded-md bg-muted w-full max-w-xs">
                   <p className="text-sm font-medium text-center mb-2">Provided Image:</p>
                   <Image
                      src={barcodeImageUri}
                      alt="Scanned or Uploaded Barcode/ID"
                      width={200}
                      height={100} // Adjust height as needed
                      className="rounded-md mx-auto object-contain"
                   />
                </div>
             )}

             {/* Manual Form Mode */}
              {mode === 'manual' && !isProcessingImage && (
                 <>
                    <StudentForm
                        onSubmit={handleFormSubmit}
                        // Pre-fill ID if extracted, otherwise allow manual input
                        defaultValues={{ id: extractedData?.idNumber || '' }}
                        // Disable ID field only if successfully extracted? Or always editable? Let's keep editable.
                        // Tweak StudentForm if needed to handle disabled state based on prop
                        isLoading={isSubmitting}
                        submitButtonText="Register"
                        formTitle="" // Title already handled above
                        formDescription={extractedData?.idNumber ? "Please verify the extracted ID and complete your information." : "Please fill in all your details."}
                    />
                    <Button variant="link" onClick={resetMode} className="text-sm mt-2">Go Back</Button>
                 </>
              )}
          </CardContent>
       </Card>
    </div>
  );
}
