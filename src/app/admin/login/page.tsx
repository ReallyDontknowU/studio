'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, LogIn } from 'lucide-react'; // Added LogIn icon
import { getAdminCredentials, initializeAdminCredentials } from '@/lib/admin-auth';

export default function AdminLoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Initialize default admin credentials if they don't exist
    initializeAdminCredentials();
  }, []);

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    const storedCredentials = getAdminCredentials();

    // Basic validation using localStorage credentials
    if (username === storedCredentials.username && password === storedCredentials.password) {
      toast({
        title: 'Login Successful',
        description: 'Redirecting to admin dashboard...',
      });
      // Simulate network request
      setTimeout(() => {
        // Optionally store a session token or flag in localStorage/sessionStorage
        localStorage.setItem('isAdminLoggedIn', 'true'); // Simple flag, enhance for production
        router.push('/admin/dashboard');
        setIsLoading(false);
      }, 1000);
    } else {
      setError('Invalid username or password.');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-gradient-futuristic-light dark:bg-gradient-futuristic-dark">
      {/* Apply enhanced card style */}
      <Card className="w-full max-w-md card-enhanced">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary drop-shadow-sm">Admin Login</CardTitle>
          <CardDescription>Access the library management dashboard.</CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4 pt-4"> {/* Added pt-4 */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isLoading}
                className="transition-subtle"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="transition-subtle"
              />
            </div>
             {/* Security Warning removed */}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full transition-subtle hover:scale-[1.02]" disabled={isLoading}>
              {isLoading ? 'Logging in...' : <><LogIn className="mr-2 h-4 w-4"/> Login</>}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
