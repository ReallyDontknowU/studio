import type { Branch, YearOfStudy } from './types';

export const BRANCHES: Branch[] = [
  'Computer',
  'Electronic',
  'Civil',
  'Mechanical', // Corrected typo
  'Electrical', // Corrected typo
];

export const YEARS_OF_STUDY: YearOfStudy[] = ['FY', 'SY', 'TY'];

export const MIN_LIBRARY_INTERVAL_SECONDS = 10; // Minimum 10 seconds between entry/exit scans
