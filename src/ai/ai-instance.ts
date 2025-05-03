import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import {groq} from 'genkitx-groq'; // Import Groq plugin from the correct package

export const ai = genkit({
  promptDir: './prompts',
  plugins: [
    googleAI({
      apiKey: process.env.GOOGLE_GENAI_API_KEY,
    }),
    // Add Groq plugin, configured with its own API key
    groq({
      apiKey: process.env.GROQ_API_KEY,
    }),
  ],
  // No default model specified; each prompt/flow should define its own model
  // model: 'googleai/gemini-2.0-flash', // Removed default
});
