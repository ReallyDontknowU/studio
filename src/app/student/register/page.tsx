'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import BarcodeScanner from '@/components/barcode-scanner';
import StudentForm, { StudentFormData } from '@/components/student-form';
import { useToast } from '@/hooks/use-toast';
import type { Student, ExtractedIdData } from '@/lib/types';
import Image from 'next/image';
import { extractBarcodeData } from '@/ai/flows/extract-barcode-data';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Image as ImageIcon, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function StudentRegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [barcodeImageUri, setBarcodeImageUri] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedIdData | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleScanSuccess = async (imageDataUri: string) => {
    setBarcodeImageUri(imageDataUri);
    setExtractedData(null); // Reset previous data
    setExtractionError(null);
    setIsExtracting(true);
    try {
        // Call the Genkit flow to extract data
        const result = await extractBarcodeData({ barcodeImage: imageDataUri });

        if (result && result.idNumber) {
             setExtractedData({ idNumber: result.idNumber });
             toast({
                title: "Barcode Scanned",
                description: `Extracted ID: ${result.idNumber}. Please verify and complete the form.`,
             });
        } else {
             setExtractionError("Could not extract ID number from the barcode. Please enter manually.");
             toast({
                title: "Extraction Failed",
                description: "Could not extract ID number automatically. Please fill in the form manually.",
                variant: "destructive",
            });
        }
    } catch (error: any) {
      console.error('Error extracting barcode data:', error);
      setExtractionError(`Failed to process barcode: ${error.message || 'Unknown error'}`);
      toast({
        title: 'Extraction Error',
        description: `An error occurred during barcode processing. Please try again or enter manually.`,
        variant: 'destructive',
      });
       // Keep the image displayed so user can see it
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFormSubmit = async (formData: StudentFormData) => {
    setIsSubmitting(true);
    try {
      // ** TODO: Implement actual backend API call to save student data **
      // For now, simulate success
      console.log('Submitting registration data:', { ...formData, barcodeImageUri });

      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay

      const newStudent: Student = {
        ...formData,
        barcodeImageUri: barcodeImageUri || undefined, // Store URI if available
        createdAt: new Date(),
      };

       // Persist student data (e.g., localStorage for demo, or API call)
       const students = JSON.parse(localStorage.getItem('students') || '[]');
       students.push(newStudent);
       localStorage.setItem('students', JSON.stringify(students));
       // Also update the dummy list for login simulation
       const loginIds = JSON.parse(localStorage.getItem('registeredStudentIds') || '["12345", "67890", "11223"]');
       loginIds.push(newStudent.id);
       localStorage.setItem('registeredStudentIds', JSON.stringify(loginIds));


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

  return (
    <div className="container mx-auto px-4 py-8 flex flex-col items-center gap-8">
       <Card className="w-full max-w-md">
          <CardHeader className="text-center">
             <CardTitle className="text-2xl font-bold text-primary">Student Registration</CardTitle>
             <CardDescription>Scan your ID barcode and fill in your details.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">
             <BarcodeScanner
                onScanSuccess={handleScanSuccess}
                onScanError={(err) => console.error("Scanner Error:", err)}
                buttonText="Scan ID Card Barcode"
                scanPrompt="Position barcode inside the frame"
                disabled={isExtracting || isSubmitting}
             />

            {isExtracting && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Extracting ID from image...</span>
                </div>
            )}

             {extractionError && !isExtracting && (
                <Alert variant="destructive">
                    <Info className="h-4 w-4" />
                    <AlertTitle>Extraction Issue</AlertTitle>
                    <AlertDescription>{extractionError}</AlertDescription>
                </Alert>
             )}

             {barcodeImageUri && !isExtracting && (
                <div className="mt-4 p-2 border rounded-md bg-muted w-full max-w-xs">
                   <p className="text-sm font-medium text-center mb-2">Scanned Image:</p>
                   <Image
                      src={barcodeImageUri}
                      alt="Scanned Barcode"
                      width={200}
                      height={100} // Adjust height as needed
                      className="rounded-md mx-auto object-contain"
                   />
                </div>
             )}

             {/* Conditionally render form only after scan or if extraction fails */}
              {(extractedData || extractionError || barcodeImageUri) && !isExtracting && (
                <StudentForm
                    onSubmit={handleFormSubmit}
                    defaultValues={{ id: extractedData?.idNumber }} // Pre-fill ID if extracted
                    isLoading={isSubmitting}
                    submitButtonText="Register"
                    formTitle="" // Title already handled above
                    formDescription="Please verify the extracted ID and complete your information."
                />
              )}
          </CardContent>
       </Card>


    </div>
  );
}
