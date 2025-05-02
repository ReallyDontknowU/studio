
'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'; // Keep Card for structure
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import type { Student, Branch, YearOfStudy } from '@/lib/types';
import { BRANCHES, YEARS_OF_STUDY } from '@/lib/constants'; // Assuming constants are defined

interface StudentFormProps {
  onSubmit: (data: StudentFormData) => void;
  defaultValues?: Partial<StudentFormData>;
  isLoading?: boolean;
  submitButtonText?: string; // Keep prop, though button is now external for edit dialog
  formTitle?: string;
  formDescription?: string;
  availableBranches?: Branch[]; // Allow overriding default branches
  formId?: string; // Add formId prop
}

// Define Zod schema for validation
const studentFormSchema = z.object({
  id: z.string().min(1, { message: 'Student ID (Barcode No.) is required.' }),
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  branch: z.string().min(1, { message: 'Branch is required.' }),
  rollNo: z.string().min(1, { message: 'Roll No. is required.' }),
  yearOfStudy: z.enum(['FY', 'SY', 'TY'], { required_error: 'Year of Study is required.' }),
});

export type StudentFormData = z.infer<typeof studentFormSchema>;

const StudentForm: React.FC<StudentFormProps> = ({
  onSubmit,
  defaultValues = {},
  isLoading = false,
  submitButtonText = 'Save Student',
  formTitle = 'Student Information',
  formDescription = 'Enter the student details.',
  availableBranches = BRANCHES,
  formId // Use the formId prop
}) => {
  const internalFormId = React.useId(); // Generate internal ID if none provided
  const resolvedFormId = formId || `student-form-${internalFormId}`; // Resolve the ID to use

  const form = useForm<StudentFormData>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      id: defaultValues?.id || '',
      name: defaultValues?.name || '',
      branch: defaultValues?.branch || '',
      rollNo: defaultValues?.rollNo || '',
      yearOfStudy: defaultValues?.yearOfStudy, // Needs to be one of the enum values or undefined
    },
    // Reset form state when defaultValues change if needed (e.g., when editing a different student)
    // Consider adding: mode: 'onChange', reValidateMode: 'onChange' for more reactive validation
  });

   // Watch for changes in defaultValues to reset the form if the student being edited changes
   React.useEffect(() => {
       form.reset({
           id: defaultValues?.id || '',
           name: defaultValues?.name || '',
           branch: defaultValues?.branch || '',
           rollNo: defaultValues?.rollNo || '',
           yearOfStudy: defaultValues?.yearOfStudy,
       });
   }, [defaultValues, form]); // Add form to dependencies


  const handleFormSubmit = (data: StudentFormData) => {
    onSubmit(data);
    // Optionally reset form after submission: form.reset(); // Keep commented unless intended
  };

  return (
    // Re-introduce Card for consistent styling, remove shadow if it's inside a Dialog
    <Card className="w-full max-w-lg border-0 shadow-none">
       {(formTitle || formDescription) && ( // Conditionally render header if title/desc provided
          <CardHeader className="pt-0 px-1"> {/* Adjust padding if needed */}
             {formTitle && <CardTitle className="text-primary">{formTitle}</CardTitle>}
             {formDescription && <CardDescription>{formDescription}</CardDescription>}
          </CardHeader>
       )}
       <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} id={resolvedFormId}> {/* Add ID here */}
             {/* Add pb-6 (or similar) to ensure space below last field for scrolling */}
             <CardContent className="space-y-4 px-1 pb-0"> {/* Remove bottom padding from CardContent */}
                <FormField
                  control={form.control}
                  name="id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Student ID (Barcode No.)</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter barcode number" {...field} disabled={isLoading} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter student's full name" {...field} disabled={isLoading} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="rollNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Roll No.</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter roll number" {...field} disabled={isLoading} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="branch"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Branch</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isLoading}> {/* Use value prop */}
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select branch" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableBranches.map((branch) => (
                            <SelectItem key={branch} value={branch}>
                              {branch}
                            </SelectItem>
                          ))}
                          {/* Option to add a new branch could be implemented here */}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                 <FormField
                  control={form.control}
                  name="yearOfStudy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Year of Study</FormLabel>
                       <Select onValueChange={field.onChange} value={field.value} disabled={isLoading}> {/* Use value prop */}
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select year" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {YEARS_OF_STUDY.map((year) => (
                            <SelectItem key={year} value={year}>
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
             </CardContent>
              {/* Footer removed - will be handled by DialogFooter in manage-students */}
              {/* Only render the submit button if NOT used inside the edit dialog (e.g., on add student page) */}
             {!formId && (
                <div className="p-1 pt-4"> {/* Add padding back */}
                    <Button type="submit" className="w-full transition-subtle" disabled={isLoading}>
                        {isLoading ? 'Saving...' : submitButtonText}
                    </Button>
                </div>
             )}
          </form>
       </Form>
    </Card>
  );
};

export default StudentForm;

