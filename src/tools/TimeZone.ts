import { z } from 'zod';
import { Tool } from './Tool';

function createTimeZone() {
  const paramsSchema = z.object({
    location: z
      .string()
      .describe('The location to get timezone information for'),
  });

  return new Tool(
    paramsSchema,
    'timezone',
    'Useful for getting current time and timezone information for a location',
    async ({ location }) => {
      try {
        const response = await fetch(
          `http://worldtimeapi.org/api/timezone/${location}`
        );
        const data = await response.json();
        return `Current time in ${location}: ${new Date(data.datetime).toLocaleString()}`;
      } catch {
        return 'Error: Could not fetch timezone data';
      }
    }
  );
}

export { createTimeZone };
