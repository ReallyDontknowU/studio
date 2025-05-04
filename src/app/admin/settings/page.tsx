
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

  // Note: The application currently reads API keys directly from environment variables (.env file).
  // Implementing a feature to store API keys within the admin UI would require significant
  // backend changes (e.g., a secure database, API endpoints) and is beyond the scope of
  // simple frontend adjustments. This UI section is informational only.

  return (
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
            <CardDescription>Information on the API keys required for AI features.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
           <Alert variant="default" className="border-l-4 border-primary"> {/* Use default variant with custom border */}
              <Info className="h-4 w-4 text-primary" /> {/* Use primary color for icon */}
              <AlertTitle>Google AI API Key</AlertTitle>
              <AlertDescription>
                The application uses the Google Generative AI (Gemini) models for image analysis (ID card detection and data extraction). You need a Google AI API key for these features to work.
                <br /><br />
                <strong>How to get a key:</strong>
                <ol className="list-decimal list-inside mt-1 space-y-1 text-sm">
                  <li>Visit the <a href="https://ai.google.dev/" target="_blank" rel="noopener noreferrer" className="underline text-primary hover:text-primary/80">Google AI Developer site</a>.</li>
                  <li>Follow the instructions to create an API key.</li>
                  <li>Once you have the key, you need to set it as an environment variable named <strong>`GOOGLE_GENAI_API_KEY`</strong> in your project's <strong>`.env`</strong> file.</li>
                  <li>Restart the application after adding the key to the `.env` file.</li>
                </ol>
                <br />
                 <strong>Current Setup:</strong> API keys are currently managed via the <strong>`.env`</strong> file in the project's root directory. Storing keys directly in the admin interface is not implemented for security reasons.
              </AlertDescription>
           </Alert>
           {/* Removed Groq section as the model is removed */}
        </CardContent>
        <CardFooter>
            <p className="text-xs text-muted-foreground">Ensure your API keys are kept confidential and are not exposed in client-side code or public repositories.</p>
        </CardFooter>
      </Card>

    </div>
  );
}
