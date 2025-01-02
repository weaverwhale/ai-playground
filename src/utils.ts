import { rawTools } from './tools';
import { Tool } from './tools/Tool';
import * as z from 'zod';
import { openai } from './openai';
import { models, secondStreamPrompt } from './constants';
import {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions.mjs';
import { Stream } from 'openai/streaming.mjs';

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

function isValidJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

function sanitizeJSONString(str: string): string {
  const trimmed = str.trim();
  if (trimmed.startsWith('{')) {
    // Find the index of the first closing brace
    let braceCount = 1;
    let index = 1;

    while (braceCount > 0 && index < trimmed.length) {
      if (trimmed[index] === '{') braceCount++;
      if (trimmed[index] === '}') braceCount--;
      index++;
    }

    // If we found a matching closing brace, return everything up to that point
    if (braceCount === 0) {
      return trimmed.substring(0, index);
    }
  }
  return trimmed;
}

export type ToolCall = { name: string; arguments: string };

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

type ContentPart = {
  type: 'text' | 'image_url' | 'file_url';
  text?: string;
  image_url?: { url: string };
  file_url?: { url: string; name: string; type: string };
};

export type ExtendedChatCompletionMessageParam = Omit<
  ChatCompletionMessageParam,
  'content'
> & {
  content: string | ContentPart[];
};

export async function runFirstStream(
  model: (typeof models)[number],
  stream: Stream<ChatCompletionChunk>,
  setMessages: React.Dispatch<
    React.SetStateAction<ExtendedChatCompletionMessageParam[]>
  >
) {
  const streamResponse = stream as Stream<ChatCompletionChunk>;
  let fullContent = '';
  let toolCallInProgress = false;
  const currentToolCall = {
    name: '',
    arguments: '',
  };

  // Stream the initial response normally
  for await (const chunk of streamResponse) {
    // Handle tool calls
    if (chunk.choices[0]?.delta?.tool_calls) {
      toolCallInProgress = true;
      const toolCall = chunk.choices[0].delta.tool_calls[0];

      if (toolCall.function?.name) {
        currentToolCall.name = toolCall.function.name;
      }
      if (toolCall.function?.arguments) {
        currentToolCall.arguments += toolCall.function.arguments;

        // Try to validate and fix JSON as it comes in
        const sanitized = sanitizeJSONString(currentToolCall.arguments);
        if (isValidJSON(sanitized)) {
          currentToolCall.arguments = sanitized;
        }
      }
    }

    // Handle regular content
    const content = chunk.choices[0]?.delta?.content || '';
    if (content) {
      fullContent += content;
      setMessages((prevMessages) => {
        const newMessages = [...prevMessages];
        newMessages[newMessages.length - 1].content = fullContent;
        return newMessages;
      });
    }

    // Handle tool call completion
    if (
      chunk.choices[0]?.finish_reason === 'tool_calls' &&
      toolCallInProgress
    ) {
      try {
        const toolCallContent = await handleToolCallContent(currentToolCall);
        const processedContent = await processToolUsage(toolCallContent);
        await runSecondStream(
          currentToolCall,
          toolCallContent,
          processedContent,
          model,
          setMessages
        );
      } catch (error) {
        console.error('Error processing tool call:', error);
        setMessages((prevMessages) => {
          const newMessages = [...prevMessages];
          newMessages[newMessages.length - 1].content =
            'Error processing tool response';
          return newMessages;
        });
      }
    }

    // Add this check for final message without tool calls
    if (
      chunk.choices[0]?.finish_reason === 'stop' &&
      !toolCallInProgress &&
      !fullContent
    ) {
      setMessages((prevMessages) => {
        const newMessages = [...prevMessages];
        newMessages[newMessages.length - 1].content =
          "I apologize, but I couldn't generate a response. Please try again.";
        return newMessages;
      });
    }
  }
}

export async function runSecondStream(
  currentToolCall: ToolCall,
  toolCallContent: string,
  processedContent: string,
  model: (typeof models)[number],
  setMessages: React.Dispatch<
    React.SetStateAction<ExtendedChatCompletionMessageParam[]>
  >
) {
  if (processedContent !== toolCallContent) {
    // Special handling for chart_generator - pass directly to message content
    if (currentToolCall.name === 'chart_generator') {
      setMessages((prevMessages) => {
        const newMessages = [...prevMessages];
        newMessages[newMessages.length - 1].content = processedContent;
        return newMessages;
      });
    } else if (currentToolCall.name !== 'image_generator') {
      // For other tools, proceed with summarization
      const summaryStream = await openai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: secondStreamPrompt,
          },
          {
            role: 'user',
            content: processedContent,
          },
        ],
        model: model.name,
        stream: true,
      });

      let summary = '';
      for await (const summaryChunk of summaryStream) {
        const summaryContent = summaryChunk.choices[0]?.delta?.content || '';
        summary += summaryContent;

        setMessages((prevMessages) => {
          const newMessages = [...prevMessages];
          newMessages[newMessages.length - 1].content = summary;
          return newMessages;
        });
      }
    }
  }
}
