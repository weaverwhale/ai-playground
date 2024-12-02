import { rawTools } from './tools';
import { Tool } from './tools/Tool';
import * as z from 'zod';

export async function processToolUsage(content: string): Promise<string> {
  let processedContent = content;
  const toolRegex = /<tool>(\w+)<\/tool>([^<]+)/g;

  let match;
  while ((match = toolRegex.exec(content)) !== null) {
    const [fullMatch, toolName, params] = match;
    const tool = rawTools.find((t) => t.name === toolName);

    if (tool) {
      try {
        type ToolInput = z.infer<typeof tool.schema>;
        const parsedParams = parseToolParameters(
          tool as Tool<typeof tool.schema, string | { finished: boolean }>,
          params
        );
        const toolResult = await (
          tool.execute as (
            params: ToolInput
          ) => Promise<string | { finished: boolean }>
        )(parsedParams);

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

function parseToolParameters<
  TParams extends z.ZodObject<z.ZodRawShape>,
  TResult,
>(tool: Tool<TParams, TResult>, params: string): z.infer<TParams> {
  const schemaFields = Object.keys(tool.schema.shape);

  if (schemaFields.length === 1) {
    const [paramKey] = schemaFields;
    return { [paramKey]: params.trim() } as z.infer<TParams>;
  }

  try {
    return JSON.parse(params) as z.infer<TParams>;
  } catch (e) {
    console.warn(`Failed to parse parameters for ${tool.name}:`, e);
    throw e;
  }
}
