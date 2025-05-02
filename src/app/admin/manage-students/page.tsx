
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog"; // Import Dialog components
import { useToast } from '@/hooks/use-toast';
import { Search, Edit, Trash2, UserX } from 'lucide-react';
import type { Student } from '@/lib/types';
import StudentForm, { StudentFormData } from '@/components/student-form'; // Import StudentForm
import { BRANCHES } from '@/lib/constants'; // Import branches for form
import { ScrollArea } from '@/components/ui/scroll-area'; // Import ScrollArea

// Helper functions to manage students in localStorage (replace with API calls)
const getStudents = (): Student[] => {
  const stored = localStorage.getItem('students');
  return stored ? JSON.parse(stored).map((s: any) => ({ ...s, createdAt: new Date(s.createdAt) })) : [];
};

const saveStudents = (students: Student[]): void => {
  localStorage.setItem('students', JSON.stringify(students));
};

export default function AdminManageStudentsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [studentToEdit, setStudentToEdit] = useState<Student | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setStudents(getStudents());
  }, []);

  const filteredStudents = useMemo(() => {
    if (!searchTerm) {
      return students;
    }
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return students.filter(student =>
      student.name.toLowerCase().includes(lowerCaseSearchTerm) ||
      student.id.toLowerCase().includes(lowerCaseSearchTerm) ||
      student.rollNo.toLowerCase().includes(lowerCaseSearchTerm) ||
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

  const handleEditClick = (student: Student) => {
    setStudentToEdit(student);
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


    // TODO: Replace with API call
    const updatedStudents = students.map(student =>
      student.id === studentToEdit.id
        ? { ...studentToEdit, ...formData } // Update student data, keep original createdAt and image URI
        : student
    );
    saveStudents(updatedStudents);
    setStudents(updatedStudents);
    setIsLoading(false);
    setIsEditDialogOpen(false);
    setStudentToEdit(null);
    toast({ title: 'Success', description: `Student "${formData.name}" updated.` });
  };


  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-primary">Manage Students</CardTitle>
          <CardDescription>View, search, edit, or delete student records.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search Input */}
          <div className="flex gap-4 mb-6 items-center">
            <div className="relative flex-grow">
               <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
               <Input
                  placeholder="Search by Name, ID, Roll No, Branch..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10" // Add padding for the icon
               />
            </div>
             <Button onClick={() => router.push('/admin/add-student')} className="transition-subtle">
                Add New Student
            </Button>
          </div>

          {/* Student Table */}
          <div className="border rounded-md overflow-x-auto"> {/* Ensure horizontal scroll on small screens */}
            <Table>
              <TableCaption>A list of registered students.</TableCaption>
              <TableHeader>
                <TableRow>
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
                      <TableCell className="font-medium whitespace-nowrap">{student.id.toUpperCase()}</TableCell>
                      <TableCell className="whitespace-nowrap">{student.name}</TableCell>
                      <TableCell>{student.branch}</TableCell>
                      <TableCell>{student.rollNo}</TableCell>
                      <TableCell>{student.yearOfStudy}</TableCell>
                      <TableCell className="text-right space-x-2 whitespace-nowrap">
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
                    <TableCell colSpan={6} className="h-24 text-center">
                      {searchTerm ? `No students found matching "${searchTerm}".` : "No students registered yet."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

            {/* Edit Student Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                {/* Adjusted DialogContent for scrolling */}
                <DialogContent className="sm:max-w-[600px] grid-rows-[auto_minmax(0,1fr)] max-h-[90vh] p-0">
                    <DialogHeader className="p-6 pb-0">
                        <DialogTitle>Edit Student Information</DialogTitle>
                        <DialogDescription>
                            Make changes to the student's details below. Click save when you're done.
                        </DialogDescription>
                    </DialogHeader>
                    {/* ScrollArea wraps the form */}
                    <ScrollArea className="overflow-y-auto px-6">
                       {studentToEdit && (
                           <StudentForm
                              // Removed key prop unless absolutely necessary for specific reset behavior
                              onSubmit={handleEditSubmit}
                              defaultValues={studentToEdit} // Pass the full student object
                              isLoading={isLoading}
                              submitButtonText={isLoading ? 'Saving...' : 'Save Changes'}
                              formTitle="" // Hide inner title/desc
                              formDescription=""
                              availableBranches={BRANCHES} // Or fetch dynamically if needed
                              // Add padding-bottom inside the form's card/container if needed so last field isn't cut off by footer
                           />
                       )}
                    </ScrollArea>
                    {/* Footer can remain outside ScrollArea if handled by Dialog, but StudentForm includes it */}
                 </DialogContent>
             </Dialog>


        </CardContent>
      </Card>
    </div>
  );
}
