'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, UserPlus } from 'lucide-react';

export default function StudentLoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Dummy student data for login simulation
  const registeredStudentIds = ['12345', '67890', '11223'];

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    // Basic validation (replace with actual authentication logic)
    // Check if the entered ID exists in our dummy list
    if (registeredStudentIds.includes(studentId)) {
      toast({
        title: 'Login Successful',
        description: `Welcome back, Student ${studentId}!`,
      });
       // Simulate network request
      setTimeout(() => {
        router.push(`/student/dashboard?id=${studentId}`); // Pass ID for demo
        setIsLoading(false);
      }, 1000);
    } else {
       setError('Student ID not found. Please register if you are new.');
       setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-gradient-to-br from-background to-secondary">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">Student Portal</CardTitle>
          <CardDescription>Login or Register to track your library visits.</CardDescription>
        </CardHeader>
         <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
             {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="studentId">Student ID (Barcode Number)</Label>
              <Input
                id="studentId"
                type="text"
                placeholder="Enter your ID number"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
             <Button type="submit" className="w-full transition-subtle" disabled={isLoading}>
              {isLoading ? 'Logging in...' : 'Login'}
            </Button>
          </CardContent>
         </form>
        <CardFooter className="flex flex-col gap-2">
          <p className="text-sm text-center text-muted-foreground">New student?</p>
          <Link href="/student/register" passHref>
            <Button variant="outline" className="w-full transition-subtle">
              <UserPlus className="mr-2" /> Register Here
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
