
'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog"; // Import Dialog components
import { useToast } from '@/hooks/use-toast';
import { Search, Edit, Trash2, UserX, Camera, Upload, Image as ImageIcon, Loader2 } from 'lucide-react'; // Added Image, Camera, Upload, Loader2
import type { Student, ExtractedIdData, YearOfStudy, Branch } from '@/lib/types';
import StudentForm, { StudentFormData } from '@/components/student-form'; // Import StudentForm
import { BRANCHES, YEARS_OF_STUDY } from '@/lib/constants'; // Import branches for form
import { ScrollArea } from '@/components/ui/scroll-area'; // Import ScrollArea
import BarcodeScanner from '@/components/barcode-scanner'; // Import Scanner
import { adminExtractBarcodeData } from '@/ai/flows/admin-extract-barcode-data'; // Import AI flow
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'; // Import Alert for errors
import { Label } from '@/components/ui/label'; // Import Label

// Helper functions to manage students in localStorage (replace with API calls)
const getStudents = (): Student[] => {
  const stored = localStorage.getItem('students');
  return stored ? JSON.parse(stored).map((s: any) => ({ ...s, createdAt: new Date(s.createdAt) })) : [];
};

const saveStudents = (students: Student[]): void => {
  localStorage.setItem('students', JSON.stringify(students));
};

// Helper to map string year to enum type (copy from add-student)
const mapYearOfStudy = (yearStr?: string): YearOfStudy | undefined => {
    if (!yearStr) return undefined;
    const upperYear = yearStr.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (YEARS_OF_STUDY.includes(upperYear as YearOfStudy)) return upperYear as YearOfStudy;
    if (upperYear.includes('FIRST') || upperYear.includes('FY') || upperYear === '1') return 'FY';
    if (upperYear.includes('SECOND') || upperYear.includes('SY') || upperYear === '2') return 'SY';
    if (upperYear.includes('THIRD') || upperYear.includes('TY') || upperYear === '3') return 'TY';
    return undefined;
};

// Helper to map string branch (copy from add-student)
const mapBranch = (branchStr?: string): Branch | undefined => {
    if (!branchStr) return undefined;
    const lowerBranchStr = branchStr.trim().toLowerCase();
    const knownBranch = BRANCHES.find(b => b.toLowerCase() === lowerBranchStr);
    return knownBranch || branchStr.trim();
}


export default function AdminManageStudentsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [studentToEdit, setStudentToEdit] = useState<Student | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImageViewOpen, setIsImageViewOpen] = useState(false);
  const [imageToView, setImageToView] = useState<string | null>(null);

  // State for handling image updates in edit dialog
  const [editModeCapturedImageUri, setEditModeCapturedImageUri] = useState<string | null>(null);
  const [isEditModeScanning, setIsEditModeScanning] = useState(false);
  const [isEditModeUploading, setIsEditModeUploading] = useState(false); // Track upload state
  const [editModeExtractionError, setEditModeExtractionError] = useState<string | null>(null);
  const [isEditModeExtracting, setIsEditModeExtracting] = useState(false); // Track AI processing
  const fileInputRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    setStudents(getStudents());
  }, []);

  // Close image view modal when edit dialog closes
  useEffect(() => {
      if (!isEditDialogOpen) {
          setIsImageViewOpen(false);
          setImageToView(null);
          setEditModeCapturedImageUri(null); // Reset edit image state
          setIsEditModeScanning(false);
          setIsEditModeUploading(false);
          setEditModeExtractionError(null);
          setIsEditModeExtracting(false);
      }
  }, [isEditDialogOpen]);


  const filteredStudents = useMemo(() => {
    if (!searchTerm) {
      return students;
    }
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return students.filter(student =>
      student.name.toLowerCase().includes(lowerCaseSearchTerm) ||
      student.id.toLowerCase().includes(lowerCaseSearchTerm) ||
      (student.rollNo && student.rollNo.toLowerCase().includes(lowerCaseSearchTerm)) || // Check if rollNo exists
      student.branch.toLowerCase().includes(lowerCaseSearchTerm)
    );
  }, [students, searchTerm]);

  const handleDeleteStudent = (studentId: string) => {
    setIsLoading(true);
    const studentToDelete = students.find(s => s.id === studentId);
    if (!studentToDelete) {
        toast({ title: 'Error', description: 'Student not found.', variant: 'destructive' });
        setIsLoading(false);
        return;
    }
    // TODO: Add check if student has active logs before deleting?

    const updatedStudents = students.filter(student => student.id !== studentId);
    saveStudents(updatedStudents);
    setStudents(updatedStudents);
    setIsLoading(false);
    toast({ title: 'Success', description: `Student "${studentToDelete.name}" (ID: ${studentId}) deleted.`, variant: 'destructive' });
  };

  const handleViewImageClick = (student: Student) => {
     if (student.idCardImageUri) {
        setImageToView(student.idCardImageUri);
        setIsImageViewOpen(true);
     } else {
        toast({ title: "No Image", description: "No ID card image is available for this student.", variant: "default" });
     }
  };


  const handleEditClick = (student: Student) => {
    setStudentToEdit(student);
    setEditModeCapturedImageUri(student.idCardImageUri || null); // Set initial image for edit mode
    setIsEditDialogOpen(true);
  };

  const handleEditSubmit = (formData: StudentFormData) => {
    if (!studentToEdit) return;
    setIsLoading(true);

     // Check if the NEW ID conflicts with ANOTHER existing student
     const conflictingStudent = students.find(s => s.id.toLowerCase() === formData.id.toLowerCase() && s.id !== studentToEdit.id);
     if (conflictingStudent) {
         toast({
             title: 'Error Updating Student',
             description: `Another student with ID ${formData.id.toUpperCase()} already exists.`,
             variant: 'destructive',
         });
         setIsLoading(false);
         return; // Stop submission
     }

     // Prepare updated student data
     const updatedStudentData: Student = {
        ...studentToEdit, // Keep original createdAt etc.
        ...formData, // Apply form data changes
        // Update image URI only if a new one was captured/uploaded during edit
        // AND if the ID has NOT changed. If ID changed, the URI should be updated regardless.
        // OR if the ID changed AND a new image was captured.
        idCardImageUri: (formData.id !== studentToEdit.id && editModeCapturedImageUri) // ID changed AND new image exists
                       ? editModeCapturedImageUri // Use new image for new ID
                       : (editModeCapturedImageUri && editModeCapturedImageUri !== studentToEdit.idCardImageUri) // New image captured/uploaded for same ID
                         ? editModeCapturedImageUri // Use the new image
                         : (formData.id === studentToEdit.id) // ID did not change
                           ? studentToEdit.idCardImageUri // Keep original image if ID is same and no new image
                           : undefined, // ID changed but no new image was uploaded, so clear it (or handle differently?)
     };

    // Rename image logic (placeholder - adjust based on actual storage)
    // If the ID changed and an image exists, we conceptually "rename" the image association.
    // In localStorage, this just means saving the new student data with the potentially old URI under the new ID.
    // For file storage, you'd rename the file or update a database record.


    // TODO: Replace with API call
    const updatedStudents = students.map(student =>
      student.id === studentToEdit.id // Find the original student by the original ID
        ? updatedStudentData // Replace with the potentially ID-changed data
        : student
    );
    saveStudents(updatedStudents);
    setStudents(updatedStudents);
    setIsLoading(false);
    setIsEditDialogOpen(false);
    setStudentToEdit(null);
    setEditModeCapturedImageUri(null); // Clear edit image state
    toast({ title: 'Success', description: `Student "${formData.name}" updated.` });
  };

   // --- Edit Mode Image Handling ---

   const processEditImage = useCallback(async (imageDataUri: string | null) => {
     if (!imageDataUri) {
       setEditModeCapturedImageUri(studentToEdit?.idCardImageUri || null); // Revert to original if capture stopped/failed
       setEditModeExtractionError("No image captured or selected.");
       setIsEditModeScanning(false);
       setIsEditModeUploading(false);
       setIsEditModeExtracting(false);
       return;
     }

     setEditModeCapturedImageUri(imageDataUri); // Show the new image immediately
     setEditModeExtractionError(null);
     setIsEditModeExtracting(true); // Start AI processing indicator
     setIsEditModeScanning(false); // Ensure scanner state is off
     setIsEditModeUploading(false); // Ensure upload state is off

     try {
       const result = await adminExtractBarcodeData({ photoDataUri: imageDataUri });
       console.log("Edit Mode - adminExtractBarcodeData result:", result);

       if (result && studentToEdit) { // Ensure studentToEdit is available
         // Optionally pre-fill form fields based on new scan (BE CAREFUL NOT TO OVERWRITE INTENTIONAL MANUAL EDITS)
         // You might want to ask the user if they want to update fields based on the new scan.
         // For now, just update the image and let the user manually adjust fields if needed.

          // Update the form's default values IF the corresponding field in the form is currently empty or matches the OLD student data
          // This requires accessing the form instance, which needs to be managed carefully (e.g., using refs or context)
          // For simplicity, we won't auto-update form fields here, just the image. The user must verify.

         toast({
           title: "Image Processed",
           description: `New ID image captured/uploaded. Extracted ID: ${result.studentId || 'Not found'}. Verify details.`,
         });
       } else {
           setEditModeExtractionError("Could not extract details from the new image.");
       }
     } catch (error: any) {
       console.error('Error processing image in edit mode:', error);
       setEditModeExtractionError(`Failed to process new image: ${error.message || 'Unknown error'}.`);
     } finally {
       setIsEditModeExtracting(false); // Stop AI processing indicator
     }
   }, [studentToEdit, toast]); // Dependencies

   const handleEditScanSuccess = (imageDataUri: string) => {
     setIsEditModeScanning(false); // Turn off scanner view
     processEditImage(imageDataUri);
   };

   const handleEditManualStop = (imageDataUri: string | null) => {
     setIsEditModeScanning(false); // Turn off scanner view
     processEditImage(imageDataUri); // Process the (potentially null) captured frame
   };

    const handleEditFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setIsEditModeUploading(true); // Indicate upload processing
            setEditModeExtractionError(null);
            const reader = new FileReader();
            reader.onloadend = () => {
                if (typeof reader.result === 'string') {
                    processEditImage(reader.result); // Process the uploaded image
                } else {
                    setEditModeExtractionError("Failed to read uploaded file.");
                    setIsEditModeUploading(false);
                }
            };
            reader.onerror = () => {
                setEditModeExtractionError("Error reading uploaded file.");
                setIsEditModeUploading(false);
            }
            reader.readAsDataURL(file);
        }
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const triggerEditFileUpload = () => {
      fileInputRef.current?.click();
    };


  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-primary">Manage Students</CardTitle>
          <CardDescription>View, search, edit, or delete student records.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search Input and Add Button */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6 items-center">
             <div className="relative flex-grow w-full sm:w-auto">
               <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
               <Input
                  placeholder="Search by Name, ID, Roll No, Branch..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-full" // Add padding for the icon
               />
            </div>
            <Button onClick={() => router.push('/admin/add-student')} className="transition-subtle w-full sm:w-auto">
                Add New Student
            </Button>
          </div>

          {/* Student Table */}
          <div className="border rounded-md overflow-x-auto"> {/* Ensure horizontal scroll on small screens */}
            <Table>
              <TableCaption>A list of registered students.</TableCaption>
              <TableHeader>
                <TableRow>
                   <TableHead>ID Card</TableHead> {/* New column for image */}
                  <TableHead>Student ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Roll No.</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((student) => (
                    <TableRow key={student.id}>
                       <TableCell>
                           {student.idCardImageUri ? (
                               <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewImageClick(student)} title="View ID Card">
                                   <ImageIcon className="h-4 w-4 text-primary" />
                               </Button>
                           ) : (
                               <span className="text-xs text-muted-foreground">No Image</span>
                           )}
                        </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{student.id.toUpperCase()}</TableCell>
                      <TableCell className="whitespace-nowrap">{student.name}</TableCell>
                      <TableCell>{student.branch}</TableCell>
                      <TableCell>{student.rollNo || '-'}</TableCell> {/* Display dash if no roll no */}
                      <TableCell>{student.yearOfStudy}</TableCell>
                      <TableCell className="text-right space-x-1 whitespace-nowrap"> {/* Reduced space */}
                        <Button onClick={() => handleEditClick(student)} variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:text-blue-800" title="Edit Student">
                             <Edit className="h-4 w-4" />
                         </Button>
                         {/* Delete Confirmation */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-red-700" title="Delete Student">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the student record for "{student.name}" (ID: {student.id.toUpperCase()}). Any associated logs may also be affected (depending on future implementation).
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteStudent(student.id)} className="bg-destructive hover:bg-destructive/90" disabled={isLoading}>
                                {isLoading ? 'Deleting...' : 'Delete'}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center"> {/* Increased colSpan */}
                      {searchTerm ? `No students found matching "${searchTerm}".` : "No students registered yet."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

            {/* Edit Student Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-[600px] p-0"> {/* Use flex column layout, remove internal padding */}
                    <DialogHeader> {/* Header stays, padding handled by component */}
                        <DialogTitle>Edit Student Information</DialogTitle>
                        <DialogDescription>
                            Make changes to the student's details. You can also update the ID card image.
                        </DialogDescription>
                    </DialogHeader>

                    {/* ScrollArea wraps the main content section */}
                    <ScrollArea className="flex-grow overflow-y-auto">
                       <div className="px-6 pt-4 pb-6"> {/* Add padding inside ScrollArea */}
                           {studentToEdit && (
                                <>
                                   {/* Image Section */}
                                   <div className="mb-6 p-2 border rounded-md bg-muted max-w-sm mx-auto">
                                       <p className="text-sm font-medium text-center mb-2">ID Card Image:</p>
                                       {isEditModeScanning ? (
                                           // Show Scanner when scanning
                                           <div className="flex flex-col items-center">
                                               <BarcodeScanner
                                                   onScanSuccess={handleEditScanSuccess}
                                                   onScanError={(err) => {
                                                       setEditModeExtractionError(`Scanner error: ${err.message}`);
                                                       setIsEditModeScanning(false);
                                                   }}
                                                   // Remove onManualStop prop usage as it's removed from BarcodeScanner
                                                   scanPrompt="Position ID card..."
                                                   disabled={isEditModeExtracting}
                                                   autoStartScanLoop={true} // Keep auto loop for consistency
                                               />
                                               {isEditModeExtracting && <Loader2 className="h-5 w-5 animate-spin mt-2" />}
                                           </div>
                                       ) : (
                                            // Show Image or Placeholder
                                           <div className="flex flex-col items-center">
                                               {editModeCapturedImageUri ? (
                                                   <Image
                                                       src={editModeCapturedImageUri}
                                                       alt="Student ID Card"
                                                       width={250}
                                                       height={375}
                                                       className="rounded-md object-contain mb-2"
                                                   />
                                               ) : (
                                                   <div className="h-[200px] w-[150px] flex items-center justify-center bg-secondary rounded-md mb-2">
                                                       <span className="text-muted-foreground text-sm">No Image</span>
                                                   </div>
                                               )}
                                               {/* Buttons to Scan/Upload */}
                                                <div className="flex gap-2 mt-2">
                                                     <Button variant="outline" size="sm" onClick={() => setIsEditModeScanning(true)} disabled={isLoading || isEditModeUploading || isEditModeExtracting}>
                                                          <Camera className="mr-1 h-3 w-3"/> Re-Scan
                                                     </Button>
                                                     <Button variant="outline" size="sm" onClick={triggerEditFileUpload} disabled={isLoading || isEditModeScanning || isEditModeExtracting || isEditModeUploading}>
                                                          {isEditModeUploading ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : <Upload className="mr-1 h-3 w-3"/>} Upload
                                                     </Button>
                                                     <Input
                                                         id="edit-file-upload"
                                                         type="file"
                                                         accept="image/*"
                                                         ref={fileInputRef}
                                                         onChange={handleEditFileUpload}
                                                         className="hidden"
                                                         disabled={isLoading || isEditModeScanning || isEditModeUploading || isEditModeExtracting}
                                                     />
                                                </div>
                                                 {isEditModeExtracting && <span className="text-xs text-muted-foreground mt-1">Processing image...</span>}
                                                 {editModeExtractionError && <Alert variant="destructive" className="mt-2 text-xs p-2"><AlertDescription>{editModeExtractionError}</AlertDescription></Alert>}
                                           </div>
                                       )}
                                   </div>

                                   {/* Student Form */}
                                   <StudentForm
                                       formId={`student-form-${studentToEdit.id}`} // Unique ID for the form
                                       onSubmit={handleEditSubmit}
                                       defaultValues={studentToEdit} // Pass the full student object
                                       isLoading={isLoading || isEditModeExtracting || isEditModeUploading} // Disable form while loading/processing
                                       submitButtonText={isLoading ? 'Saving...' : 'Save Changes'} // This button is now external
                                       formTitle="" // Hide inner title/desc
                                       formDescription=""
                                       availableBranches={BRANCHES} // Or fetch dynamically if needed
                                   />
                               </>
                          )}
                       </div> {/* End padding container */}
                    </ScrollArea>

                    <DialogFooter> {/* Footer stays, padding handled by component */}
                       <DialogClose asChild>
                         <Button variant="outline" disabled={isLoading}>Cancel</Button>
                       </DialogClose>
                       <Button
                          onClick={() => {
                              // Trigger form submission using its ID
                              const formElement = document.getElementById(`student-form-${studentToEdit?.id}`);
                              if (formElement instanceof HTMLFormElement) {
                                  // Create a temporary submit button and click it
                                  const tempSubmit = document.createElement('button');
                                  tempSubmit.type = 'submit';
                                  tempSubmit.style.display = 'none';
                                  formElement.appendChild(tempSubmit);
                                  tempSubmit.click();
                                  formElement.removeChild(tempSubmit);
                              } else {
                                  console.error("Could not find form element to submit.");
                              }
                          }}
                          disabled={isLoading || isEditModeScanning || isEditModeExtracting || isEditModeUploading} // Also disable save during image processing
                        >
                          {isLoading ? 'Saving...' : 'Save Changes'}
                       </Button>
                    </DialogFooter>
                 </DialogContent>
             </Dialog>

            {/* Image View Dialog */}
            <Dialog open={isImageViewOpen} onOpenChange={setIsImageViewOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Student ID Card</DialogTitle>
                         <DialogDescription>Image stored for the student.</DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-center p-4">
                        {imageToView && (
                            <Image
                                src={imageToView}
                                alt="Student ID Card"
                                width={300}
                                height={450}
                                className="rounded-md object-contain"
                            />
                        )}
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="secondary">
                                Close
                            </Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </CardContent>
      </Card>
    </div>
  );
}
