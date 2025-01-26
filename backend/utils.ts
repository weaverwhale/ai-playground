import { z } from 'zod';
import { Response } from 'express';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import { Model } from '../shared/types';
import { gemini } from './clients/gemini';
import { openai } from './clients/openai';
import { deepseek } from './clients/deepseek';
import { anthropic } from './clients/anthropic';
import { secondStreamPrompt, systemPrompt } from './constants';
import { Tool, tools, rawTools, geminiTools } from './tools';
import { models } from '../shared/constants';

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
    let braceCount = 1;
    let index = 1;

    while (braceCount > 0 && index < trimmed.length) {
      if (trimmed[index] === '{') braceCount++;
      if (trimmed[index] === '}') braceCount--;
      index++;
    }

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

async function handleOpenAiStream(
  model: Model,
  messages: ChatCompletionMessageParam[],
  res: Response
) {
  const { client, isGemini } = generateModel(model);
  const agent = model.agent;
  const formattedTools = isGemini ? geminiTools : tools;

  const stream = await client.chat.completions.create({
    messages: [
      { role: agent, content: systemPrompt(model.tools) },
      ...(isGemini ? transformMessagesForGemini(messages) : messages),
    ] as ChatCompletionMessageParam[],
    model: model.name,
    stream: true,
    ...(model.tools
      ? {
          tools: formattedTools,
          tool_choice: 'auto',
        }
      : {}),
  });

  let toolCallInProgress = false;
  let toolCallProcessed = false;
  const currentToolCall = {
    name: '',
    arguments: '',
  };

  for await (const chunk of stream) {
    if (chunk.choices[0]?.delta?.tool_calls) {
      toolCallInProgress = true;
      const toolCall = chunk.choices[0].delta.tool_calls[0];

      if (toolCall.function?.name) {
        currentToolCall.name = toolCall.function.name;
      }
      if (toolCall.function?.arguments) {
        currentToolCall.arguments += toolCall.function.arguments;
      }
    }

    // Handle regular content
    if (chunk.choices[0]?.delta?.content) {
      res.write(
        `data: ${JSON.stringify({
          type: 'content',
          content: chunk.choices[0].delta.content,
        })}\n\n`
      );
    }

    // Handle tool call completion
    if (
      (chunk.choices[0]?.finish_reason === 'tool_calls' ||
        (model.client === 'gemini' && toolCallInProgress)) &&
      !toolCallProcessed
    ) {
      toolCallProcessed = true;

      try {
        const toolCallContent = await handleToolCallContent(currentToolCall);
        const processedContent = await processToolUsage(toolCallContent);

        // Send the tool response back to the client
        res.write(
          `data: ${JSON.stringify({
            type: 'content',
            content: processedContent,
          })}\n\n`
        );

        // Only run second stream for non-image/chart/moby tools
        if (
          currentToolCall.name !== 'image_generator' &&
          currentToolCall.name !== 'chart_generator' &&
          currentToolCall.name !== 'moby'
        ) {
          await runSecondStream(model, processedContent, res);
        }
      } catch (error) {
        console.error('Error processing tool call:', error);
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            content: 'Error processing tool response',
          })}\n\n`
        );
      }
    }
  }
}

// currently not using tools
async function handleAnthropicStream(
  model: Model,
  messages: ChatCompletionMessageParam[],
  res: Response
) {
  const stream = await anthropic.messages.create({
    model: model.name,
    messages: messages.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: Array.isArray(msg.content)
        ? msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n')
        : msg.content || '',
    })),
    max_tokens: 4096,
    stream: true,
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta') {
      res.write(
        `data: ${JSON.stringify({
          type: 'content',
          content: 'text' in chunk.delta ? chunk.delta.text : '',
        })}\n\n`
      );
    }
  }
}

function generateModel(model: Model) {
  const isGemini = model.client === 'gemini';
  const isDeepSeek = model.client === 'deepseek';
  const client = isGemini ? gemini : isDeepSeek ? deepseek : openai;

  return { client, isGemini, isDeepSeek };
}

export function transformMessagesForGemini(
  messages: ChatCompletionMessageParam[]
) {
  return messages.map((message) => {
    if (Array.isArray(message.content)) {
      // Transform array content to string
      return {
        ...message,
        content: message.content
          .map((content) => {
            if (content.type === 'text') {
              return content.text;
            }
            if (content.type === 'image_url') {
              return `[Image: ${content.image_url.url}]`;
            }
            return '';
          })
          .join('\n'),
      };
    }
    return message;
  });
}

// streams

export async function runFirstStream(
  modelName: string,
  messages: ChatCompletionMessageParam[],
  res: Response
) {
  const model = models.find((m) => m.name === modelName) as Model;
  if (!model) {
    throw new Error('Invalid model name');
  }

  if (model.client === 'anthropic') {
    await handleAnthropicStream(model, messages, res);
  } else {
    await handleOpenAiStream(model, messages, res);
  }
}

export async function runSecondStream(
  model: Model,
  processedContent: string,
  res: Response
) {
  const { client } = generateModel(model);
  const summaryStream = await client.chat.completions.create({
    messages: [
      {
        role: model.agent,
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

  for await (const chunk of summaryStream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      res.write(
        `data: ${JSON.stringify({
          type: 'content',
          content: content,
        })}\n\n`
      );
    }
  }
}
