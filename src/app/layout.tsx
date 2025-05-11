import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider"; // Import ThemeProvider
import { ThemeToggleButton } from '@/components/theme-toggle-button'; // Import ThemeToggleButton
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react'; // Import Home icon
import { NetworkStatusIndicator } from '@/components/network-status-indicator'; // Import NetworkStatusIndicator

export const metadata: Metadata = {
  title: 'SmartLibTrack',
  description: 'Library Entry and Exit Tracking System',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.className}`} suppressHydrationWarning> {/* suppressHydrationWarning added for next-themes */}
      <head/>
      <body className={`antialiased flex flex-col min-h-screen bg-background text-foreground`} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange // Optional: prevents transitions on initial load
        >
          {/* Simple Header */}
          <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-14 items-center justify-between">
               <Link href="/" className="flex items-center space-x-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-primary"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                  <span className="font-bold inline-block text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent drop-shadow">SmartLibTrack</span>
               </Link>
               <div className="flex items-center gap-2">
                 {/* Add Home button to easily navigate back */}
                 <Link href="/" passHref>
                   <Button variant="ghost" size="icon" aria-label="Home">
                     <Home className="h-5 w-5" />
                   </Button>
                 </Link>
                  {/* Network Status Indicator */}
                 <NetworkStatusIndicator />
                 <ThemeToggleButton />
               </div>
            </div>
          </header>

          <main className="flex-grow container mx-auto px-4 py-8"> {/* Added container for consistent padding */}
            {children}
          </main>
          <Toaster />
           <footer className="py-6 md:px-8 md:py-0 border-t">
               <div className="container flex flex-col items-center justify-center gap-4 md:h-20 md:flex-row">
                 <p className="text-center text-sm leading-loose text-muted-foreground">
                   © {new Date().getFullYear()} SmartLibTrack. All rights reserved.
                 </p>
               </div>
           </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
