
'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { UserPlus, ListOrdered, BarChart3, Settings, Users, KeyRound } from 'lucide-react'; // Added KeyRound for Settings
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

    // Optional: Listener for localStorage changes
    const handleStorageChange = () => {
      setStats(getDashboardStats());
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);

  }, []); // Re-run if dependencies change (e.g., navigation events)


  return (
    // Removed container div as layout now provides it
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent drop-shadow">Admin Dashboard</h1>
        <p className="text-muted-foreground">Manage library resources and track student activity.</p>
      </header>

      {/* Stats Section */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Apply enhanced card style and hover effect */}
        <Card className="card-enhanced transition-transform duration-200 hover:-translate-y-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalStudents}</div>
             <p className="text-xs text-muted-foreground">Registered in the system</p>
          </CardContent>
        </Card>
        <Card className="card-enhanced transition-transform duration-200 hover:-translate-y-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entries Today</CardTitle>
            <ListOrdered className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             <div className="text-2xl font-bold">{stats.entriesToday}</div>
             <p className="text-xs text-muted-foreground">Student entries recorded today</p>
          </CardContent>
        </Card>
        <Card className="card-enhanced transition-transform duration-200 hover:-translate-y-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Currently Inside</CardTitle>
             {/* Icon removed as scan functionality moved */}
          </CardHeader>
          <CardContent>
             <div className="text-2xl font-bold">{stats.currentlyInside}</div>
             <p className="text-xs text-muted-foreground">Students currently in the library</p>
          </CardContent>
        </Card>
      </section>

      <Separator className="my-8 bg-border/50" /> {/* Make separator slightly lighter */}

      {/* Actions Section */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

         {/* Apply enhanced card style */}
         <Card className="card-enhanced">
           <CardHeader>
             <CardTitle>Manage Students</CardTitle>
             <CardDescription>View, add, edit, or delete student records.</CardDescription>
           </CardHeader>
           <CardContent className="mt-4 flex flex-col sm:flex-row gap-2">
              <Link href="/admin/add-student" passHref className="flex-1">
                 <Button className="w-full transition-subtle hover:scale-[1.02]">
                    <UserPlus className="mr-2" /> Add Student
                 </Button>
              </Link>
              <Link href="/admin/manage-students" passHref className="flex-1">
                <Button variant="outline" className="w-full transition-subtle hover:scale-[1.02]">
                  <Users className="mr-2" /> View/Edit Students
                </Button>
              </Link>
           </CardContent>
         </Card>

        <Card className="card-enhanced">
          <CardHeader>
            <CardTitle>Entry/Exit Log</CardTitle>
            <CardDescription>View and manage student entry and exit records.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4"> {/* Adjusted padding */}
            <Link href="/admin/logs" passHref>
              <Button variant="outline" className="w-full transition-subtle hover:scale-[1.02]">
                <ListOrdered className="mr-2" /> View Logs
              </Button>
            </Link>
          </CardContent>
        </Card>


         <Card className="card-enhanced">
          <CardHeader>
            <CardTitle>Manage Branches</CardTitle>
            <CardDescription>Add or edit library branches/departments.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4"> {/* Adjusted padding */}
            <Link href="/admin/branches" passHref>
              <Button variant="outline" className="w-full transition-subtle hover:scale-[1.02]">
                <Settings className="mr-2" /> Manage Branches
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="card-enhanced">
          <CardHeader>
            <CardTitle>Admin Settings</CardTitle>
            <CardDescription>Change login credentials & view API key info.</CardDescription> {/* Updated description */}
          </CardHeader>
          <CardContent className="pt-4"> {/* Adjusted padding */}
            <Link href="/admin/settings" passHref>
              <Button variant="outline" className="w-full transition-subtle hover:scale-[1.02]">
                <KeyRound className="mr-2" /> Admin Settings {/* Changed icon to KeyRound */}
              </Button>
            </Link>
          </CardContent>
        </Card>

         <Card className="card-enhanced opacity-60"> {/* Dimmed disabled card */}
          <CardHeader>
            <CardTitle>Reporting</CardTitle>
            <CardDescription>Generate usage reports (feature coming soon).</CardDescription>
          </CardHeader>
          <CardContent className="pt-4"> {/* Adjusted padding */}
             <Button variant="ghost" className="w-full transition-subtle text-muted-foreground" disabled>
                <BarChart3 className="mr-2" /> View Reports
             </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
