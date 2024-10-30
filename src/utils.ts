import * as z from 'zod';
import { tools } from './constants';

export async function processToolUsage(content: string): Promise<string> {
  let processedContent = content;
  const toolRegex = /<tool>(\w+)<\/tool>([^<]+)/g;

  let match;
  while ((match = toolRegex.exec(content)) !== null) {
    const [fullMatch, toolName, params] = match;
    const tool = tools.find((t) => t.function.name === toolName);

    if (tool) {
      try {
        const parameters = params.trim();
        let parsedParams: z.infer<typeof tool.function.parameters>;

        if (toolName === 'web_browser') {
          parsedParams = { url: parameters };
        } else {
          try {
            if (parameters.startsWith('{')) {
              const jsonParams = JSON.parse(parameters);
              parsedParams = tool.function.parameters.parse(jsonParams);
            } else {
              throw new Error('Invalid parameter format');
            }
          } catch (e) {
            console.warn(`Failed to parse parameters for ${toolName}:`, e);
            throw e;
          }
        }

        const toolResult = await tool.execute(parsedParams);
        processedContent = processedContent.replace(fullMatch, toolResult);
      } catch (error) {
        console.error(`Error executing tool ${toolName}:`, error);
        processedContent = processedContent.replace(
          fullMatch,
          `Error executing ${toolName}: ${error}`
        );
      }
    }
  }

  return processedContent;
}
