
'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { UserPlus, ScanBarcode, ListOrdered, BarChart3, Settings, Users } from 'lucide-react'; // Added Users icon
import { Separator } from '@/components/ui/separator';

// Mock data function (replace with actual data fetching)
const getDashboardStats = () => {
  // Fetch stats dynamically, e.g., from localStorage or API
  const students = JSON.parse(localStorage.getItem('students') || '[]');
  const logs = JSON.parse(localStorage.getItem('entryLogs') || '[]').map((log: any) => ({ ...log, timestamp: new Date(log.timestamp) }));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const entriesToday = logs.filter((log: any) => log.timestamp >= today && log.type === 'Entry').length;

  // Calculate currently inside (simplified: last action was Entry)
  const studentStatus: { [key: string]: string } = {};
   logs
      .sort((a: any, b: any) => a.timestamp.getTime() - b.timestamp.getTime()) // Sort logs chronologically
      .forEach((log: any) => {
          studentStatus[log.studentId] = log.type;
       });
   const currentlyInside = Object.values(studentStatus).filter(status => status === 'Entry').length;


  return {
    totalStudents: students.length,
    entriesToday: entriesToday,
    currentlyInside: currentlyInside,
  };
};

export default function AdminDashboardPage() {
  // Use state to hold stats so they update if localStorage changes while on page
  const [stats, setStats] = React.useState({ totalStudents: 0, entriesToday: 0, currentlyInside: 0 });

  React.useEffect(() => {
    // Fetch stats on mount and potentially set up an interval or listener
    // for localStorage changes if real-time updates are desired.
    setStats(getDashboardStats());
  }, []); // Re-run if dependencies change (e.g., navigation events)


  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-primary">Admin Dashboard</h1>
        <p className="text-muted-foreground">Manage library resources and track student activity.</p>
      </header>

      {/* Stats Section */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalStudents}</div>
             <p className="text-xs text-muted-foreground">Registered in the system</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entries Today</CardTitle>
            <ListOrdered className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             <div className="text-2xl font-bold">{stats.entriesToday}</div>
             <p className="text-xs text-muted-foreground">Student entries recorded today</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Currently Inside</CardTitle>
             <ScanBarcode className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             <div className="text-2xl font-bold">{stats.currentlyInside}</div>
             <p className="text-xs text-muted-foreground">Students currently in the library</p>
          </CardContent>
        </Card>
      </section>

      <Separator className="my-8" />

      {/* Actions Section */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="hover:shadow-md transition-shadow duration-200">
          <CardHeader>
            <CardTitle>Add New Student</CardTitle>
            <CardDescription>Register a new student manually or via ID scan.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/add-student" passHref>
              <Button className="w-full transition-subtle">
                <UserPlus className="mr-2" /> Add Student
              </Button>
            </Link>
          </CardContent>
        </Card>

         <Card className="hover:shadow-md transition-shadow duration-200">
           <CardHeader>
             <CardTitle>Manage Students</CardTitle>
             <CardDescription>View, search, edit, or delete student records.</CardDescription>
           </CardHeader>
           <CardContent>
             <Link href="/admin/manage-students" passHref>
               <Button variant="outline" className="w-full transition-subtle">
                 <Users className="mr-2" /> Manage Students
               </Button>
             </Link>
           </CardContent>
         </Card>

        <Card className="hover:shadow-md transition-shadow duration-200">
          <CardHeader>
            <CardTitle>Record Entry/Exit</CardTitle>
            <CardDescription>Scan student barcodes for entry or exit.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/scan" passHref>
              <Button variant="secondary" className="w-full transition-subtle">
                <ScanBarcode className="mr-2" /> Scan Barcode
              </Button>
            </Link>
          </CardContent>
        </Card>


        <Card className="hover:shadow-md transition-shadow duration-200">
          <CardHeader>
            <CardTitle>Entry/Exit Log</CardTitle>
            <CardDescription>View and manage student entry and exit records.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/logs" passHref>
              <Button variant="outline" className="w-full transition-subtle">
                <ListOrdered className="mr-2" /> View Logs
              </Button>
            </Link>
          </CardContent>
        </Card>


         <Card className="hover:shadow-md transition-shadow duration-200">
          <CardHeader>
            <CardTitle>Manage Branches</CardTitle>
            <CardDescription>Add or edit library branches/departments.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/branches" passHref>
              <Button variant="outline" className="w-full transition-subtle">
                <Settings className="mr-2" /> Manage Branches
              </Button>
            </Link>
          </CardContent>
        </Card>

         <Card className="hover:shadow-md transition-shadow duration-200">
          <CardHeader>
            <CardTitle>Reporting</CardTitle>
            <CardDescription>Generate usage reports (feature coming soon).</CardDescription>
          </CardHeader>
          <CardContent>
             <Button variant="ghost" className="w-full transition-subtle" disabled>
                <BarChart3 className="mr-2" /> View Reports
             </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
