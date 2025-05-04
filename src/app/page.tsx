
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { UserCog, ScanBarcode } from 'lucide-react'; // Added ScanBarcode icon

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-futuristic-light dark:bg-gradient-futuristic-dark">
      {/* Apply enhanced card style */}
      <Card className="w-full max-w-md card-enhanced">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-primary drop-shadow-sm">SmartLibTrack</CardTitle>
          <CardDescription>Futuristic Library Entry & Exit Management</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 items-center pt-4"> {/* Added pt-4 */}
          {/* Public Scan Button */}
          <Link href="/scan" passHref className="w-full max-w-xs">
            <Button variant="secondary" className="w-full transition-subtle hover:scale-[1.02]">
              <ScanBarcode className="mr-2" /> Record Entry/Exit
            </Button>
          </Link>
          <div className="w-full max-w-xs text-center my-1 text-muted-foreground">
            or
          </div>
          {/* Admin Login Button */}
          <Link href="/admin/login" passHref className="w-full max-w-xs">
            <Button variant="default" className="w-full transition-subtle hover:scale-[1.02]">
              <UserCog className="mr-2" /> Admin Login
            </Button>
          </Link>
        </CardContent>
      </Card>
      <footer className="mt-8 text-sm text-muted-foreground/80"> {/* Slightly muted footer */}
        © {new Date().getFullYear()} SmartLibTrack. All rights reserved.
      </footer>
    </div>
  );
}
