'use server';
/**
 * @fileOverview A Genkit flow that extracts student ID information from an ID card image for admin use.
 *
 * - adminExtractBarcodeData - A function that handles the extraction of barcode data.
 * - AdminExtractBarcodeDataInput - The input type for the adminExtractBarcodeData function.
 * - AdminExtractBarcodeDataOutput - The return type for the adminExtractBarcodeData function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const AdminExtractBarcodeDataInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of a student ID card, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type AdminExtractBarcodeDataInput = z.infer<typeof AdminExtractBarcodeDataInputSchema>;

const AdminExtractBarcodeDataOutputSchema = z.object({
  studentId: z.string().describe('The student ID extracted from the barcode image or text below it.'),
  studentName: z.string().optional().describe('The name of the student extracted from the ID card, if available.'),
  branch: z.string().optional().describe('The branch of the student extracted from the ID card, if available.'),
  rollNo: z.string().optional().describe('The roll number of the student extracted from the ID card, if available.'),
  yearOfStudy: z.string().optional().describe('The year of study of the student extracted from the ID card, if available.'),
});
export type AdminExtractBarcodeDataOutput = z.infer<typeof AdminExtractBarcodeDataOutputSchema>;

export async function adminExtractBarcodeData(input: AdminExtractBarcodeDataInput): Promise<AdminExtractBarcodeDataOutput> {
  return adminExtractBarcodeDataFlow(input);
}

const adminExtractBarcodeDataPrompt = ai.definePrompt({
  name: 'adminExtractBarcodeDataPrompt',
  input: {
    schema: z.object({
      photoDataUri: z
        .string()
        .describe(
          "A photo of a student ID card, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
        ),
    }),
  },
  output: {
    schema: z.object({
      studentId: z.string().describe('The student ID extracted from the barcode image or text below it.'),
      studentName: z.string().optional().describe('The name of the student extracted from the ID card, if available.'),
      branch: z.string().optional().describe('The branch of the student extracted from the ID card, if available.'),
      rollNo: z.string().optional().describe('The roll number of the student extracted from the ID card, if available.'),
      yearOfStudy: z.string().optional().describe('The year of study of the student extracted from the ID card, if available.'),
    }),
  },
  prompt: `You are an expert data extraction specialist.

You will be given an image of a student ID card. Your primary goal is to extract the student's ID number, which is usually found below the barcode or is the barcode's content itself. Additionally, try to extract the student's name, branch, roll number, and year of study if clearly visible on the card.

Image: {{media url=photoDataUri}}

Focus on extracting the ID number accurately. For other fields (name, branch, rollNo, yearOfStudy), extract them only if they are clearly present and legible. Do not invent information.

Output the information in JSON format according to the schema. If a field other than studentId is not available or illegible, omit it or return null/undefined for that optional field. Ensure studentId is always returned, even if it's potentially incorrect based on the image; return an empty string for studentId only if absolutely nothing resembling an ID can be found.
`,
});

const adminExtractBarcodeDataFlow = ai.defineFlow<
  typeof AdminExtractBarcodeDataInputSchema,
  typeof AdminExtractBarcodeDataOutputSchema
>(
  {
    name: 'adminExtractBarcodeDataFlow',
    inputSchema: AdminExtractBarcodeDataInputSchema,
    outputSchema: AdminExtractBarcodeDataOutputSchema,
  },
  async input => {
    try {
        const {output} = await adminExtractBarcodeDataPrompt(input);
        // Ensure studentId is always a string, even if prompt returns null/undefined unexpectedly
        const validatedOutput = {
            ...output,
            studentId: output?.studentId ?? ""
        };
        console.log("AdminExtract Flow Output:", validatedOutput);
        return validatedOutput;
    } catch (error) {
        console.error("Error in adminExtractBarcodeDataFlow:", error);
        // Return a default error structure or re-throw
        // Returning a structure allows the frontend to handle it gracefully
        return {
           studentId: "", // Indicate failure by empty ID
           studentName: undefined,
           branch: undefined,
           rollNo: undefined,
           yearOfStudy: undefined,
        };
    }
  }
);
