import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
// Removed Groq import: import {groq} from 'genkitx-groq';

export const ai = genkit({
  promptDir: './prompts',
  plugins: [
    googleAI({
      // Read the API key from environment variables
      // The admin UI will instruct the user how to set this.
      apiKey: process.env.GOOGLE_GENAI_API_KEY,
    }),
    // Removed Groq plugin configuration
  ],
  // Gemini Flash is generally used for vision/multimodal tasks due to reliability.
  // No global default model specified; each prompt/flow should define its own.
});
