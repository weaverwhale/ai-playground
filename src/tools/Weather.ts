import { z } from 'zod';
import { Tool } from './Tool';

function createWeather() {
  const paramsSchema = z.object({
    location: z.string().describe('The city or location to get weather for'),
  });

  return new Tool(
    paramsSchema,
    'weather',
    'Useful for getting current weather information for a location',
    async ({ location }) => {
      console.log('Getting weather for:', location);
      const API_KEY = import.meta.env.VITE_WEATHER_API_KEY;
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${location}&appid=${API_KEY}&units=metric`;

      try {
        const response = await fetch(url);
        const data = await response.json();
        return `Current weather in ${location}: ${data.main.temp}°C, ${data.weather[0].description}`;
      } catch {
        return 'Error: Could not fetch weather data';
      }
    }
  );
}

export { createWeather };
