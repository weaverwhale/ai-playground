import { createWebBrowser } from './WebBrowser';
import { ChatCompletionTool } from 'openai/resources/chat/completions';
import { zodToJsonSchema } from 'zod-to-json-schema';

const tools: ChatCompletionTool[] = [createWebBrowser()].map((tool) => ({
  type: 'function' as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.schema),
  },
}));

export { tools };
