'use server';
/**
 * @fileOverview Extracts data from a barcode image using a generative AI model.
 *
 * - extractBarcodeData - A function that handles the barcode data extraction process.
 * - ExtractBarcodeDataInput - The input type for the extractBarcodeData function.
 * - ExtractBarcodeDataOutput - The return type for the extractBarcodeData function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const ExtractBarcodeDataInputSchema = z.object({
  barcodeImage: z
    .string()
    .describe(
      "A photo of a barcode, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractBarcodeDataInput = z.infer<typeof ExtractBarcodeDataInputSchema>;

// Output schema remains the same, idNumber is a string.
const ExtractBarcodeDataOutputSchema = z.object({
  idNumber: z
    .string()
    .describe('The ID number extracted from the barcode image or text below it. Returns an empty string "" if no ID number is found.'),
});
export type ExtractBarcodeDataOutput = z.infer<typeof ExtractBarcodeDataOutputSchema>;

export async function extractBarcodeData(input: ExtractBarcodeDataInput): Promise<ExtractBarcodeDataOutput> {
  return extractBarcodeDataFlow(input);
}

const prompt = ai.definePrompt({
  name: 'extractBarcodeDataPrompt',
  // Explicitly set the model for this prompt
  model: 'googleai/gemini-2.0-flash',
  input: {
    schema: z.object({
      barcodeImage: z
        .string()
        .describe(
          "A photo of a barcode, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
        ),
    }),
  },
  output: {
    schema: z.object({
      idNumber: z
        .string()
        .describe('The ID number extracted from the barcode image or text below it. Returns an empty string "" if no ID number is found.'),
    }),
  },
  prompt: `You are an expert in extracting data from barcodes and images of ID cards.

You will be provided with an image, likely containing a barcode or an ID card. Your primary task is to locate and extract the **ID number** printed **directly below the barcode**. This number might be labeled as "ID No.", "Student ID", "Barcode No.", or just be a sequence of numbers. It is usually distinct from any other numbers like phone numbers.

Image: {{media url=barcodeImage}}

**Instructions:**
1.  Focus on the area directly below the barcode.
2.  Identify the numeric or alphanumeric code present there.
3.  Extract only this ID number.
4.  **Crucially:** If you cannot confidently identify or extract an ID number specifically from the area below the barcode, return an empty string "" in the 'idNumber' field. Do not guess or return other text/numbers from the card.
5.  Return the result in the specified JSON format.`,
});

const extractBarcodeDataFlow = ai.defineFlow<
  typeof ExtractBarcodeDataInputSchema,
  typeof ExtractBarcodeDataOutputSchema
>(
  {
    name: 'extractBarcodeDataFlow',
    inputSchema: ExtractBarcodeDataInputSchema,
    outputSchema: ExtractBarcodeDataOutputSchema,
  },
  async input => {
    try {
        // The prompt call will use the model specified in the prompt definition
        const {output} = await prompt(input);
        // Ensure idNumber is always a string, defaulting to empty if null/undefined (though prompt aims for "")
        const validatedOutput: ExtractBarcodeDataOutput = {
            idNumber: output?.idNumber ?? "",
        };
        console.log("ExtractBarcodeData Flow Output:", validatedOutput);
        return validatedOutput;
     } catch (error) {
        console.error("Error in extractBarcodeDataFlow:", error);
        // Return a default structure indicating failure
        return {
           idNumber: "", // Indicate failure by returning empty ID
        };
    }
  }
);

// Ensure the exported types match the schema definitions
export type { ExtractBarcodeDataInput, ExtractBarcodeDataOutput };
