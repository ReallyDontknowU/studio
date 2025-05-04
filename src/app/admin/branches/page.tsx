
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Trash2, Edit, Save, X } from 'lucide-react'; // Added X icon
import { BRANCHES as DEFAULT_BRANCHES } from '@/lib/constants';
import type { Branch } from '@/lib/types';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

// Helper functions to manage branches in localStorage (replace with API calls)
const getBranches = (): Branch[] => {
  const stored = localStorage.getItem('libraryBranches');
  return stored ? JSON.parse(stored) : [...DEFAULT_BRANCHES]; // Start with defaults if none stored
};

const saveBranches = (branches: Branch[]): void => {
  localStorage.setItem('libraryBranches', JSON.stringify(branches));
};

export default function AdminBranchesPage() {
  const { toast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [newBranchName, setNewBranchName] = useState('');
  const [editingBranch, setEditingBranch] = useState<{ index: number; name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false); // For potential async operations

  useEffect(() => {
    // Load branches on mount
    setBranches(getBranches());
  }, []);

  const handleAddBranch = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newBranchName.trim()) {
      toast({ title: 'Error', description: 'Branch name cannot be empty.', variant: 'destructive' });
      return;
    }
    if (branches.some(b => b.toLowerCase() === newBranchName.trim().toLowerCase())) {
        toast({ title: 'Error', description: 'Branch already exists.', variant: 'destructive' });
        return;
    }

    setIsLoading(true); // Simulate saving
    // TODO: Replace with API call
    const updatedBranches = [...branches, newBranchName.trim()];
    saveBranches(updatedBranches);
    setBranches(updatedBranches);
    setNewBranchName('');
    setIsLoading(false);
    toast({ title: 'Success', description: `Branch "${newBranchName.trim()}" added.` });
  };

   const handleDeleteBranch = (indexToDelete: number) => {
       // TODO: Add check if branch is used by any student before deleting
       setIsLoading(true);
       const branchNameToDelete = branches[indexToDelete];
       // TODO: Replace with API call
       const updatedBranches = branches.filter((_, index) => index !== indexToDelete);
       saveBranches(updatedBranches);
       setBranches(updatedBranches);
       setIsLoading(false);
       toast({ title: 'Success', description: `Branch "${branchNameToDelete}" deleted.`, variant: 'destructive' });
   };

    const startEditing = (index: number) => {
        setEditingBranch({ index, name: branches[index] });
    };

    const handleEditChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (editingBranch) {
            setEditingBranch({ ...editingBranch, name: event.target.value });
        }
    };

    const saveEdit = () => {
        if (!editingBranch || !editingBranch.name.trim()) {
            toast({ title: 'Error', description: 'Branch name cannot be empty.', variant: 'destructive' });
            return;
        }
        // Check if edited name conflicts with another existing branch (excluding itself)
        if (branches.some((b, i) => i !== editingBranch.index && b.toLowerCase() === editingBranch.name.trim().toLowerCase())) {
             toast({ title: 'Error', description: 'Another branch with this name already exists.', variant: 'destructive' });
             return;
        }

        setIsLoading(true);
        // TODO: Replace with API call
        const updatedBranches = branches.map((branch, index) =>
            index === editingBranch.index ? editingBranch.name.trim() : branch
        );
        saveBranches(updatedBranches);
        setBranches(updatedBranches);
        setEditingBranch(null);
        setIsLoading(false);
        toast({ title: 'Success', description: 'Branch updated.' });
    };

    const cancelEdit = () => {
        setEditingBranch(null);
    };


  return (
    // Removed container div, place Card directly or wrap in a simple div if needed
    <div className="flex justify-center">
      {/* Apply enhanced card style */}
      <Card className="w-full max-w-2xl card-enhanced">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent drop-shadow">Manage Branches</CardTitle>
          <CardDescription>Add, edit, or remove library department branches.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4"> {/* Added pt-4 */}
          {/* Add New Branch Form */}
          <form onSubmit={handleAddBranch} className="flex flex-col sm:flex-row gap-4 mb-6 items-end">
            <div className="flex-grow space-y-1 w-full sm:w-auto">
              <Label htmlFor="new-branch">New Branch Name</Label>
              <Input
                id="new-branch"
                placeholder="e.g., Information Technology"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                disabled={isLoading}
                className="transition-subtle" // Added transition
              />
            </div>
            <Button type="submit" disabled={isLoading || !newBranchName.trim()} className="transition-subtle hover:scale-[1.02] w-full sm:w-auto">
              <PlusCircle className="mr-2 h-4 w-4" /> {isLoading ? 'Adding...' : 'Add Branch'}
            </Button>
          </form>

          {/* Branch List */}
          <h3 className="text-lg font-semibold mb-3 text-foreground">Existing Branches</h3>
          {branches.length > 0 ? (
            <ul className="space-y-3">
              {branches.map((branch, index) => (
                <li key={index} className="flex items-center justify-between p-3 border rounded-md bg-muted/50 hover:bg-muted/80 transition-colors duration-200 shadow-sm hover:shadow-md">
                  {editingBranch?.index === index ? (
                     <div className="flex-grow flex items-center gap-2 mr-2 animate-in fade-in duration-200">
                        <Input
                            value={editingBranch.name}
                            onChange={handleEditChange}
                            className="h-8 flex-grow"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                        />
                        <Button onClick={saveEdit} size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700 transition-transform hover:scale-110"> <Save className="h-4 w-4"/> </Button>
                        <Button onClick={cancelEdit} size="icon" variant="ghost" className="h-8 w-8 text-gray-500 hover:text-gray-700 transition-transform hover:scale-110"> <X className="h-4 w-4"/> </Button>
                     </div>
                  ) : (
                    <span className="flex-grow text-sm font-medium mr-2">{branch}</span>
                  )}

                  {!editingBranch && (
                     <div className="flex gap-1 animate-in fade-in duration-200"> {/* Reduced gap */}
                         <Button onClick={() => startEditing(index)} variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:text-blue-800 transition-transform hover:scale-110" title="Edit Branch">
                             <Edit className="h-4 w-4" />
                         </Button>
                         {/* Delete Confirmation Dialog */}
                         <AlertDialog>
                            <AlertDialogTrigger asChild>
                               <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-red-700 transition-transform hover:scale-110" title="Delete Branch">
                                  <Trash2 className="h-4 w-4" />
                               </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                               <AlertDialogHeader>
                                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                     This action cannot be undone. This will permanently delete the branch "{branch}". Make sure no students are assigned to this branch.
                                  </AlertDialogDescription>
                               </AlertDialogHeader>
                               <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteBranch(index)} className="bg-destructive hover:bg-destructive/90">
                                     Delete
                                  </AlertDialogAction>
                               </AlertDialogFooter>
                            </AlertDialogContent>
                         </AlertDialog>
                     </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-center py-4">No branches added yet.</p>
          )}
        </CardContent>
        {/* <CardFooter>
          {/* Optional footer content
        </CardFooter> */}
      </Card>
    </div>
  );
}
