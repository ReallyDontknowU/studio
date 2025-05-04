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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; // Corrected Alert import
import { AlertCircle, Save, KeyRound, Info } from 'lucide-react'; // Added KeyRound, Info
import { getAdminCredentials, saveAdminCredentials } from '@/lib/admin-auth';
import { Separator } from '@/components/ui/separator'; // Import Separator

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
    // Removed container div as layout provides it
    <div className="flex flex-col items-center gap-8">

      {/* Change Credentials Card */}
      <Card className="w-full max-w-lg card-enhanced">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent drop-shadow flex items-center gap-2">
            <KeyRound className="text-primary"/> Change Credentials
          </CardTitle>
          <CardDescription>Update your admin login username and password.</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)}>
            <CardContent className="space-y-4 pt-4">
              {error && (
                <Alert variant="destructive" className="animate-in fade-in duration-300">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

             <p className="text-sm text-muted-foreground">Current Username: <strong className="text-foreground">{currentUsername}</strong></p>

              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Enter your current password" {...field} disabled={isLoading} className="transition-subtle" />
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
                      <Input placeholder="Enter new username (min. 3 characters)" {...field} disabled={isLoading} className="transition-subtle" />
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
                      <Input type="password" placeholder="Enter new password (min. 6 characters)" {...field} disabled={isLoading} className="transition-subtle" />
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
                      <Input type="password" placeholder="Confirm your new password" {...field} disabled={isLoading} className="transition-subtle" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full transition-subtle hover:scale-[1.02]" disabled={isLoading}>
                {isLoading ? 'Saving...' : <><Save className="mr-2 h-4 w-4"/> Save Changes</>}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

      {/* API Key Information Card */}
      <Card className="w-full max-w-lg card-enhanced">
        <CardHeader>
            <CardTitle className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-cyan-500 drop-shadow flex items-center gap-2">
              <Info className="text-teal-500"/> API Key Setup
            </CardTitle>
            <CardDescription>Information on the Google AI API key required for AI features.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
           <Alert variant="default" className="border-l-4 border-primary">
              <Info className="h-4 w-4 text-primary" />
              <AlertTitle>Google AI API Key Setup</AlertTitle>
              <AlertDescription>
                This application uses Google Generative AI (Gemini) models via Genkit for features like ID card detection and data extraction. You need a Google AI API key for these features to work.
                <br /><br />
                <strong>How to get a key:</strong>
                <ol className="list-decimal list-inside mt-1 space-y-1 text-sm">
                  <li>Visit the <a href="https://ai.google.dev/" target="_blank" rel="noopener noreferrer" className="underline text-primary hover:text-primary/80">Google AI Developer site</a>.</li>
                  <li>Click on "Get API key in Google AI Studio" and follow the instructions to create an API key.</li>
                </ol>
                 <br />
                 <strong>How to configure the key:</strong>
                <ol className="list-decimal list-inside mt-1 space-y-1 text-sm">
                    <li><strong>Local Development:</strong> Open the `.env` file in the root of your project directory. Add the following line, replacing `YOUR_API_KEY_HERE` with your actual key:
                        <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto"><code>GOOGLE_GENAI_API_KEY=YOUR_API_KEY_HERE</code></pre>
                    </li>
                    <li><strong>Deployment (Vercel, Netlify, etc.):</strong> Do NOT commit your `.env` file. Instead, use your hosting provider's dashboard to set an environment variable named `GOOGLE_GENAI_API_KEY` with your API key as the value.</li>
                    <li><strong>Restart:</strong> After adding the key (especially locally), restart your application server for the change to take effect.</li>
                 </ol>
                 <br />
                 <strong className="text-destructive">Important:</strong> API keys are secrets. Keep them confidential and never commit them directly into your code or public repositories. Saving keys directly through this admin interface is not supported for security reasons.
              </AlertDescription>
           </Alert>
        </CardContent>
        <CardFooter>
            <p className="text-xs text-muted-foreground">Ensure your API key is kept confidential.</p>
        </CardFooter>
      </Card>

    </div>
  );
