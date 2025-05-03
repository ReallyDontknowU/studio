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
  // Keep the default model as Gemini Flash for existing flows
  model: 'googleai/gemini-2.0-flash',
});
