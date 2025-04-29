'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import type { Student, EntryLog } from '@/lib/types';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { UserCircle, BookOpen, CalendarDays, ArrowRightLeft } from 'lucide-react';

// Mock functions (replace with actual data fetching)
const getStudentById = (id: string): Student | null => {
  const students: Student[] = JSON.parse(localStorage.getItem('students') || '[]');
  return students.find(s => s.id === id) || null;
};

const getLogsForStudent = (studentId: string): EntryLog[] => {
  const logs: EntryLog[] = JSON.parse(localStorage.getItem('entryLogs') || '[]');
  return logs
      .filter(log => log.studentId === studentId)
      .map(log => ({ ...log, timestamp: new Date(log.timestamp) })) // Ensure Date objects
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()) // Sort descending
      .slice(0, 5); // Get latest 5 logs
};

function StudentDashboardContent() {
    const searchParams = useSearchParams();
    const studentId = searchParams.get('id');
    const [student, setStudent] = useState<Student | null>(null);
    const [logs, setLogs] = useState<EntryLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(true);
        if (studentId) {
            // Simulate fetching data
            setTimeout(() => {
                const foundStudent = getStudentById(studentId);
                const studentLogs = getLogsForStudent(studentId);
                setStudent(foundStudent);
                setLogs(studentLogs);
                setIsLoading(false);
            }, 500); // Small delay for loading simulation
        } else {
            // Handle case where ID is missing
            setIsLoading(false);
        }
    }, [studentId]);

    if (isLoading) {
        return <StudentDashboardSkeleton />;
    }

    if (!studentId || !student) {
        return (
            <div className="container mx-auto px-4 py-8 text-center">
                <Card className="max-w-md mx-auto">
                    <CardHeader>
                        <CardTitle className="text-destructive">Error</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>Could not load student data. Invalid or missing Student ID.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8 space-y-8">
            <header className="mb-6">
                <h1 className="text-3xl font-bold text-primary">Welcome, {student.name}!</h1>
                <p className="text-muted-foreground">Your library activity dashboard.</p>
            </header>

            {/* Student Info Card */}
            <Card className="shadow-md">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><UserCircle /> Your Information</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div><strong>ID:</strong> {student.id}</div>
                    <div><strong>Roll No:</strong> {student.rollNo}</div>
                    <div><strong>Branch:</strong> {student.branch}</div>
                    <div><strong>Year:</strong> {student.yearOfStudy}</div>
                    <div><strong>Registered On:</strong> {format(student.createdAt, 'PPP')}</div>
                </CardContent>
            </Card>

            {/* Recent Activity Card */}
            <Card className="shadow-md">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><CalendarDays /> Recent Library Activity</CardTitle>
                    <CardDescription>Your last few entries and exits.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                         <TableCaption>Showing the last 5 activities.</TableCaption>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Timestamp</TableHead>
                                <TableHead>Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.length > 0 ? (
                                logs.map((log) => (
                                    <TableRow key={log.id}>
                                        <TableCell>{format(log.timestamp, 'Pp')}</TableCell>
                                        <TableCell>
                                            <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
                                                log.type === 'Entry' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                            }`}>
                                                {log.type === 'Entry' ? <BookOpen className="h-3 w-3"/> : <ArrowRightLeft className="h-3 w-3"/>}
                                                {log.type}
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={2} className="h-24 text-center text-muted-foreground">
                                        No recent activity found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}


// Skeleton component for loading state
function StudentDashboardSkeleton() {
    return (
        <div className="container mx-auto px-4 py-8 space-y-8">
            <header className="mb-6">
                 <Skeleton className="h-8 w-3/5 mb-2" />
                 <Skeleton className="h-4 w-2/5" />
            </header>

            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-1/3" />
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-full" />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                     <Skeleton className="h-6 w-1/2 mb-1" />
                     <Skeleton className="h-4 w-1/3" />
                </CardHeader>
                <CardContent>
                     <Skeleton className="h-40 w-full" /> {/* Placeholder for table */}
                </CardContent>
            </Card>
        </div>
    );
}


// Wrap the main component with Suspense for searchParams usage
export default function StudentDashboardPage() {
    return (
        <Suspense fallback={<StudentDashboardSkeleton />}>
            <StudentDashboardContent />
        </Suspense>
    );
}
