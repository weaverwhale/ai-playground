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
        let parsedParams;

        if (toolName === 'web_browser') {
          parsedParams = { url: params.trim() };
        } else if (toolName === 'wikipedia') {
          parsedParams = { query: params.trim() };
        } else {
          try {
            parsedParams = JSON.parse(params);
          } catch (e) {
            console.warn(`Failed to parse parameters for ${toolName}:`, e);
            throw e;
          }
        }

        const toolResult = await tool.execute(parsedParams);
        if (typeof toolResult === 'string') {
          processedContent = processedContent.replace(fullMatch, toolResult);
        } else {
          processedContent = processedContent.replace(
            fullMatch,
            'Error: Unable to process tool response'
          );
        }
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
