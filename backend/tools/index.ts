import { zodToJsonSchema } from 'zod-to-json-schema';
import { ChatCompletionTool } from 'openai/resources/chat/completions';

import { Tool } from './Tool';
import { createWebBrowser } from './WebBrowser';
import { createWikipedia } from './Wikipedia';
import { createCalculator } from './Calculator';
import { createImageGenerator } from './ImageGenerator';
import { createGitHubReview } from './GitHubReview';
import { createUrbanDictionary } from './UrbanDictionary';
import { createForecast } from './Forecasting';
import { createChartGenerator } from './ChartGenerator';
import { createConversationSummarySaver } from './ConversationSummarySaver';
import { createMoby } from './Moby';
import { createWeeklyReport } from './WeeklyReport';
// import { createTextReader } from './TextReader';
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
  createForecast(),
  createChartGenerator(),
  createMoby(),
  createConversationSummarySaver(),
  createWeeklyReport(),
  // createTextReader(),
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

const geminiRawTools = [
  createWebBrowser(),
  createWikipedia(),
  createCalculator(),
  createImageGenerator(),
  createGitHubReview(),
  createUrbanDictionary(),
  createForecast(),
  createMoby(),
  createConversationSummarySaver(),
  createWeeklyReport(),
  // @TODO CHART GENERATOR CAUSES ERRORS??
  // createChartGenerator(),
  // createTextReader(),
  // createWeather(),
  // createTranslator(),
  // createNewsSearch(),
];

const geminiTools = geminiRawTools.map((tool) => ({
  type: 'function' as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.schema),
  },
}));

export { Tool, rawTools, tools, geminiTools };
