'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import BarcodeScanner from '@/components/barcode-scanner';
import StudentForm, { StudentFormData } from '@/components/student-form';
import { useToast } from '@/hooks/use-toast';
import type { Student, ExtractedIdData, YearOfStudy, Branch } from '@/lib/types';
import { BRANCHES, YEARS_OF_STUDY } from '@/lib/constants';
import Image from 'next/image';
import { adminExtractBarcodeData } from '@/ai/flows/admin-extract-barcode-data';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Image as ImageIcon, Info, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

// Helper to map string year to enum type
const mapYearOfStudy = (yearStr?: string): YearOfStudy | undefined => {
  if (!yearStr) return undefined;
  const upperYear = yearStr.toUpperCase();
  if (YEARS_OF_STUDY.includes(upperYear as YearOfStudy)) {
    return upperYear as YearOfStudy;
  }
  // Basic fuzzy matching (can be expanded)
  if (upperYear.includes('FIRST') || upperYear.includes('FY')) return 'FY';
  if (upperYear.includes('SECOND') || upperYear.includes('SY')) return 'SY';
  if (upperYear.includes('THIRD') || upperYear.includes('TY')) return 'TY';
  return undefined; // Return undefined if no match
};

// Helper to map string branch (simple check for now)
const mapBranch = (branchStr?: string): Branch | undefined => {
   if (!branchStr) return undefined;
   // Case-insensitive check against existing branches
   const knownBranch = BRANCHES.find(b => b.toLowerCase() === branchStr.toLowerCase());
   return knownBranch || branchStr; // Return known branch or the original string if not found
}

export default function AdminAddStudentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedIdData | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const processImage = useCallback(async (imageDataUri: string) => {
    setCapturedImageUri(imageDataUri);
    setExtractedData(null); // Reset previous data
    setExtractionError(null);
    setIsExtracting(true);
    try {
        // Call the ADMIN Genkit flow
        const result = await adminExtractBarcodeData({ photoDataUri: imageDataUri });

        if (result && result.studentId) {
             const mappedData: ExtractedIdData = {
                 idNumber: result.studentId,
                 studentName: result.studentName,
                 branch: mapBranch(result.branch), // Use helper
                 rollNo: result.rollNo,
                 yearOfStudy: mapYearOfStudy(result.yearOfStudy) // Use helper
             };
             setExtractedData(mappedData);
             toast({
                title: "ID Card Processed",
                description: `Extracted data for ID: ${result.studentId}. Please verify and complete the form.`,
             });
        } else {
             setExtractionError("Could not extract required ID number from the image. Please check the image or enter manually.");
             toast({
                title: "Extraction Incomplete",
                description: "Could not extract the student ID number automatically. Please fill in the form manually.",
                variant: "destructive",
            });
        }
    } catch (error: any) {
      console.error('Error extracting ID card data:', error);
      setExtractionError(`Failed to process image: ${error.message || 'Unknown error'}`);
      toast({
        title: 'Extraction Error',
        description: `An error occurred during image processing. Please try again or enter manually.`,
        variant: 'destructive',
      });
    } finally {
      setIsExtracting(false);
    }
  }, [toast]);


  const handleScanSuccess = (imageDataUri: string) => {
    processImage(imageDataUri);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          processImage(reader.result);
        } else {
           setExtractionError("Failed to read the uploaded file.");
           toast({ title: "File Read Error", description: "Could not read the uploaded file.", variant: "destructive" });
        }
      };
      reader.onerror = () => {
           setExtractionError("Error reading the uploaded file.");
           toast({ title: "File Read Error", description: "An error occurred while reading the file.", variant: "destructive" });
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
      // ** TODO: Implement actual backend API call to save student data **
      console.log('Admin submitting registration data:', { ...formData, barcodeImageUri: capturedImageUri });

      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay

      const newStudent: Student = {
        ...formData,
        barcodeImageUri: capturedImageUri || undefined,
        createdAt: new Date(),
      };

      // Persist student data (e.g., localStorage for demo, or API call)
       const students = JSON.parse(localStorage.getItem('students') || '[]');
       students.push(newStudent);
       localStorage.setItem('students', JSON.stringify(students));

      toast({
        title: 'Student Added Successfully',
        description: `${formData.name} has been added to the system.`,
      });
       // Clear form state or redirect
       setCapturedImageUri(null);
       setExtractedData(null);
       // Consider redirecting back to dashboard or student list: router.push('/admin/dashboard');

    } catch (error: any) {
      console.error('Error submitting student data:', error);
      toast({
        title: 'Submission Failed',
        description: `Could not save student details: ${error.message || 'Please try again.'}`,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

   // Derive default values for the form based on extracted data
   const formDefaultValues: Partial<StudentFormData> = {
      id: extractedData?.idNumber || '',
      name: extractedData?.studentName || '',
      branch: extractedData?.branch || '',
      rollNo: extractedData?.rollNo || '',
      yearOfStudy: extractedData?.yearOfStudy as YearOfStudy | undefined // Cast needed here
   };


  return (
    <div className="container mx-auto px-4 py-8 flex flex-col items-center gap-8">
       <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
             <CardTitle className="text-2xl font-bold text-primary">Add New Student</CardTitle>
             <CardDescription>Scan or upload ID card, verify details, and save.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">

            <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
                 <BarcodeScanner
                    onScanSuccess={handleScanSuccess}
                    onScanError={(err) => console.error("Scanner Error:", err)}
                    buttonText="Scan ID Card"
                    scanPrompt="Position ID card inside the frame"
                    disabled={isExtracting || isSubmitting}
                 />

                {/* File Upload Section */}
                <div className="flex flex-col items-center gap-2">
                     <Label htmlFor="file-upload" className="sr-only">Upload ID Card Image</Label>
                     <Input
                         id="file-upload"
                         type="file"
                         accept="image/*"
                         ref={fileInputRef}
                         onChange={handleFileUpload}
                         className="hidden"
                         disabled={isExtracting || isSubmitting}
                     />
                     <Button onClick={triggerFileUpload} variant="outline" disabled={isExtracting || isSubmitting}>
                         <Upload className="mr-2 h-4 w-4" /> Upload Image
                     </Button>
                     <p className="text-xs text-muted-foreground">Or upload an image file</p>
                </div>

            </div>


            {isExtracting && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground mt-4">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Processing image...</span>
                </div>
            )}

             {extractionError && !isExtracting && (
                <Alert variant="destructive" className="w-full max-w-lg mt-4">
                    <Info className="h-4 w-4" />
                    <AlertTitle>Extraction Issue</AlertTitle>
                    <AlertDescription>{extractionError}</AlertDescription>
                </Alert>
             )}

             {capturedImageUri && !isExtracting && (
                <div className="mt-4 p-2 border rounded-md bg-muted w-full max-w-sm">
                   <p className="text-sm font-medium text-center mb-2">Processed Image:</p>
                   <Image
                      src={capturedImageUri}
                      alt="Scanned or Uploaded ID Card"
                      width={300}
                      height={180} // Adjust height for ID card aspect ratio
                      className="rounded-md mx-auto object-contain"
                   />
                </div>
             )}

              {/* Conditionally render form */}
              {(extractedData || extractionError || capturedImageUri) && !isExtracting && (
                <div className="w-full mt-6">
                 <StudentForm
                    onSubmit={handleFormSubmit}
                    defaultValues={formDefaultValues} // Use derived defaults
                    isLoading={isSubmitting}
                    submitButtonText="Add Student"
                    formTitle=""
                    formDescription="Verify extracted information and complete any missing fields."
                 />
                </div>
              )}
          </CardContent>
       </Card>
    </div>
  );
}
