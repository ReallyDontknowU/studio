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
  // Gemini Flash is generally used for vision/multimodal tasks due to reliability.
  // Groq models are available for text-based tasks if specified in the prompt/flow.
  // No global default model specified; each prompt/flow should define its own.
});
