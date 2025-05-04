
'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { getAdminCredentials, saveAdminCredentials } from '@/lib/admin-auth';

// Zod schema for validation
const settingsFormSchema = z.object({
  currentPassword: z.string().min(1, { message: 'Current password is required.' }),
  newUsername: z.string().min(3, { message: 'Username must be at least 3 characters.' }),
  newPassword: z.string().min(6, { message: 'New password must be at least 6 characters.' }),
  confirmPassword: z.string().min(6, { message: 'Please confirm your new password.' }),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "New passwords don't match.",
  path: ['confirmPassword'], // Set the error on the confirmPassword field
});

type SettingsFormData = z.infer<typeof settingsFormSchema>;

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState('');

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      currentPassword: '',
      newUsername: '', // Initialize with current username
      newPassword: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    const creds = getAdminCredentials();
    setCurrentUsername(creds.username);
    form.reset({
        currentPassword: '',
        newUsername: creds.username, // Set default username
        newPassword: '',
        confirmPassword: '',
    });
  }, [form]);


  const handleFormSubmit = (data: SettingsFormData) => {
    setIsLoading(true);
    setError(null);

    const storedCredentials = getAdminCredentials();

    // 1. Verify current password
    if (data.currentPassword !== storedCredentials.password) {
      setError('Incorrect current password.');
      form.setError('currentPassword', { type: 'manual', message: 'Incorrect current password.' });
      setIsLoading(false);
      return;
    }

    // 2. Save new credentials (replace with secure API call)
    try {
      saveAdminCredentials(data.newUsername, data.newPassword);
      toast({
        title: 'Credentials Updated Successfully',
        description: 'Your username and password have been changed.',
      });
      setCurrentUsername(data.newUsername); // Update displayed username
      form.reset({ // Reset form with new username, clear passwords
          currentPassword: '',
          newUsername: data.newUsername,
          newPassword: '',
          confirmPassword: '',
      });
      setError(null); // Clear any previous errors
    } catch (e) {
       console.error("Error saving credentials:", e);
       setError("Failed to save new credentials. Please try again.");
       toast({
        title: 'Update Failed',
        description: 'Could not update credentials. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 flex justify-center">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-primary">Admin Settings</CardTitle>
          <CardDescription>Change your admin login username and password.</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

             <p className="text-sm text-muted-foreground">Current Username: <strong>{currentUsername}</strong></p>

              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Enter your current password" {...field} disabled={isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="newUsername"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Username</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter new username" {...field} disabled={isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Enter new password (min. 6 characters)" {...field} disabled={isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Confirm your new password" {...field} disabled={isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               {/* Security Warning */}
              <Alert variant="default" className="bg-yellow-100 border-yellow-300 dark:bg-yellow-900/30 dark:border-yellow-700">
                 <AlertCircle className="h-4 w-4 text-yellow-700 dark:text-yellow-400" />
                 <AlertDescription className="text-yellow-800 dark:text-yellow-300 text-xs">
                   Credentials are stored insecurely in browser localStorage for this demo. Use strong, unique passwords in production with proper server-side authentication.
                 </AlertDescription>
              </Alert>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full transition-subtle" disabled={isLoading}>
                {isLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
