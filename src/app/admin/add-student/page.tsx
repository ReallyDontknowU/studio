'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import type { Student, ExtractedIdData, YearOfStudy, Branch } from '@/lib/types';
import { BRANCHES, YEARS_OF_STUDY } from '@/lib/constants';
import { adminExtractBarcodeData } from '@/ai/flows/admin-extract-barcode-data'; // Corrected import path based on error, assuming it's correct now.

// UI Components
import BarcodeScanner from '@/components/barcode-scanner';
import StudentForm, { StudentFormData } from '@/components/student-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Icons
import { Loader2, Upload, Info, Camera } from 'lucide-react'; // Removed ScanLine, ImageIcon

// Helper to map string year to enum type
const mapYearOfStudy = (yearStr?: string): YearOfStudy | undefined => {
  if (!yearStr) return undefined;
  const upperYear = yearStr.toUpperCase().replace(/[^A-Z0-9]/g, ''); // Sanitize input
  if (YEARS_OF_STUDY.includes(upperYear as YearOfStudy)) {
    return upperYear as YearOfStudy;
  }
  // Basic fuzzy matching
  if (upperYear.includes('FIRST') || upperYear.includes('FY') || upperYear === '1') return 'FY';
  if (upperYear.includes('SECOND') || upperYear.includes('SY') || upperYear === '2') return 'SY';
  if (upperYear.includes('THIRD') || upperYear.includes('TY') || upperYear === '3') return 'TY';
  return undefined;
};

// Helper to map string branch (case-insensitive check)
const mapBranch = (branchStr?: string): Branch | undefined => {
   if (!branchStr) return undefined;
   const lowerBranchStr = branchStr.trim().toLowerCase();
   const knownBranch = BRANCHES.find(b => b.toLowerCase() === lowerBranchStr);
   return knownBranch || branchStr.trim(); // Return known branch or the trimmed original string if not found
}

// Main Component
export default function AdminAddStudentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedIdData | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('scan'); // 'scan', 'upload', 'manual'
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form instance using react-hook-form could be added here if needed for manual input
  // const form = useForm<StudentFormData>(...);

   // Derive default values for the form based on extracted data or manual input
   const formDefaultValues: Partial<StudentFormData> = {
      id: extractedData?.idNumber || '',
      name: extractedData?.studentName || '',
      branch: extractedData?.branch || '',
      rollNo: extractedData?.rollNo || '',
      yearOfStudy: extractedData?.yearOfStudy as YearOfStudy | undefined // Cast needed here
   };

  // Reset state when switching tabs
  const handleTabChange = (value: string) => {
      setActiveTab(value);
      setCapturedImageUri(null);
      setExtractedData(null);
      setExtractionError(null);
      setIsExtracting(false);
      // Reset form if managing manually
      // form.reset(formDefaultValues); // Reset form to defaults when tab changes
  };


  const processImage = useCallback(async (imageDataUri: string) => {
    setCapturedImageUri(imageDataUri);
    setExtractedData(null);
    setExtractionError(null);
    setIsExtracting(true);
    setActiveTab('manual'); // Switch to manual tab to show form after processing

    try {
        console.log("Calling adminExtractBarcodeData with image URI (first 50 chars):", imageDataUri.substring(0, 50));
        const result = await adminExtractBarcodeData({ photoDataUri: imageDataUri });
        console.log("adminExtractBarcodeData raw result:", result);

        if (result && result.studentId) {
             const mappedData: ExtractedIdData = {
                 idNumber: result.studentId,
                 studentName: result.studentName,
                 branch: mapBranch(result.branch), // Use helper
                 rollNo: result.rollNo,
                 yearOfStudy: mapYearOfStudy(result.yearOfStudy) // Use helper
             };
             console.log("Mapped Extracted Data:", mappedData);
             setExtractedData(mappedData);
             toast({
                title: "ID Card Processed",
                description: `Extracted data. Please verify and complete the form.`,
             });
        } else {
             // Even if studentId is empty, allow manual entry
             console.log("Extraction result missing studentId, proceeding to manual entry.");
             setExtractedData({}); // Set empty object to trigger form display
             setExtractionError("Could not extract student ID automatically. Please fill in the form manually.");
             toast({
                title: "Extraction Incomplete",
                description: "Could not extract details automatically. Please fill in the form manually.",
                variant: "destructive",
            });
        }
    } catch (error: any) {
      console.error('Error extracting ID card data:', error);
      const errorMessage = error.message || 'Unknown error during extraction';
      setExtractionError(`Failed to process image: ${errorMessage}`);
      setExtractedData({}); // Set empty object to trigger form display even on error
      toast({
        title: 'Extraction Error',
        description: `An error occurred: ${errorMessage}. Please enter manually.`,
        variant: 'destructive',
      });
    } finally {
      setIsExtracting(false);
    }
  }, [toast]);


  const handleScanSuccess = (imageDataUri: string) => {
    console.log("Scan Success - received image data.");
    processImage(imageDataUri);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          console.log("File Read Success - processing image.");
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
      // Check if student ID already exists
       const students: Student[] = JSON.parse(localStorage.getItem('students') || '[]');
       const existingStudent = students.find(s => s.id.toLowerCase() === formData.id.toLowerCase());
       if (existingStudent) {
           toast({
               title: 'Student Already Exists',
               description: `Student with ID ${formData.id.toUpperCase()} is already registered.`,
               variant: 'destructive',
           });
           setIsSubmitting(false);
           return; // Stop submission
       }


      console.log('Admin submitting registration data:', { ...formData, barcodeImageUri: capturedImageUri });

      // Simulate network delay (REMOVE IN PRODUCTION)
      // await new Promise(resolve => setTimeout(resolve, 1000));

      const newStudent: Student = {
        ...formData,
        barcodeImageUri: capturedImageUri || undefined, // Use the image from scan/upload if available
        createdAt: new Date(),
      };

      // Persist student data (using localStorage for demo)
       students.push(newStudent);
       localStorage.setItem('students', JSON.stringify(students));

      toast({
        title: 'Student Added Successfully',
        description: `${formData.name} (ID: ${formData.id}) has been added.`,
      });

       // Reset state after successful submission
       setCapturedImageUri(null);
       setExtractedData(null);
       setExtractionError(null);
       setActiveTab('scan'); // Go back to the scan tab or dashboard
       // router.push('/admin/dashboard'); // Optional: Redirect

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


  return (
    <div className="container mx-auto px-4 py-8 flex flex-col items-center gap-8">
       <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
             <CardTitle className="text-2xl font-bold text-primary">Add New Student</CardTitle>
             <CardDescription>Use scan, upload, or enter details manually.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">

            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full max-w-md">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="scan"><Camera className="mr-2 h-4 w-4"/>Scan ID</TabsTrigger>
                    <TabsTrigger value="upload"><Upload className="mr-2 h-4 w-4"/>Upload ID</TabsTrigger>
                    <TabsTrigger value="manual">Manual Entry</TabsTrigger>
                </TabsList>

                {/* Scan Tab Content */}
                <TabsContent value="scan" className="flex flex-col items-center pt-6">
                    <BarcodeScanner
                        onScanSuccess={handleScanSuccess}
                        onScanError={(err) => {
                            console.error("Scanner Error:", err);
                            setExtractionError(`Scanner error: ${err.message}. Try uploading or manual entry.`);
                            toast({ title:"Scanner Issue", description: "Could not start or use scanner.", variant: "destructive"})
                        }}
                        scanPrompt="Position ID card inside the frame"
                        disabled={isExtracting || isSubmitting}
                    />
                    {isExtracting && (
                        <div className="flex items-center justify-center gap-2 text-muted-foreground mt-4">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span>Processing image...</span>
                        </div>
                    )}
                </TabsContent>

                {/* Upload Tab Content */}
                <TabsContent value="upload" className="flex flex-col items-center pt-6 gap-4">
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
                    <Button onClick={triggerFileUpload} variant="outline" disabled={isExtracting || isSubmitting} className="w-full max-w-xs">
                        <Upload className="mr-2 h-4 w-4" /> Choose Image File
                    </Button>
                    {isExtracting && (
                        <div className="flex items-center justify-center gap-2 text-muted-foreground mt-2">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span>Processing image...</span>
                        </div>
                    )}
                </TabsContent>

                {/* Manual Entry Tab Content (also shows results from scan/upload) */}
                <TabsContent value="manual" className="pt-6">
                    {isExtracting && ( // Show loader here too if switched while extracting
                        <div className="flex items-center justify-center gap-2 text-muted-foreground mb-4">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span>Processing image... Please wait.</span>
                        </div>
                    )}

                    {extractionError && !isExtracting && (
                        <Alert variant="destructive" className="w-full mb-4">
                            <Info className="h-4 w-4" />
                            <AlertTitle>Extraction Issue</AlertTitle>
                            <AlertDescription>{extractionError}</AlertDescription>
                        </Alert>
                    )}

                    {capturedImageUri && !isExtracting && (
                        <div className="mb-4 p-2 border rounded-md bg-muted w-full max-w-sm mx-auto">
                           <p className="text-sm font-medium text-center mb-2">Processed Image:</p>
                           <Image
                              src={capturedImageUri}
                              alt="Scanned or Uploaded ID Card"
                              width={300}
                              height={180} // Adjust height for ID card aspect ratio
                              className="rounded-md mx-auto object-contain"
                              data-ai-hint="id card"
                           />
                        </div>
                     )}

                    {/* Always render form in manual tab if not extracting. Handles manual entry and verification after scan/upload */}
                    {!isExtracting && (
                        <StudentForm
                            // Use key to force re-render with new defaults when extractedData changes
                            key={JSON.stringify(extractedData)}
                            onSubmit={handleFormSubmit}
                            defaultValues={formDefaultValues}
                            isLoading={isSubmitting}
                            submitButtonText={isSubmitting ? 'Adding...' : 'Add Student'}
                            formTitle="Student Details"
                            formDescription={extractedData ? "Verify extracted information and complete any missing fields." : "Enter student details manually."}
                        />
                    )}
                </TabsContent>
            </Tabs>

          </CardContent>
       </Card>
    </div>
  );
}
