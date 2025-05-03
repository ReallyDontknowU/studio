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
  studentId: z.string().describe('The student ID number, typically found directly below the barcode.'),
  studentName: z.string().optional().describe('The full name of the student as printed on the ID card, if clearly visible.'),
  branch: z.string().optional().describe('The academic branch or department of the student, if clearly visible.'),
  rollNo: z.string().optional().describe('The roll number of the student, if clearly visible and distinct from the student ID.'),
  yearOfStudy: z.string().optional().describe('The academic year or class of the student (e.g., FY, SY, TY), if clearly visible.'),
});
export type AdminExtractBarcodeDataOutput = z.infer<typeof AdminExtractBarcodeDataOutputSchema>;

export async function adminExtractBarcodeData(input: AdminExtractBarcodeDataInput): Promise<AdminExtractBarcodeDataOutput> {
  return adminExtractBarcodeDataFlow(input);
}

const adminExtractBarcodeDataPrompt = ai.definePrompt({
  name: 'adminExtractBarcodeDataPrompt',
  // Explicitly set the model for this prompt
  model: 'googleai/gemini-2.0-flash',
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
       studentId: z.string().describe('The student ID number, typically found directly below the barcode.'),
       studentName: z.string().optional().describe('The full name of the student as printed on the ID card, if clearly visible.'),
       branch: z.string().optional().describe('The academic branch or department of the student, if clearly visible.'),
       rollNo: z.string().optional().describe('The roll number of the student, if clearly visible and distinct from the student ID.'),
       yearOfStudy: z.string().optional().describe('The academic year or class of the student (e.g., FY, SY, TY), if clearly visible.'),
    }),
  },
  prompt: `You are an expert data extraction specialist focused on student ID cards.

Analyze the provided image of a student ID card. Your primary goal is to accurately extract the **Student ID number**. This number is almost always printed **directly below the barcode** and might be labeled as "ID No.", "Student ID", "Barcode No.", or just be a sequence of numbers. It is distinct from any phone numbers or other contact details potentially present on the card.

Secondary goals are to extract the following information **only if clearly visible and legible**:
- studentName: The student's full name.
- branch: The student's academic branch/department (e.g., Computer, Mechanical).
- rollNo: The student's roll number (often distinct from the Student ID).
- yearOfStudy: The student's academic year (e.g., FY, SY, TY, First Year).

Image: {{media url=photoDataUri}}

**Instructions:**
1.  **Prioritize Student ID:** Find the numeric or alphanumeric code printed directly beneath the barcode. Ignore any numbers that look like phone numbers (e.g., starting with +91, having 10 digits, or containing hyphens in a phone number format).
2.  **Accuracy over Completeness:** For 'studentName', 'branch', 'rollNo', and 'yearOfStudy', only extract the information if it is clearly printed and you are confident in its accuracy. If unsure or the field is not present, omit it or return null/undefined for that optional field. Do not guess or hallucinate information.
3.  **Output Format:** Return the extracted information strictly in the JSON format defined by the output schema.
4.  **Student ID Guarantee:** Always return a value for 'studentId'. If you absolutely cannot find any number below the barcode or identify the ID, return an empty string "" for 'studentId'. Do not return null or omit the 'studentId' field.
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
        // The prompt call will use the model specified in adminExtractBarcodeDataPrompt
        const {output} = await adminExtractBarcodeDataPrompt(input);
        // Ensure studentId is always a string, even if prompt returns null/undefined unexpectedly
        const validatedOutput = {
            ...output,
            studentId: output?.studentId ?? "" // Ensure studentId is always a string
        };
        // Clean up potential nulls returned by the model for optional fields, ensuring they are undefined as per schema
        const finalOutput: AdminExtractBarcodeDataOutput = {
            studentId: validatedOutput.studentId,
            studentName: validatedOutput.studentName || undefined,
            branch: validatedOutput.branch || undefined,
            rollNo: validatedOutput.rollNo || undefined,
            yearOfStudy: validatedOutput.yearOfStudy || undefined,
        };

        console.log("AdminExtract Flow Output:", finalOutput);
        return finalOutput;
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

// Ensure the exported types match the schema definitions
export type { AdminExtractBarcodeDataInput, AdminExtractBarcodeDataOutput };
