import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans'; // Import only GeistSans
// import { GeistMono } from 'geist/font/mono';   // Remove GeistMono import
import './globals.css';
import { Toaster } from "@/components/ui/toaster"; // Import Toaster

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
    // Apply only GeistSans font class directly to the html tag
    <html lang="en" className={`${GeistSans.className}`}>
      <body className={`antialiased flex flex-col min-h-screen bg-background text-foreground`}> {/* Removed font variables */}
        <main className="flex-grow">
          {children}
        </main>
        <Toaster /> {/* Add Toaster here */}
      </body>
    </html>
  );
}
