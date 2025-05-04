

'use client';

import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form'; // Import FormDescription
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Save, KeyRound, Info, ShieldAlert } from 'lucide-react'; // Added ShieldAlert
import { getAdminCredentials, saveAdminCredentials } from '@/lib/admin-auth';
import { Separator } from '@/components/ui/separator';
import { saveApiKeyAction } from '@/actions/save-api-key'; // Import the server action

// Zod schema for credentials validation
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

// Zod schema for API key validation
const apiKeyFormSchema = z.object({
    apiKey: z.string().min(10, { message: 'API Key seems too short. Please check.' }), // Basic validation
});

type ApiKeyFormData = z.infer<typeof apiKeyFormSchema>;


export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [isCredentialsLoading, setIsCredentialsLoading] = useState(false);
  const [isApiKeyLoading, setIsApiKeyLoading] = useState(false);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null); // Separate error state for API key
  const [currentUsername, setCurrentUsername] = useState('');

  // Form for credentials
  const credentialsForm = useForm<SettingsFormData>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      currentPassword: '',
      newUsername: '', // Initialize with current username
      newPassword: '',
      confirmPassword: '',
    },
  });

   // Form for API Key
   const apiKeyForm = useForm<ApiKeyFormData>({
      resolver: zodResolver(apiKeyFormSchema),
      defaultValues: {
          apiKey: '',
      },
   });


  useEffect(() => {
    const creds = getAdminCredentials();
    setCurrentUsername(creds.username);
    credentialsForm.reset({
        currentPassword: '',
        newUsername: creds.username, // Set default username
        newPassword: '',
        confirmPassword: '',
    });
    // API key field is intentionally left blank for security on load
  }, [credentialsForm]);


  const handleCredentialsSubmit = (data: SettingsFormData) => {
    setIsCredentialsLoading(true);
    setCredentialsError(null);

    const storedCredentials = getAdminCredentials();

    // 1. Verify current password
    if (data.currentPassword !== storedCredentials.password) {
      setCredentialsError('Incorrect current password.');
      credentialsForm.setError('currentPassword', { type: 'manual', message: 'Incorrect current password.' });
      setIsCredentialsLoading(false);
      return;
    }

    // 2. Save new credentials (replace with secure API call in production)
    try {
      saveAdminCredentials(data.newUsername, data.newPassword);
      toast({
        title: 'Credentials Updated Successfully',
        description: 'Your username and password have been changed.',
      });
      setCurrentUsername(data.newUsername); // Update displayed username
      credentialsForm.reset({ // Reset form with new username, clear passwords
          currentPassword: '',
          newUsername: data.newUsername,
          newPassword: '',
          confirmPassword: '',
      });
      setCredentialsError(null); // Clear any previous errors
    } catch (e) {
       console.error("Error saving credentials:", e);
       setCredentialsError("Failed to save new credentials. Please try again.");
       toast({
        title: 'Update Failed',
        description: 'Could not update credentials. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsCredentialsLoading(false);
    }
  };

  // Handler for API Key form submission
  const handleApiKeySubmit = async (data: ApiKeyFormData) => {
    setIsApiKeyLoading(true);
    setApiKeyError(null);

    try {
      const result = await saveApiKeyAction(data.apiKey);

      if (result.success) {
        toast({
          title: 'API Key Saved Successfully',
          description: 'The Google AI API Key has been updated in the .env file. Restart the server for changes to take effect.',
        });
        apiKeyForm.reset({ apiKey: '' }); // Clear the input field after successful save
      } else {
        throw new Error(result.error || 'Unknown error occurred');
      }
    } catch (error: any) {
      console.error("Error saving API key:", error);
      const errorMessage = error.message || 'Failed to save the API key to the .env file.';
      setApiKeyError(errorMessage);
      toast({
        title: 'API Key Save Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsApiKeyLoading(false);
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
        <Form {...credentialsForm}>
          <form onSubmit={credentialsForm.handleSubmit(handleCredentialsSubmit)}>
            <CardContent className="space-y-4 pt-4">
              {credentialsError && (
                <Alert variant="destructive" className="animate-in fade-in duration-300">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{credentialsError}</AlertDescription>
                </Alert>
              )}

             <p className="text-sm text-muted-foreground">Current Username: <strong className="text-foreground">{currentUsername}</strong></p>

              <FormField
                control={credentialsForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Enter your current password" {...field} disabled={isCredentialsLoading} className="transition-subtle" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={credentialsForm.control}
                name="newUsername"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Username</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter new username (min. 3 characters)" {...field} disabled={isCredentialsLoading} className="transition-subtle" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={credentialsForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Enter new password (min. 6 characters)" {...field} disabled={isCredentialsLoading} className="transition-subtle" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={credentialsForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Confirm your new password" {...field} disabled={isCredentialsLoading} className="transition-subtle" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full transition-subtle hover:scale-[1.02]" disabled={isCredentialsLoading}>
                {isCredentialsLoading ? 'Saving...' : <><Save className="mr-2 h-4 w-4"/> Save Credential Changes</>}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

      <Separator className="my-0" />

       {/* API Key Management Card */}
       <Card className="w-full max-w-lg card-enhanced">
          <CardHeader>
             <CardTitle className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-cyan-500 drop-shadow flex items-center gap-2">
                <KeyRound className="text-teal-500"/> Manage Google AI API Key
             </CardTitle>
             <CardDescription>Enter and save your Google AI API key required for AI features.</CardDescription>
          </CardHeader>
          <Form {...apiKeyForm}>
             <form onSubmit={apiKeyForm.handleSubmit(handleApiKeySubmit)}>
                <CardContent className="space-y-4 pt-4">
                    <Alert variant="destructive" className="border-l-4 border-destructive">
                        <ShieldAlert className="h-5 w-5 text-destructive" />
                        <AlertTitle className="font-semibold">Security Warning!</AlertTitle>
                        <AlertDescription className="text-xs">
                           Saving API keys directly via the UI to a `.env` file is **highly insecure** and **not recommended for production environments**. Environment variables should be managed securely through your deployment platform. This feature is provided for local development convenience only. **Do not commit your `.env` file to version control.**
                        </AlertDescription>
                    </Alert>

                    {apiKeyError && (
                        <Alert variant="destructive" className="animate-in fade-in duration-300">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{apiKeyError}</AlertDescription>
                        </Alert>
                    )}

                    <FormField
                        control={apiKeyForm.control}
                        name="apiKey"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Google AI API Key</FormLabel>
                                <FormControl>
                                    <Input
                                        type="password" // Use password type to obscure the key
                                        placeholder="Paste your Google AI API Key here"
                                        {...field}
                                        disabled={isApiKeyLoading}
                                        className="transition-subtle font-mono text-xs" // Style for key input
                                    />
                                </FormControl>
                                <FormMessage />
                                <FormDescription className="text-xs">
                                    Get your key from <a href="https://ai.google.dev/" target="_blank" rel="noopener noreferrer" className="underline text-primary hover:text-primary/80">Google AI Studio</a>. The key will be saved to the `.env` file as `GOOGLE_GENAI_API_KEY`.
                                </FormDescription>
                            </FormItem>
                        )}
                    />
                </CardContent>
                <CardFooter>
                    <Button type="submit" className="w-full transition-subtle hover:scale-[1.02]" disabled={isApiKeyLoading}>
                        {isApiKeyLoading ? 'Saving Key...' : <><Save className="mr-2 h-4 w-4"/> Save API Key</>}
                    </Button>
                </CardFooter>
             </form>
          </Form>
       </Card>

      {/* API Key Information Card (Existing) */}
      <Card className="w-full max-w-lg card-enhanced">
        <CardHeader>
            <CardTitle className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-cyan-500 drop-shadow flex items-center gap-2">
              <Info className="text-teal-500"/> API Key Setup Information
            </CardTitle>
            <CardDescription>General information on the Google AI API key.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
           <Alert variant="default" className="border-l-4 border-primary">
              <Info className="h-4 w-4 text-primary" />
              <AlertTitle>Google AI API Key Requirement</AlertTitle>
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
                 <p className="text-sm mt-1">
                    You can use the form above to save the key directly to the project's `.env` file for local development convenience. Alternatively, follow these standard methods:
                 </p>
                <ol className="list-decimal list-inside mt-1 space-y-1 text-sm">
                    <li><strong>Local Development (Manual):</strong> Open the `.env` file in the root of your project directory. Add the following line, replacing `YOUR_API_KEY_HERE` with your actual key:
                        <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto"><code>GOOGLE_GENAI_API_KEY=YOUR_API_KEY_HERE</code></pre>
                    </li>
                    <li><strong>Deployment (Vercel, Netlify, etc.):</strong> Use your hosting provider's dashboard to set an environment variable named `GOOGLE_GENAI_API_KEY` with your API key as the value.</li>
                    <li><strong>Restart Required:</strong> After adding or changing the key (especially locally), **restart your application server** for the change to take effect.</li>
                 </ol>
                 <br />
                 <strong className="text-destructive">Important Security Note:</strong> API keys are sensitive secrets. Keep them confidential and avoid committing them to version control (like Git). The `.env` file is typically included in `.gitignore` for this reason. Saving via the UI above modifies this local file directly.
              </AlertDescription>
           </Alert>
        </CardContent>
        <CardFooter>
            <p className="text-xs text-muted-foreground">Always ensure your API key is kept confidential and managed securely.</p>
        </CardFooter>
      </Card>

    </div>
  );
}
