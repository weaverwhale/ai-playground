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

        // Special handling for chart_generator - don't process the result further
        if (toolName === 'chart_generator') {
          processedContent = processedContent.replace(
            fullMatch,
            toolResult as string
          );
          continue;
        }

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

  // Clean up potentially malformed JSON
  const cleanParams = params
    .trim()
    // Fix multiple objects without commas
    .replace(/}\s*{/g, '},{')
    // Ensure it's a valid array if multiple objects
    .replace(/^{(.+)}$/, '[{$1}]');

  if (schemaFields.length === 1) {
    const [paramKey] = schemaFields;
    try {
      // Try parsing as JSON first
      const parsed = JSON.parse(cleanParams);
      // Handle array of objects
      if (Array.isArray(parsed)) {
        // Merge multiple objects into one
        const merged = parsed.reduce((acc, curr) => ({ ...acc, ...curr }), {});
        return { [paramKey]: merged[paramKey] || merged } as z.infer<TParams>;
      }
      // If it's already in the correct format, return it
      if (parsed[paramKey]) {
        return parsed as z.infer<TParams>;
      }
      // Otherwise, wrap the parsed value
      return { [paramKey]: parsed } as z.infer<TParams>;
    } catch {
      // If it's not JSON, just use the raw string
      return { [paramKey]: params.trim() } as z.infer<TParams>;
    }
  }

  try {
    const parsed = JSON.parse(cleanParams);
    return Array.isArray(parsed) ? parsed[0] : parsed;
  } catch (e) {
    console.warn(`Failed to parse parameters for ${tool.name}:`, e);
    throw e;
  }
}
