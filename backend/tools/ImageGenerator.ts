import { z } from 'zod';
import { Tool } from './Tool';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

function createImageGenerator() {
  const paramsSchema = z.object({
    prompt: z.string().describe('Description of the image to generate'),
    size: z.enum(['256x256', '512x512', '1024x1024']).default('512x512'),
  });

  return new Tool(
    paramsSchema,
    'image_generator',
    'Useful for generating images based on text descriptions using DALL-E or similar services',
    async ({ prompt, size }) => {
      console.log('Generating image for:', prompt, 'with size', size);
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        dangerouslyAllowBrowser: true,
      });

      try {
        const response = await openai.images.generate({
          prompt,
          size,
          n: 1,
        });
        return `![Generated Image](${response.data[0].url})`;
      } catch {
        return 'Error: Could not generate image';
      }
    }
  );
}

export { createImageGenerator };
