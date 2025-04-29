
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
import { Loader2, Image as ImageIcon, Info, Upload, Edit, Camera } from 'lucide-react'; // Added Camera icon
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type RegistrationStep = 'initial' | 'scan' | 'upload' | 'form'; // More descriptive steps

// Function to check if a student ID exists (case-insensitive)
const checkStudentExists = (idToCheck: string): boolean => {
    if (!idToCheck) return false;
    const students: Student[] = JSON.parse(localStorage.getItem('students') || '[]');
    return students.some(student => student.id.toLowerCase() === idToCheck.toLowerCase());
};

export default function StudentRegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [barcodeImageUri, setBarcodeImageUri] = useState<string | null>(null); // URI of the *captured* image
  const [extractedData, setExtractedData] = useState<ExtractedIdData | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false); // For AI extraction
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false); // For form submission
  const [step, setStep] = useState<RegistrationStep>('initial');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processImageAndExtractId = useCallback(async (imageDataUri: string) => {
    setBarcodeImageUri(imageDataUri); // Store the captured image URI
    setExtractedData(null);
    setExtractionError(null);
    setIsProcessingImage(true);
    setStep('form'); // Move to form step to show processing indicator there

    try {
        console.log("Register: Processing image...");
        const result = await extractBarcodeData({ barcodeImage: imageDataUri });
        console.log("Register: Extraction result:", result);

        if (result && result.idNumber) {
             const normalizedId = result.idNumber.trim().toLowerCase();
              // Check if ID already exists BEFORE showing the form prefilled
             if (checkStudentExists(normalizedId)) {
                 setExtractionError(`Student ID ${normalizedId.toUpperCase()} is already registered. Please log in instead.`);
                 toast({ title: "Already Registered", description: `ID ${normalizedId.toUpperCase()} found. Please log in.`, variant: "destructive"});
                 setBarcodeImageUri(null); // Clear image since registration isn't proceeding
                 setStep('initial'); // Go back to start
             } else {
                 setExtractedData({ idNumber: normalizedId }); // Store normalized ID
                 toast({
                    title: "ID Extracted Successfully",
                    description: `Extracted ID: ${normalizedId.toUpperCase()}. Please complete the form.`,
                 });
                 // Stay on 'form' step
             }
        } else {
             setExtractionError("Could not extract ID number automatically. Please enter it manually in the form below.");
             toast({
                title: "Extraction Incomplete",
                description: "Could not extract ID number automatically. Please fill in the form manually.",
                variant: "destructive",
            });
             // Stay on 'form' step, form will be empty
        }
    } catch (error: any) {
        console.error('Error extracting barcode data:', error);
        setExtractionError(`Image processing failed: ${error.message || 'Unknown error'}. Please enter ID manually.`);
        toast({
            title: 'Extraction Error',
            description: `An error occurred during image processing. Please enter details manually.`,
            variant: 'destructive',
        });
        // Stay on 'form' step
    } finally {
        setIsProcessingImage(false);
    }
  }, [toast]);

  // Callback for successful scan from BarcodeScanner component
  const handleScanSuccess = useCallback((imageDataUri: string) => {
    processImageAndExtractId(imageDataUri);
  }, [processImageAndExtractId]);

   // Callback for errors originating within the BarcodeScanner component
   const handleScanError = useCallback((err: Error) => {
      setExtractionError(`Scanner error: ${err.message}. Please try again, upload, or enter manually.`);
      toast({ title: "Scanner Error", description: err.message, variant: "destructive" });
      setStep('initial'); // Go back to initial choice on scanner hardware failure
      setIsProcessingImage(false);
  }, [toast]);


  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          processImageAndExtractId(reader.result);
        } else {
           setExtractionError("Failed to read the uploaded file. Please try again or enter manually.");
           toast({ title: "File Read Error", description: "Could not read the file.", variant: "destructive" });
           setStep('form'); // Go to form to allow manual entry
        }
      };
      reader.onerror = () => {
           setExtractionError("Error reading the uploaded file. Please try again or enter manually.");
           toast({ title: "File Read Error", description: "An error occurred while reading.", variant: "destructive" });
           setStep('form'); // Go to form
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

  const handleFormSubmit = async (formData: StudentFormData) => {
    setIsSubmitting(true);
    try {
      // Use ID from form, which might have been pre-filled or manually entered/corrected.
      // Normalize it (trim, lowercase) for storage and checking.
      const finalStudentId = formData.id?.trim().toLowerCase();

      if (!finalStudentId) {
         toast({ title: "Missing ID", description: "Student ID (Barcode No.) is required.", variant: "destructive"});
         setIsSubmitting(false);
         return;
      }

      // Final check for existence before saving
      if (checkStudentExists(finalStudentId)) {
           toast({ title: "Registration Failed", description: `Student ID ${finalStudentId.toUpperCase()} is already registered. Please log in instead.`, variant: "destructive" });
           setIsSubmitting(false);
           setStep('initial'); // Reset flow
           setBarcodeImageUri(null);
           setExtractedData(null);
           return;
       }


      console.log('Submitting registration data:', { ...formData, id: finalStudentId, barcodeImageUri });

      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay

      const newStudent: Student = {
        ...formData,
        id: finalStudentId, // Use the final, normalized ID
        barcodeImageUri: barcodeImageUri || undefined, // Store captured URI if available
        createdAt: new Date(),
      };

       // Persist student data
       const students: Student[] = JSON.parse(localStorage.getItem('students') || '[]');
       students.push(newStudent);
       localStorage.setItem('students', JSON.stringify(students));

       toast({
        title: 'Registration Successful',
        description: `Welcome, ${formData.name}! You can now log in.`,
      });
      router.push('/student/login'); // Redirect to login after successful registration

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
  const resetFlow = () => {
    setStep('initial');
    setBarcodeImageUri(null);
    setExtractedData(null);
    setExtractionError(null);
    setIsProcessingImage(false);
    setIsSubmitting(false);
  }

  return (
    <div className="container mx-auto px-4 py-8 flex flex-col items-center gap-8">
       <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
             <CardTitle className="text-2xl font-bold text-primary">Student Registration</CardTitle>
             {step === 'initial' && <CardDescription>Choose how to provide your ID barcode number.</CardDescription>}
             {step === 'scan' && <CardDescription>Scan your ID card barcode.</CardDescription>}
             {step === 'upload' && <CardDescription>Upload an image of your ID card barcode.</CardDescription>}
             {step === 'form' && <CardDescription>Complete your registration details.</CardDescription>}
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">

             {/* Step: Initial Choice */}
             {step === 'initial' && (
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                     <Button onClick={() => setStep('scan')} variant="outline" className="transition-subtle">
                        <Camera className="mr-2 h-4 w-4" /> Scan Barcode
                     </Button>
                      <Button onClick={() => setStep('upload')} variant="outline" className="transition-subtle">
                         <Upload className="mr-2 h-4 w-4" /> Upload Image
                     </Button>
                     <Button onClick={() => setStep('form')} variant="outline" className="transition-subtle">
                         <Edit className="mr-2 h-4 w-4" /> Enter Manually
                     </Button>
                 </div>
             )}

             {/* Step: Scan */}
             {step === 'scan' && (
                 <>
                     <BarcodeScanner
                        onScanSuccess={handleScanSuccess} // Will trigger processImageAndExtractId
                        onScanError={handleScanError}
                        buttonText="Start Camera"
                        scanPrompt="Scanning for barcode..."
                        disabled={isProcessingImage || isSubmitting} // Disable while processing/submitting
                     />
                     <Button variant="link" onClick={resetFlow} className="text-sm">Cancel Scan</Button>
                 </>
             )}

             {/* Step: Upload */}
             {step === 'upload' && (
                 <div className="flex flex-col items-center gap-4 w-full">
                    <Label htmlFor="file-upload" className="sr-only">Upload ID Card Image</Label>
                    <Input
                        id="file-upload"
                        type="file"
                        accept="image/*"
                        ref={fileInputRef}
                        onChange={handleFileUpload} // Will trigger processImageAndExtractId
                        className="hidden"
                        disabled={isProcessingImage || isSubmitting}
                    />
                    <Button onClick={triggerFileUpload} variant="default" className="w-full max-w-xs transition-subtle" disabled={isProcessingImage || isSubmitting}>
                        <Upload className="mr-2 h-4 w-4" /> Choose Image to Upload
                    </Button>
                     <p className="text-xs text-muted-foreground">Upload an image containing the barcode.</p>
                    <Button variant="link" onClick={resetFlow} className="text-sm">Cancel Upload</Button>
                 </div>
             )}

             {/* Step: Form (Shown after scan/upload/manual choice, or directly) */}
              {step === 'form' && (
                 <div className="w-full space-y-4">
                    {/* Loading/Processing Indicator */}
                     {isProcessingImage && (
                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span>Processing image...</span>
                        </div>
                     )}

                     {/* Extraction Error Display */}
                     {extractionError && !isProcessingImage && (
                        <Alert variant="destructive" className="w-full">
                            <Info className="h-4 w-4" />
                            <AlertTitle>Attention</AlertTitle>
                            <AlertDescription>{extractionError}</AlertDescription>
                        </Alert>
                     )}

                     {/* Display Captured Image */}
                     {barcodeImageUri && !isProcessingImage && (
                        <div className="mt-4 p-2 border rounded-md bg-muted w-full max-w-xs mx-auto">
                           <p className="text-sm font-medium text-center mb-2">Provided Image:</p>
                           <Image
                              src={barcodeImageUri}
                              alt="Scanned or Uploaded Barcode/ID"
                              width={200}
                              height={100}
                              className="rounded-md mx-auto object-contain"
                           />
                        </div>
                     )}

                     {/* The Form itself */}
                     {!isProcessingImage && (
                         <StudentForm
                            onSubmit={handleFormSubmit}
                            // Pre-fill ID if extracted, ensuring it's normalized (lowercase)
                            defaultValues={{ id: extractedData?.idNumber || '' }}
                            // ID field is always editable for manual entry or correction
                            isLoading={isSubmitting} // Disable form during submission
                            submitButtonText="Register"
                            formTitle="" // Handled by CardHeader
                            formDescription={
                                extractedData?.idNumber
                                ? "Please verify the extracted ID and complete your information."
                                : "Please fill in all your details."
                             }
                        />
                     )}

                      <Button variant="link" onClick={resetFlow} className="text-sm w-full" disabled={isProcessingImage || isSubmitting}>
                         Go Back / Cancel Registration
                      </Button>
                 </div>
              )}
          </CardContent>
       </Card>
    </div>
  );
}
