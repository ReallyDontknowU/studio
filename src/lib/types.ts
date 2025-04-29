export type Branch = 'Computer' | 'Electronic' | 'Civil' | 'Mechanical' | 'Electrical' | string; // Allow custom branches
export type YearOfStudy = 'FY' | 'SY' | 'TY';

export interface Student {
  id: string; // Unique identifier, matches barcode number
  name: string;
  branch: Branch;
  rollNo: string;
  yearOfStudy: YearOfStudy;
  barcodeImageUri?: string; // Optional: Store the captured barcode image URI
  createdAt: Date;
}

export type EntryType = 'Entry' | 'Exit';

export interface EntryLog {
  id: string; // Unique log entry ID
  studentId: string; // References Student.id
  studentName: string; // Denormalized for easier display
  branch: Branch; // Denormalized
  timestamp: Date;
  type: EntryType; // 'Entry' or 'Exit'
}

// Type for data extracted from barcode/ID card image
export interface ExtractedIdData {
  idNumber?: string;
  studentName?: string;
  branch?: string;
  rollNo?: string;
  yearOfStudy?: string; // Use string initially from AI, convert later
}
