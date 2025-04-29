'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import type { Student, Branch, YearOfStudy } from '@/lib/types';
import { BRANCHES, YEARS_OF_STUDY } from '@/lib/constants'; // Assuming constants are defined

interface StudentFormProps {
  onSubmit: (data: StudentFormData) => void;
  defaultValues?: Partial<StudentFormData>;
  isLoading?: boolean;
  submitButtonText?: string;
  formTitle?: string;
  formDescription?: string;
  availableBranches?: Branch[]; // Allow overriding default branches
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
}) => {
  const form = useForm<StudentFormData>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      id: defaultValues?.id || '',
      name: defaultValues?.name || '',
      branch: defaultValues?.branch || '',
      rollNo: defaultValues?.rollNo || '',
      yearOfStudy: defaultValues?.yearOfStudy, // Needs to be one of the enum values or undefined
    },
  });

  const handleFormSubmit = (data: StudentFormData) => {
    onSubmit(data);
    // Optionally reset form after submission: form.reset();
  };

  return (
    <Card className="w-full max-w-lg shadow-lg">
       <CardHeader>
          <CardTitle className="text-primary">{formTitle}</CardTitle>
          {formDescription && <CardDescription>{formDescription}</CardDescription>}
       </CardHeader>
       <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)}>
             <CardContent className="space-y-4">
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
                      <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoading}>
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
                       <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoading}>
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
             <CardFooter>
                <Button type="submit" className="w-full transition-subtle" disabled={isLoading}>
                   {isLoading ? 'Saving...' : submitButtonText}
                </Button>
             </CardFooter>
          </form>
       </Form>
    </Card>
  );
};

export default StudentForm;
