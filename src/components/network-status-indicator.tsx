
'use client';

import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function NetworkStatusIndicator() {
  // Initialize state based on current navigator status, default to true if window is undefined (SSR)
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    // Ensure this effect only runs on the client
    if (typeof window === 'undefined') {
      return;
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup function to remove event listeners
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []); // Empty dependency array ensures this runs only once on mount and cleans up on unmount

  return (
    <TooltipProvider delayDuration={100}>
        <Tooltip>
            <TooltipTrigger asChild>
                <div className={`flex items-center justify-center p-1 rounded-full transition-colors duration-300 ${isOnline ? 'text-green-600 dark:text-green-400' : 'text-destructive dark:text-red-500'}`}>
                    {isOnline ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
                    <span className="sr-only">{isOnline ? 'Online' : 'Offline'}</span>
                </div>
            </TooltipTrigger>
            <TooltipContent>
                <p>{isOnline ? 'Internet connection is active.' : 'You are currently offline.'}</p>
            </TooltipContent>
        </Tooltip>
    </TooltipProvider>
  );
}
