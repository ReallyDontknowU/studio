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

// Mock function to export data (replace with actual implementation)
const exportData = (data: EntryLog[], format: 'csv' | 'excel') => {
    console.log(`Exporting ${data.length} records to ${format}...`);
    // TODO: Implement actual CSV/Excel export logic (e.g., using libraries like papaparse or xlsx)
    alert(`Exporting to ${format} is not yet implemented in this demo.`);
};


export default function AdminLogsPage() {
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
                 <Button onClick={() => exportData(filteredLogs, 'csv')} variant="outline" size="sm">
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
                          log.type === 'Entry' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
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
