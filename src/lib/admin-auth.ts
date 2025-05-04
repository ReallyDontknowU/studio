
'use client'; // Necessary if used in client components directly, otherwise remove

import type { AdminCredentials } from './types';

const ADMIN_CREDENTIALS_KEY = 'adminCredentials';

// Default credentials (only used if nothing is stored)
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'password';

// Function to get credentials from localStorage
export const getAdminCredentials = (): AdminCredentials => {
  if (typeof window === 'undefined') {
    // Return default or throw error if on server
    console.warn("Attempted to get admin credentials on the server. Returning defaults.");
    return { username: DEFAULT_ADMIN_USERNAME, password: DEFAULT_ADMIN_PASSWORD };
  }
  try {
    const stored = localStorage.getItem(ADMIN_CREDENTIALS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error("Error reading admin credentials from localStorage:", error);
  }
  // Return defaults if not found or error occurred
  return { username: DEFAULT_ADMIN_USERNAME, password: DEFAULT_ADMIN_PASSWORD };
};

// Function to save credentials to localStorage
export const saveAdminCredentials = (username: string, password: string): void => {
   if (typeof window === 'undefined') {
     console.error("Attempted to save admin credentials on the server. Operation skipped.");
     return;
   }
  if (!username || !password) {
     console.error("Attempted to save empty username or password.");
     throw new Error("Username and password cannot be empty.");
  }
  try {
    const credentials: AdminCredentials = { username, password };
    localStorage.setItem(ADMIN_CREDENTIALS_KEY, JSON.stringify(credentials));
    console.log("Admin credentials saved to localStorage.");
  } catch (error) {
    console.error("Error saving admin credentials to localStorage:", error);
    throw new Error("Failed to save credentials."); // Re-throw to indicate failure
  }
};

// Function to initialize default credentials if none exist
export const initializeAdminCredentials = (): void => {
  if (typeof window === 'undefined') {
    return; // Do nothing on the server
  }
  try {
    const stored = localStorage.getItem(ADMIN_CREDENTIALS_KEY);
    if (!stored) {
      saveAdminCredentials(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
      console.log("Initialized default admin credentials.");
    }
  } catch (error) {
     console.error("Error during admin credential initialization:", error);
  }
};
