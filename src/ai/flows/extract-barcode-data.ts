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

const ExtractBarcodeDataOutputSchema = z.object({
  idNumber: z
    .string()
    .describe('The ID number extracted from the barcode image or text below it.'),
});
export type ExtractBarcodeDataOutput = z.infer<typeof ExtractBarcodeDataOutputSchema>;

export async function extractBarcodeData(input: ExtractBarcodeDataInput): Promise<ExtractBarcodeDataOutput> {
  return extractBarcodeDataFlow(input);
}

const prompt = ai.definePrompt({
  name: 'extractBarcodeDataPrompt',
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
        .describe('The ID number extracted from the barcode image or text below it.'),
    }),
  },
  prompt: `You are an expert in extracting data from barcodes and images of ID cards.\n\nYou will be provided with an image of a barcode or an ID card. Your task is to extract the ID number from the barcode or the text below the barcode.\n\nHere is the barcode image: {{media url=barcodeImage}}\n\nExtract the ID number and provide it in the 'idNumber' field. If you cannot extract the ID number, return an empty string.`,
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
    const {output} = await prompt(input);
    return output!;
  }
);
