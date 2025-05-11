'use client';

import React, { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { EntryLog } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download, Filter, X, FileText, Calendar } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BRANCHES } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DatePicker } from '@/components/ui/date-picker';

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
            description: 'No data available to export as CSV.',
            variant: 'destructive',
        });
        return;
    }

    console.log(`Exporting ${data.length} records to CSV...`);

    const headers = ['Timestamp', 'Student Name', 'Student ID', 'Branch', 'Type', 'Image Match']; // Added Image Match header
    const csvRows = [
        headers.join(','), // Header row
        ...data.map(log => [
            format(log.timestamp, 'yyyy-MM-dd HH:mm:ss'), // Standard format for CSV
            escapeCsvField(log.studentName),
            escapeCsvField(log.studentId),
            escapeCsvField(log.branch),
            escapeCsvField(log.type),
            escapeCsvField(log.imageMatch === undefined ? 'N/A' : log.imageMatch ? 'Yes' : 'No') // Handle image match status
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

// Function to export data as PDF
const exportDataToPdf = (data: EntryLog[], toast: ReturnType<typeof useToast>['toast']) => {
  if (!data || data.length === 0) {
      toast({
          title: 'Export Failed',
          description: 'No data available to export as PDF.',
          variant: 'destructive',
      });
      return;
  }

  console.log(`Exporting ${data.length} records to PDF...`);

  try {
    const doc = new jsPDF();
    const tableColumn = ["Timestamp", "Student Name", "Student ID", "Branch", "Type", "Image Match"]; // Added Image Match
    const tableRows: (string | null | undefined)[][] = [];

    data.forEach(log => {
      const logData = [
        format(log.timestamp, 'yyyy-MM-dd HH:mm:ss'), // Consistent format
        log.studentName,
        log.studentId,
        log.branch,
        log.type,
        log.imageMatch === undefined ? 'N/A' : log.imageMatch ? 'Yes' : 'No' // Handle image match status
      ];
      tableRows.push(logData);
    });

    doc.setFontSize(18);
    doc.text("Library Entry/Exit Log", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on: ${format(new Date(), 'PPpp')}`, 14, 29);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 35,
      theme: 'grid', // or 'striped', 'plain'
      headStyles: { fillColor: [22, 160, 133] }, // Example header style (consider using theme colors)
      styles: { fontSize: 10, cellPadding: 2 }, // Added cellPadding
      columnStyles: {
          0: { cellWidth: 35 }, // Timestamp
          1: { cellWidth: 40 }, // Name
          2: { cellWidth: 25 }, // ID
          3: { cellWidth: 25 }, // Branch
          4: { cellWidth: 18 }, // Type
          5: { cellWidth: 22 }, // Image Match
      }
    });

    const currentDate = format(new Date(), 'yyyyMMdd');
    doc.save(`library_logs_${currentDate}.pdf`);

    toast({
        title: 'Export Successful',
        description: `${data.length} log entries exported to PDF.`,
    });
  } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
          title: 'Export Failed',
          description: 'An error occurred while generating the PDF.',
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
  const [filterType, setFilterType] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined
  });

  useEffect(() => {
    const loadedLogs = getEntryLogs();
    setLogs(loadedLogs);
    setFilteredLogs(loadedLogs);
  }, []);

  // Filter logs whenever search term, branch, type, or date range changes
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

    // Filter by date range
    if (dateRange.from || dateRange.to) {
      currentLogs = currentLogs.filter(log => {
        const logDate = new Date(log.timestamp);
        if (dateRange.from && logDate < dateRange.from) return false;
        if (dateRange.to) {
          const toDate = new Date(dateRange.to);
          toDate.setHours(23, 59, 59, 999); // Include the entire end date
          if (logDate > toDate) return false;
        }
        return true;
      });
    }

    setFilteredLogs(currentLogs);
  }, [searchTerm, filterBranch, filterType, dateRange, logs]);

  const clearFilters = () => {
    setSearchTerm('');
    setFilterBranch('all');
    setFilterType('all');
    setDateRange({ from: undefined, to: undefined });
    toast({ title: "Filters Cleared", description: "Showing all log entries." });
  };

  const hasActiveFilters = searchTerm || filterBranch !== 'all' || filterType !== 'all' || dateRange.from || dateRange.to;

  return (
    <div>
      <Card className="card-enhanced">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent drop-shadow">Entry/Exit Log</CardTitle>
          <CardDescription>View all recorded student library visits.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {/* Filtering and Export Controls */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6 items-center flex-wrap p-4 border rounded-md bg-muted/50">
            <Input
              placeholder="Search by Name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs flex-grow sm:flex-grow-0 transition-subtle"
            />
            
            <Select value={filterBranch} onValueChange={setFilterBranch}>
              <SelectTrigger className="w-full sm:w-[180px] transition-subtle">
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
              <SelectTrigger className="w-full sm:w-[160px] transition-subtle">
                <SelectValue placeholder="Filter by Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Entry">Entry Only</SelectItem>
                <SelectItem value="Exit">Exit Only</SelectItem>
              </SelectContent>
            </Select>

            {/* Date Range Picker */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <DatePicker
                  date={dateRange.from}
                  onSelect={(date) => setDateRange({ ...dateRange, from: date })}
                  placeholder="From"
                  className="w-[130px]"
                />
              </div>
              <span className="text-muted-foreground">to</span>
              <div className="flex items-center gap-2">
                <DatePicker
                  date={dateRange.to}
                  onSelect={(date) => setDateRange({ ...dateRange, to: date })}
                  placeholder="To"
                  className="w-[130px]"
                />
              </div>
            </div>

            <Button variant="ghost" size="icon" onClick={clearFilters} title="Clear Filters" 
              className={`transition-opacity ${hasActiveFilters ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <X className="h-4 w-4" />
            </Button>

            <div className="hidden sm:flex-grow"></div>

            {/* Export Buttons Group */}
            <div className="flex gap-2">
              <Button onClick={() => exportDataToCsv(filteredLogs, toast)} variant="outline" size="sm" className="transition-subtle hover:scale-[1.03]">
                <Download className="mr-2 h-4 w-4" /> CSV
              </Button>
              <Button onClick={() => exportDataToPdf(filteredLogs, toast)} variant="outline" size="sm" className="transition-subtle hover:scale-[1.03]">
                <FileText className="mr-2 h-4 w-4" /> PDF
              </Button>
            </div>
          </div>

          <div className="border rounded-md overflow-hidden shadow-inner bg-background">
            <Table>
              <TableCaption>A list of recent student entries and exits.</TableCaption>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Student ID</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Image Match</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id} className="transition-colors duration-150 hover:bg-muted/60">
                      <TableCell>{format(log.timestamp, 'Pp')}</TableCell>
                      <TableCell className="font-medium">{log.studentName}</TableCell>
                      <TableCell>{log.studentId}</TableCell>
                      <TableCell>{log.branch}</TableCell>
                      <TableCell>
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${
                          log.type === 'Entry' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                        }`}>
                          {log.type}
                        </span>
                      </TableCell>
                       <TableCell>
                           <span className={`text-xs font-medium ${
                               log.imageMatch === true ? 'text-green-600 dark:text-green-400' :
                               log.imageMatch === false ? 'text-yellow-600 dark:text-yellow-400' :
                               'text-muted-foreground'
                           }`}>
                               {log.imageMatch === undefined ? 'N/A' : log.imageMatch ? 'Yes' : 'No'}
                           </span>
                        </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      {hasActiveFilters ? 'No logs found matching your criteria.' : 'No log entries yet.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
