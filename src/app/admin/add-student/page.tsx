
'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import type { Student, ExtractedIdData, YearOfStudy, Branch } from '@/lib/types';
import { BRANCHES, YEARS_OF_STUDY } from '@/lib/constants';
import { adminExtractBarcodeData } from '@/ai/flows/admin-extract-barcode-data';

// UI Components
import BarcodeScanner from '@/components/barcode-scanner';
import StudentForm, { StudentFormData } from '@/components/student-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, RefreshCw } from 'lucide-react';

// Icons
import { Loader2, Upload, Info, Camera } from 'lucide-react';

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
   // Find a known branch case-insensitively
   const knownBranch = BRANCHES.find(b => b.toLowerCase() === lowerBranchStr);
   // Return the canonical known branch name, or the trimmed input string if not found (or undefined if empty after trim)
   const trimmedInput = branchStr.trim();
   return knownBranch || (trimmedInput || undefined);
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
  const studentFormRef = useRef<{ submit: () => void }>(null); // Ref for form submission

   // Derive default values for the form based on extracted data
   // Recalculated only when extractedData changes
   const formDefaultValues: Partial<StudentFormData> = React.useMemo(() => {
        if (!extractedData) return {};
        return {
            id: extractedData.idNumber || '',
            name: extractedData.studentName || '',
            branch: mapBranch(extractedData.branch), // Map to known branch or keep as string
            rollNo: extractedData.rollNo || '',
            yearOfStudy: mapYearOfStudy(extractedData.yearOfStudy) // Map to enum type or undefined
        };
    }, [extractedData]);


  // Reset state when switching tabs, but preserve image if moving to 'manual'
  const handleTabChange = (value: string) => {
      setActiveTab(value);
      // Only reset image if NOT switching TO the manual tab from scan/upload
      if (value !== 'manual') {
          setCapturedImageUri(null);
      }
      // Reset other things regardless
      setExtractedData(null);
      setExtractionError(null);
      setIsExtracting(false);
  };


  const processImage = useCallback(async (imageDataUri: string | null) => { // Allow null for manual stop
    if (!imageDataUri) {
        console.log("Manual stop without valid frame capture.");
        setExtractedData({}); // Trigger form display for purely manual entry
        setExtractionError("No image captured. Please enter details manually or try scanning/uploading again.");
        setActiveTab('manual'); // Switch to manual tab
        toast({
            title: "Manual Entry Required",
            description: "Stopped scanning without capturing a frame. Please fill the form.",
            variant: "default", // Use default or warning variant
        });
        return; // Stop processing
    }

    console.log("Processing image:", imageDataUri.substring(0, 50) + "...");
    // Keep the captured image URI in state, already set by the scanner callback
    setCapturedImageUri(imageDataUri); // Explicitly set image URI from scan/upload
    setExtractedData(null); // Clear previous extraction
    setExtractionError(null);
    setIsExtracting(true);
    setActiveTab('manual'); // Switch to manual tab to show form/results after processing

    try {
        console.log("Calling adminExtractBarcodeData with image URI (first 50 chars):", imageDataUri.substring(0, 50) + "...");
        const result = await adminExtractBarcodeData({ photoDataUri: imageDataUri });
        console.log("adminExtractBarcodeData raw result:", result);

        if (result) { // Check if result exists (even if some fields are missing)
             const mappedData: ExtractedIdData = {
                 idNumber: result.studentId || '', // Default to empty string if undefined/null
                 studentName: result.studentName,
                 branch: result.branch, // Keep original string from AI for mapping later
                 rollNo: result.rollNo,
                 yearOfStudy: result.yearOfStudy, // Keep original string from AI for mapping later
             };
             console.log("Mapped Extracted Data:", mappedData);
             setExtractedData(mappedData); // Update state with potentially partial data

             if (result.studentId) {
                 toast({
                    title: "ID Card Processed",
                    description: `Extracted data. Please verify and complete the form.`,
                 });
             } else {
                 // If studentId is missing after processing, show a specific message
                 console.log("Extraction result missing studentId, proceeding to manual entry.");
                 setExtractionError("Could not extract student ID automatically. Please fill in the ID and verify other fields.");
                 toast({
                    title: "Extraction Incomplete",
                    description: "Could not extract student ID automatically. Please fill it in manually.",
                    variant: "destructive",
                });
             }

        } else {
             // Handle case where the flow itself might return null/undefined (though the flow tries to avoid this)
             console.log("Extraction result was null/undefined.");
             setExtractedData({}); // Set empty object to trigger form display
             setExtractionError("Could not extract details automatically. Please fill in the form manually.");
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


   // Handler for manual stop in scanner - THIS IS THE PRIMARY TRIGGER
   // Receives the image URI from the scanner component
   const handleManualStop = useCallback((imageDataUri: string | null) => {
    console.log("Manual Stop - received image data (or null):", imageDataUri ? imageDataUri.substring(0, 50) + "..." : null);
    // The image URI is set in the state by the scanner's setCapturedImageUri prop via processImage
    processImage(imageDataUri); // Process the captured frame (or null)
   }, [processImage]); // Depend on processImage

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          console.log("File Read Success - processing image.");
          // setCapturedImageUri is called within processImage
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
       const existingStudent = students.find(s => s.id.trim().toLowerCase() === formData.id.trim().toLowerCase());
       if (existingStudent) {
           toast({
               title: 'Student Already Exists',
               description: `Student with ID ${formData.id.toUpperCase()} is already registered.`,
               variant: 'destructive',
           });
           setIsSubmitting(false);
           return; // Stop submission
       }


       console.log('Admin submitting registration data:', { ...formData, idCardImageUri: capturedImageUri ? capturedImageUri.substring(0, 50) + "..." : 'None' });

      // Simulate network delay (REMOVE IN PRODUCTION)
      // await new Promise(resolve => setTimeout(resolve, 1000));

      const newStudent: Student = {
        ...formData,
        id: formData.id.trim(), // Ensure ID is trimmed
        // Save the captured/uploaded image URI from the state
        idCardImageUri: capturedImageUri || undefined,
        createdAt: new Date(),
      };

      // Persist student data (using localStorage for demo)
       students.push(newStudent);
       saveStudents(students); // Use helper function

      toast({
        title: 'Student Added Successfully',
        description: `${formData.name} (ID: ${newStudent.id.toUpperCase()}) has been added.`,
      });

       // Reset state after successful submission
       setCapturedImageUri(null);
       setExtractedData(null);
       setExtractionError(null);
       setActiveTab('scan'); // Go back to the scan tab or dashboard
       // Optionally reset the form itself if needed (though tab switch might handle it)
       // form.reset(); // Assuming 'form' is accessible via ref or context if needed here

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

   // Helper function to save students to localStorage
   const saveStudents = (students: Student[]) => {
       try {
           localStorage.setItem('students', JSON.stringify(students));
       } catch (error) {
           console.error("Error saving students to localStorage:", error);
           toast({ title: "Storage Error", description: "Could not save student list.", variant: "destructive" });
       }
   };


  return (
    // Removed container div, using layout's container
    <div className="flex flex-col items-center gap-8">
       {/* Apply enhanced card style */}
       <Card className="w-full max-w-2xl card-enhanced">
          <CardHeader className="text-center">
             <CardTitle className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent drop-shadow">Add New Student</CardTitle>
             <CardDescription>Use scan, upload, or enter details manually.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6 pt-4"> {/* Added pt-4 */}

            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full max-w-md">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="scan"><Camera className="mr-2 h-4 w-4"/>Scan ID</TabsTrigger>
                    <TabsTrigger value="upload"><Upload className="mr-2 h-4 w-4"/>Upload ID</TabsTrigger>
                    <TabsTrigger value="manual">Manual Entry</TabsTrigger>
                </TabsList>

                {/* Scan Tab Content */}
                <TabsContent value="scan" className="flex flex-col items-center pt-6">
                    <BarcodeScanner
                        onScanSuccess={() => {}} // Scan success now primarily handled by manual stop
                        onScanError={(err) => {
                            console.error("Scanner Error:", err);
                            setExtractionError(`Scanner error: ${err.message}. Try uploading or manual entry.`);
                            toast({ title:"Scanner Issue", description: "Could not start or use scanner.", variant: "destructive"})
                        }}
                        onManualStop={handleManualStop} // Pass the manual stop handler (triggers processing)
                        scanPrompt="Position ID card inside the frame"
                        disabled={isExtracting || isSubmitting}
                        setCapturedImageUri={setCapturedImageUri} // Pass the state setter correctly
                        showStopButton={true} // Explicitly show stop button in this context
                    />
                    {isExtracting && (
                        <div className="flex items-center justify-center gap-2 text-muted-foreground mt-4">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span>Processing image...</span>
                        </div>
                    )}
                     {/* Display captured image preview after scan stops (before processing finishes) */}
                     {capturedImageUri && !isExtracting && activeTab === 'scan' && (
                         <div className="mt-4 p-2 border rounded-md bg-muted w-full max-w-xs transition-opacity duration-300">
                             <p className="text-sm font-medium text-center mb-2">Captured Image:</p>
                             <Image
                                 src={capturedImageUri}
                                 alt="Captured ID Card"
                                 width={150}
                                 height={225} // Maintain vertical aspect ratio
                                 className="rounded-md mx-auto object-contain shadow-md" // Added shadow
                             />
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
                    <Button onClick={triggerFileUpload} variant="outline" disabled={isExtracting || isSubmitting} className="w-full max-w-xs transition-subtle hover:scale-[1.02]">
                        <Upload className="mr-2 h-4 w-4" /> Choose Image File
                    </Button>
                    {isExtracting && (
                        <div className="flex items-center justify-center gap-2 text-muted-foreground mt-2">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span>Processing image...</span>
                        </div>
                    )}
                      {/* Display uploaded image preview after upload (before processing finishes) */}
                      {capturedImageUri && !isExtracting && activeTab === 'upload' && (
                         <div className="mt-4 p-2 border rounded-md bg-muted w-full max-w-xs transition-opacity duration-300">
                             <p className="text-sm font-medium text-center mb-2">Uploaded Image:</p>
                             <Image
                                 src={capturedImageUri}
                                 alt="Uploaded ID Card"
                                 width={150}
                                 height={225} // Maintain vertical aspect ratio
                                 className="rounded-md mx-auto object-contain shadow-md" // Added shadow
                             />
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
                        <Alert variant="destructive" className="w-full mb-4 animate-in fade-in duration-300">
                           <div className="flex justify-between items-start">
                              <div>
                                 <Info className="h-4 w-4 inline-block mr-2 -translate-y-0.5" />
                                 <AlertTitle className="inline-block">Extraction Issue</AlertTitle>
                                 <AlertDescription>{extractionError}</AlertDescription>
                              </div>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setExtractionError(null)}>
                                 <X className="h-4 w-4"/>
                                 <span className="sr-only">Dismiss Error</span>
                              </Button>
                           </div>
                        </Alert>
                    )}

                    {/* Display Image (from Scan/Upload) on Manual Tab */}
                    {capturedImageUri && !isExtracting && (
                        <div className="mb-6 p-2 border rounded-md bg-muted w-full max-w-sm mx-auto transition-opacity duration-500">
                           <p className="text-sm font-medium text-center mb-2">Processed Image:</p>
                           <Image
                              src={capturedImageUri}
                              alt="Scanned or Uploaded ID Card"
                              width={300}
                              height={450} // Adjust height for vertical ID card aspect ratio (approx 3:4.5)
                              className="rounded-md mx-auto object-contain shadow-lg" // Enhanced shadow
                              data-ai-hint="id card"
                           />
                        </div>
                     )}

                    {/* Always render form in manual tab if not extracting. Handles manual entry and verification after scan/upload */}
                    {!isExtracting && (
                       <div className="w-full max-w-lg mx-auto">
                           <StudentForm
                                // Use key to force re-render with new defaults when extractedData changes significantly
                                key={JSON.stringify(extractedData)} // Key changes when extraction result changes
                                onSubmit={handleFormSubmit}
                                defaultValues={formDefaultValues}
                                isLoading={isSubmitting}
                                submitButtonText={isSubmitting ? 'Adding...' : 'Add Student'}
                                formTitle="" // Hide title/desc as they are handled by the tab/image presence
                                formDescription={capturedImageUri ? "Verify extracted information and complete any missing fields." : "Enter student details manually."}
                           />
                       </div>
                    )}
                </TabsContent>
            </Tabs>

          </CardContent>
       </Card>
    </div>
  );
}
