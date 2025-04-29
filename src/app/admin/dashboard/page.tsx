'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { UserPlus, ScanBarcode, ListOrdered, BarChart3, Settings } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

// Mock data function (replace with actual data fetching)
const getDashboardStats = () => ({
  totalStudents: 152, // Example value
  entriesToday: 45,   // Example value
  currentlyInside: 12, // Example value
});

export default function AdminDashboardPage() {
  const stats = getDashboardStats();

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-primary">Admin Dashboard</h1>
        <p className="text-muted-foreground">Manage library resources and track student activity.</p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Total Students</CardTitle>
            <UserPlus className="text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{stats.totalStudents}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Entries Today</CardTitle>
            <ListOrdered className="text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{stats.entriesToday}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Currently Inside</CardTitle>
             <ScanBarcode className="text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{stats.currentlyInside}</p>
          </CardContent>
        </Card>
      </section>

      <Separator className="my-8" />

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
            <CardTitle>Manage Branches</CardTitle>
            <CardDescription>Add or edit library branches.</CardDescription>
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
