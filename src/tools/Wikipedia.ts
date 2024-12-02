import { z } from 'zod';
import { Tool } from './Tool';

function createWikipedia() {
  const paramsSchema = z.object({
    query: z.string().describe('The topic to search on Wikipedia'),
  });

  return new Tool(
    paramsSchema,
    'wikipedia',
    'Useful for getting quick summaries from Wikipedia',
    async ({ query }) => {
      try {
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
        const response = await fetch(url);
        const data = await response.json();
        return data.extract;
      } catch {
        return 'Error: Could not fetch Wikipedia summary';
      }
    }
  );
}

export { createWikipedia };
