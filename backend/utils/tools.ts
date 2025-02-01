import { z } from 'zod';
import { Tool, rawTools } from '../tools';
import { isValidJSON, sanitizeJSONString } from './helpers';
import { ToolCall } from '../../shared/types';

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
      if (!params || params.trim().length === 0) {
        throw new Error('Empty or missing parameters');
      }

      // Type assertion to tell TypeScript this specific tool matches its schema
      const typedTool = tool as unknown as Tool<
        z.ZodObject<z.ZodRawShape, 'strip'>,
        string | { finished: boolean }
      >;
      const parsedParams = parseToolParameters(typedTool, params);
      const validatedParams = typedTool.schema.parse(parsedParams);
      const toolResult = await typedTool.execute(validatedParams);

      if (toolName === 'chart_generator') {
        processedContent = processedContent.replace(
          fullMatch,
          toolResult as string
        );
        continue;
      }

      if (typeof toolResult === 'string') {
        processedContent = processedContent.replace(fullMatch, toolResult);
      } else if (
        toolResult &&
        typeof toolResult === 'object' &&
        'finished' in toolResult
      ) {
        processedContent = processedContent.replace(
          fullMatch,
          'Error: Tool execution incomplete'
        );
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
  TShape extends z.ZodRawShape,
  TOutput,
  TUnknownKeys extends z.UnknownKeysParam = 'strip',
>(
  tool: Tool<z.ZodObject<TShape, TUnknownKeys>, TOutput>,
  params: string
): z.infer<z.ZodObject<TShape, TUnknownKeys>> {
  const schemaFields = Object.keys(tool.schema.shape);

  if (!params || typeof params !== 'string') {
    console.error(`Invalid parameters for tool ${tool.name}:`, params);
    throw new Error('Invalid tool parameters');
  }

  const cleanParams = params
    .trim()
    .replace(/}\s*{/g, '},{')
    .replace(/^{(.+)}$/, '[{$1}]')
    .replace(/,\s*([\]}])/g, '$1');

  if (schemaFields.length === 1) {
    const [paramKey] = schemaFields;
    try {
      const parsed = JSON.parse(cleanParams);
      if (Array.isArray(parsed)) {
        const merged = parsed.reduce((acc, curr) => ({ ...acc, ...curr }), {});
        const result = { [paramKey]: merged[paramKey] || merged };
        return tool.schema.parse(result);
      }
      if (parsed[paramKey]) {
        return tool.schema.parse(parsed);
      }
      const result = { [paramKey]: parsed };
      return tool.schema.parse(result);
    } catch {
      const result = { [paramKey]: params.trim() };
      return tool.schema.parse(result);
    }
  }

  try {
    const parsed = JSON.parse(cleanParams);
    const result = Array.isArray(parsed) ? parsed[0] : parsed;
    return tool.schema.parse(result);
  } catch (e) {
    console.warn(`Failed to parse parameters for ${tool.name}:`, e);
    throw e;
  }
}

export async function handleToolCallContent(currentToolCall: ToolCall) {
  let toolCallContent;

  if (currentToolCall.name === 'web_browser') {
    try {
      const sanitized = sanitizeJSONString(currentToolCall.arguments);
      if (!isValidJSON(sanitized)) {
        throw new Error('Invalid JSON in tool arguments');
      }
      const args = JSON.parse(sanitized);
      toolCallContent = `<tool>${currentToolCall.name}</tool>${args.url}`;
    } catch (error) {
      console.error('Error parsing web_browser arguments:', error);
      toolCallContent = 'Error: Invalid tool arguments';
    }
  } else if (currentToolCall.name === 'wikipedia') {
    try {
      const sanitized = sanitizeJSONString(currentToolCall.arguments);
      if (!isValidJSON(sanitized)) {
        throw new Error('Invalid JSON in tool arguments');
      }
      const args = JSON.parse(sanitized);
      toolCallContent = `<tool>${currentToolCall.name}</tool>${args.query}`;
    } catch (error) {
      console.error('Error parsing wikipedia arguments:', error);
      toolCallContent = 'Error: Invalid tool arguments';
    }
  } else {
    try {
      const sanitized = sanitizeJSONString(currentToolCall.arguments);
      if (!isValidJSON(sanitized)) {
        throw new Error('Invalid JSON in tool arguments');
      }
      toolCallContent = `<tool>${currentToolCall.name}</tool>${sanitized}`;
    } catch (error) {
      console.error('Error parsing tool arguments:', error);
      toolCallContent = 'Error: Invalid tool arguments';
    }
  }

  return toolCallContent;
}
