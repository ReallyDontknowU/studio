'use server';
/**
 * @fileOverview A Genkit flow to detect if an image likely contains an ID card using Google's Gemini Flash model.
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
  isIdCard: z.boolean().describe('Whether the image primarily features an ID card, library card, driver\'s license, or a similar type of identification document.'),
});
export type DetectIdCardOutput = z.infer<typeof DetectIdCardOutputSchema>;

export async function detectIdCard(input: DetectIdCardInput): Promise<DetectIdCardOutput> {
  return detectIdCardFlow(input);
}

const detectIdCardPrompt = ai.definePrompt({
  name: 'detectIdCardPromptGemini',
  // Explicitly use Google AI Gemini Flash model (more reliable for vision)
  model: 'googleai/gemini-2.0-flash',
  input: {
    schema: DetectIdCardInputSchema,
  },
  output: {
    schema: DetectIdCardOutputSchema,
  },
  prompt: `Analyze the provided image. Your task is to determine if the image primarily features an ID card, library card, driver's license, or a similar type of identification document.

Look for these key indicators:
- A distinct rectangular shape typical of cards.
- Presence of structured text (like name, ID number).
- Often includes a photograph of a person.
- May contain a barcode or QR code.

Ignore images that are clearly just walls, desks, people without a visible card, overly blurry images, or other non-card scenes.

Image: {{media url=imageDataUri}}

Based ONLY on the visual evidence in the image, is it likely that this image contains an ID card or similar document? Respond with only 'true' or 'false' in the isIdCard field.`,
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
        // This prompt call will now use the specified Gemini model.
        const { output } = await detectIdCardPrompt(input);
        console.log("DetectIdCard Flow Output (Gemini):", output);
        // Ensure the output matches the schema, defaulting to false if unexpected
        return {
            isIdCard: output?.isIdCard ?? false,
        };
     } catch (error: any) {
        console.error("Error in detectIdCardFlow (Gemini):", error);
        // Default to false in case of any error during detection
        return {
           isIdCard: false,
        };
    }
  }
);

// Ensure the exported types match the schema definitions
export type { DetectIdCardInput, DetectIdCardOutput };
