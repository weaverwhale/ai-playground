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

    if (!tool) {
      console.error(`Tool not found: ${toolName}`);
      processedContent = processedContent.replace(
        fullMatch,
        `Error: Tool "${toolName}" not found`
      );
      continue;
    }

    try {
      // Add validation for params
      if (!params || params.trim().length === 0) {
        throw new Error('Empty or missing parameters');
      }

      type ToolInput = z.infer<typeof tool.schema>;
      const parsedParams = parseToolParameters(
        tool as Tool<typeof tool.schema, string | { finished: boolean }>,
        params
      );

      // Validate parsed parameters against schema
      const validatedParams = tool.schema.parse(parsedParams);

      const toolResult = await (
        tool.execute as (
          params: ToolInput
        ) => Promise<string | { finished: boolean }>
      )(validatedParams);

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
        `Error executing ${toolName}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  return processedContent;
}

function parseToolParameters<
  TParams extends z.ZodObject<z.ZodRawShape>,
  TResult,
>(tool: Tool<TParams, TResult>, params: string): z.infer<TParams> {
  const schemaFields = Object.keys(tool.schema.shape);

  // Validate input
  if (!params || typeof params !== 'string') {
    console.error(`Invalid parameters for tool ${tool.name}:`, params);
    throw new Error('Invalid tool parameters');
  }

  // Clean up potentially malformed JSON
  const cleanParams = params
    .trim()
    // Fix multiple objects without commas
    .replace(/}\s*{/g, '},{')
    // Ensure it's a valid array if multiple objects
    .replace(/^{(.+)}$/, '[{$1}]')
    // Remove any trailing commas before closing brackets
    .replace(/,\s*([\]}])/g, '$1');

  if (schemaFields.length === 1) {
    const [paramKey] = schemaFields;
    try {
      // Try parsing as JSON first
      const parsed = JSON.parse(cleanParams);
      // Handle array of objects
      if (Array.isArray(parsed)) {
        // Merge multiple objects into one
        const merged = parsed.reduce((acc, curr) => ({ ...acc, ...curr }), {});
        const result = { [paramKey]: merged[paramKey] || merged };
        // Validate against schema
        return tool.schema.parse(result);
      }
      // If it's already in the correct format, return it
      if (parsed[paramKey]) {
        return tool.schema.parse(parsed);
      }
      // Otherwise, wrap the parsed value
      const result = { [paramKey]: parsed };
      return tool.schema.parse(result);
    } catch (e) {
      // If it's not JSON, just use the raw string
      const result = { [paramKey]: params.trim() };
      return tool.schema.parse(result);
    }
  }

  try {
    const parsed = JSON.parse(cleanParams);
    const result = Array.isArray(parsed) ? parsed[0] : parsed;
    // Validate against schema
    return tool.schema.parse(result);
  } catch (e) {
    console.warn(`Failed to parse parameters for ${tool.name}:`, e);
    throw e;
  }
}
