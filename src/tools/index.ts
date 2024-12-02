import { zodToJsonSchema } from 'zod-to-json-schema';
import { ChatCompletionTool } from 'openai/resources/chat/completions';

import { createWebBrowser } from './WebBrowser';
import { createWikipedia } from './Wikipedia';
import { createCalculator } from './Calculator';
import { createImageGenerator } from './ImageGenerator';
// import { createWeather } from './Weather';
// import { createTranslator } from './Translator';
// import { createNewsSearch } from './NewsSearch';

const rawTools = [
  createWebBrowser(),
  createWikipedia(),
  createCalculator(),
  createImageGenerator(),
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
