'use server';
/**
 * @fileOverview A Genkit flow to quickly detect if an image likely contains an ID card.
 *
 * - detectIdCard - A function that checks if an image contains an ID card.
 * - DetectIdCardInput - The input type for the detectIdCard function.
 * - DetectIdCardOutput - The return type for the detectIdCard function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const DetectIdCardInputSchema = z.object({
  imageDataUri: z
    .string()
    .describe(
      "An image, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type DetectIdCardInput = z.infer<typeof DetectIdCardInputSchema>;

const DetectIdCardOutputSchema = z.object({
  isIdCard: z.boolean().describe('Whether the image likely contains an ID card or similar document (e.g., driver\'s license, library card). Focus on rectangular shape, presence of text, photo, and potentially a barcode.'),
});
export type DetectIdCardOutput = z.infer<typeof DetectIdCardOutputSchema>;

export async function detectIdCard(input: DetectIdCardInput): Promise<DetectIdCardOutput> {
  return detectIdCardFlow(input);
}

const detectIdCardPrompt = ai.definePrompt({
  name: 'detectIdCardPrompt',
  // Use the default model configured in ai-instance (Gemini Flash), as it supports multimodal input
  // Specifying a model here like 'groq/llama...' would likely fail due to lack of image support
  input: {
    schema: DetectIdCardInputSchema,
  },
  output: {
    schema: DetectIdCardOutputSchema,
  },
  prompt: `Analyze the provided image. Your task is to determine, quickly and efficiently, if the image primarily features an ID card, library card, driver's license, or a similar type of identification document.

Focus on these key indicators:
- A distinct rectangular shape.
- Presence of structured text (like name, ID number, expiration date).
- A photograph of a person.
- A barcode or QR code.

Ignore images that are clearly just walls, desks, people without a visible card, blurry images, or other irrelevant scenes.

Image: {{media url=imageDataUri}}

Based on the visual evidence, is it likely that this image contains an ID card or similar document? Respond with only 'true' or 'false'.`,
});

const detectIdCardFlow = ai.defineFlow<
  typeof DetectIdCardInputSchema,
  typeof DetectIdCardOutputSchema
>(
  {
    name: 'detectIdCardFlow',
    inputSchema: DetectIdCardInputSchema,
    outputSchema: DetectIdCardOutputSchema,
  },
  async input => {
    try {
        // This prompt call will use the default model (Gemini Flash) configured in ai-instance.ts
        const { output } = await detectIdCardPrompt(input);
        console.log("DetectIdCard Flow Output:", output);
        // Ensure the output matches the schema, defaulting to false if unexpected
        return {
            isIdCard: output?.isIdCard ?? false,
        };
     } catch (error) {
        console.error("Error in detectIdCardFlow:", error);
        // Default to false in case of any error during detection
        return {
           isIdCard: false,
        };
    }
  }
);

// Ensure the exported types match the schema definitions
export type { DetectIdCardInput, DetectIdCardOutput };
