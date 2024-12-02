import { z } from 'zod';
import { Tool } from './Tool';

function createNewsSearch() {
  const paramsSchema = z.object({
    query: z.string().describe('News topic or keywords to search for'),
    days: z.number().default(7).describe('Number of days to look back'),
  });

  return new Tool(
    paramsSchema,
    'news_search',
    'Useful for finding recent news articles on specific topics',
    async ({ query, days }) => {
      const API_KEY = import.meta.env.VITE_NEWS_API_KEY;
      const date = new Date();
      date.setDate(date.getDate() - days);
      const fromDate = date.toISOString().split('T')[0];

      try {
        const response = await fetch(
          `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${fromDate}&sortBy=relevancy&apiKey=${API_KEY}`
        );
        const data = await response.json();

        return data.articles
          .slice(0, 3)
          .map(
            (article: any) =>
              `- [${article.title}](${article.url}) - ${article.source.name}`
          )
          .join('\n');
      } catch {
        return 'Error: Could not fetch news articles';
      }
    }
  );
}

export { createNewsSearch };
