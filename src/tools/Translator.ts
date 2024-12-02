import { z } from 'zod';
import { Tool } from './Tool';

function createTranslator() {
  const paramsSchema = z.object({
    text: z.string().describe('Text to translate'),
    targetLanguage: z
      .string()
      .describe('Target language code (e.g., es, fr, de)'),
  });

  return new Tool(
    paramsSchema,
    'translator',
    'Useful for translating text between different languages',
    async ({ text, targetLanguage }) => {
      const API_KEY = import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY;
      const url = `https://translation.googleapis.com/language/translate/v2?key=${API_KEY}`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            q: text,
            target: targetLanguage,
          }),
        });
        const data = await response.json();
        return data.data.translations[0].translatedText;
      } catch {
        return 'Error: Could not translate text';
      }
    }
  );
}

export { createTranslator };
