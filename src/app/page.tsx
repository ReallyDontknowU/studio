import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { BookOpenCheck, UserCog } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-background to-secondary">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-primary">SmartLibTrack</CardTitle>
          <CardDescription>Library Entry & Exit Management</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Link href="/admin/login" passHref>
            <Button variant="default" className="w-full transition-subtle">
              <UserCog className="mr-2" /> Admin Login
            </Button>
          </Link>
          <Link href="/student/login" passHref>
            <Button variant="outline" className="w-full transition-subtle">
               <BookOpenCheck className="mr-2" /> Student Login/Register
            </Button>
          </Link>
        </CardContent>
      </Card>
      <footer className="mt-8 text-sm text-muted-foreground">
        © {new Date().getFullYear()} SmartLibTrack. All rights reserved.
      </footer>
    </div>
  );
}
