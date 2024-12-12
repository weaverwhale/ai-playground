import { zodToJsonSchema } from 'zod-to-json-schema';
import { ChatCompletionTool } from 'openai/resources/chat/completions';

import { createWebBrowser } from './WebBrowser';
import { createWikipedia } from './Wikipedia';
import { createCalculator } from './Calculator';
import { createImageGenerator } from './ImageGenerator';
import { createGitHubReview } from './GitHubReview';
import { createUrbanDictionary } from './UrbanDictionary';
import { createArimaForecast } from './ArimaForecast';
// import { createWeather } from './Weather';
// import { createTranslator } from './Translator';
// import { createNewsSearch } from './NewsSearch';

const rawTools = [
  createWebBrowser(),
  createWikipedia(),
  createCalculator(),
  createImageGenerator(),
  createGitHubReview(),
  createUrbanDictionary(),
  createArimaForecast(),
  // createWeather(),
  // createTranslator(),
  // createNewsSearch(),
];

const tools: ChatCompletionTool[] = rawTools.map((tool) => ({
  type: 'function' as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.schema),
  },
}));

export { rawTools, tools };
