'use client';

import React, { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { EntryLog } from '@/lib/types';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download, Filter, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BRANCHES } from '@/lib/constants'; // Assuming constants are defined
import { useToast } from '@/hooks/use-toast';

// Mock function to get logs (replace with actual data fetching)
const getEntryLogs = (): EntryLog[] => {
  // Retrieve logs from localStorage or fetch from API
  const storedLogs = localStorage.getItem('entryLogs');
  if (storedLogs) {
      // Parse and ensure dates are Date objects
      return JSON.parse(storedLogs).map((log: any) => ({
          ...log,
          timestamp: new Date(log.timestamp), // Convert string timestamp back to Date
      })).sort((a: EntryLog, b: EntryLog) => b.timestamp.getTime() - a.timestamp.getTime()); // Sort descending by time
  }
  return []; // Return empty array if no logs found
};


// Function to escape CSV fields if necessary
const escapeCsvField = (field: string | undefined | null): string => {
    if (field === null || field === undefined) {
        return '';
    }
    const stringField = String(field);
    // Check if the field contains comma, double quote, or newline
    if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n') || stringField.includes('\r')) {
        // Escape double quotes by doubling them and enclose the whole field in double quotes
        return `"${stringField.replace(/"/g, '""')}"`;
    }
    return stringField;
};


// Function to export data as CSV
const exportDataToCsv = (data: EntryLog[], toast: ReturnType<typeof useToast>['toast']) => {
    if (!data || data.length === 0) {
        toast({
            title: 'Export Failed',
            description: 'No data available to export.',
            variant: 'destructive',
        });
        return;
    }

    console.log(`Exporting ${data.length} records to CSV...`);

    const headers = ['Timestamp', 'Student Name', 'Student ID', 'Branch', 'Type'];
    const csvRows = [
        headers.join(','), // Header row
        ...data.map(log => [
            format(log.timestamp, 'yyyy-MM-dd HH:mm:ss'), // Standard format for CSV
            escapeCsvField(log.studentName),
            escapeCsvField(log.studentId),
            escapeCsvField(log.branch),
            escapeCsvField(log.type)
        ].join(','))
    ];

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });

    // Create a link and trigger the download
    const link = document.createElement('a');
    if (link.download !== undefined) { // Feature detection
        const url = URL.createObjectURL(blob);
        const currentDate = format(new Date(), 'yyyyMMdd');
        link.setAttribute('href', url);
        link.setAttribute('download', `library_logs_${currentDate}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url); // Clean up
        toast({
            title: 'Export Successful',
            description: `${data.length} log entries exported to CSV.`,
        });
    } else {
         toast({
             title: 'Export Failed',
             description: 'CSV download is not supported by your browser.',
             variant: 'destructive',
         });
    }
};


export default function AdminLogsPage() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<EntryLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<EntryLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBranch, setFilterBranch] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all'); // 'all', 'Entry', 'Exit'

  useEffect(() => {
    // Load logs on component mount
    const loadedLogs = getEntryLogs();
    setLogs(loadedLogs);
    setFilteredLogs(loadedLogs); // Initially show all logs
  }, []);

   // Filter logs whenever search term, branch, or type changes
  useEffect(() => {
    let currentLogs = logs;

    // Filter by search term (name or ID)
    if (searchTerm) {
      currentLogs = currentLogs.filter(log =>
        log.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.studentId.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by branch
    if (filterBranch !== 'all') {
      currentLogs = currentLogs.filter(log => log.branch === filterBranch);
    }

     // Filter by type
    if (filterType !== 'all') {
      currentLogs = currentLogs.filter(log => log.type === filterType);
    }

    setFilteredLogs(currentLogs);
  }, [searchTerm, filterBranch, filterType, logs]);

   const clearFilters = () => {
        setSearchTerm('');
        setFilterBranch('all');
        setFilterType('all');
   };


  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-primary">Entry/Exit Log</CardTitle>
          <CardDescription>View all recorded student library visits.</CardDescription>
        </CardHeader>
        <CardContent>
            {/* Filtering and Export Controls */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6 items-center">
               <Input
                  placeholder="Search by Name or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-xs"
               />
                <Select value={filterBranch} onValueChange={setFilterBranch}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by Branch" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Branches</SelectItem>
                        {BRANCHES.map(branch => (
                            <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                 <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="Entry">Entry Only</SelectItem>
                        <SelectItem value="Exit">Exit Only</SelectItem>
                    </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={clearFilters} title="Clear Filters" className={ (searchTerm || filterBranch !== 'all' || filterType !== 'all') ? 'visible' : 'invisible'}>
                    <X className="h-4 w-4" />
                </Button>
                <div className="flex-grow"></div> {/* Spacer */}
                 <Button onClick={() => exportDataToCsv(filteredLogs, toast)} variant="outline" size="sm">
                     <Download className="mr-2 h-4 w-4" /> Export CSV
                 </Button>
                 {/* Add Excel export button if needed */}
                 {/* <Button onClick={() => exportData(filteredLogs, 'excel')} variant="outline" size="sm">
                     <Download className="mr-2 h-4 w-4" /> Export Excel
                 </Button> */}
            </div>

          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableCaption>A list of recent student entries and exits.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Student ID</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{format(log.timestamp, 'Pp')}</TableCell> {/* Format date and time */}
                      <TableCell className="font-medium">{log.studentName}</TableCell>
                      <TableCell>{log.studentId}</TableCell>
                      <TableCell>{log.branch}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          log.type === 'Entry' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {log.type}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                      No logs found matching your criteria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {/* Optional: Add pagination controls here if expecting many logs */}
        </CardContent>
      </Card>
    </div>
  );
}
