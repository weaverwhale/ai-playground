import { Response } from 'express';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import { Model } from '../../shared/types';
import { anthropic } from '../clients/anthropic';
import { generateModel } from './generateModel';

import { secondStreamPrompt, systemPrompt } from '../constants';
import { tools, geminiTools } from '../tools';
import { handleToolCallContent, processToolUsage } from './tools';
import { models } from '../../shared/constants';

const sendToolCallsToClient = true;

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

async function handleOpenAiStream(
  model: Model,
  messages: ChatCompletionMessageParam[],
  res: Response
) {
  const { client } = generateModel(model);
  const summaryStream = await client.chat.completions.create({
    messages,
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

async function handleOpenAiStreamWithTools(
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

        // Send tool call notification to client
        res.write(
          `data: ${JSON.stringify({
            type: 'tool_call',
            tool_call: {
              function: {
                name: toolCall.function.name,
              },
            },
          })}\n\n`
        );
      }
      if (toolCall.function?.arguments) {
        currentToolCall.arguments += toolCall.function.arguments;
      }
    }

    // Only send regular content if no tool call is in progress
    if (
      !toolCallInProgress &&
      chunk.choices[0]?.delta?.content &&
      chunk.choices[0]?.delta?.content.length > 0
    ) {
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

        // Only run second stream for non-image/chart/moby/conversation_saver tools
        if (
          currentToolCall.name !== 'image_generator' &&
          currentToolCall.name !== 'chart_generator' &&
          currentToolCall.name !== 'moby' &&
          currentToolCall.name !== 'conversation_saver'
        ) {
          await runSecondStream(model, processedContent, res);
        } else {
          // otherwise, send the processed content back to the client
          res.write(
            `data: ${JSON.stringify({
              type: 'content',
              content: processedContent,
            })}\n\n`
          );
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

async function handleAnthropicStream(
  model: Model,
  messages: ChatCompletionMessageParam[],
  res: Response,
  isSecondStream: boolean
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

  if (isSecondStream) {
    res.write(
      `data: ${JSON.stringify({
        type: 'content',
        content: '\n\n',
      })}\n\n`
    );
  }

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

async function handleAnthropicStreamWithTools(
  model: Model,
  messages: ChatCompletionMessageParam[],
  res: Response
) {
  const stream = await anthropic.messages.create({
    model: model.name,
    messages: messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: Array.isArray(msg.content)
          ? msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n')
          : msg.content || '',
      })),
    max_tokens: 4096,
    stream: true,
    system: systemPrompt(model.tools),
    tools: tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: {
        type: 'object',
        properties: tool.function.parameters?.properties || {},
        required: tool.function.parameters?.required || [],
      },
    })),
  });

  const currentToolCall = {
    name: '',
    arguments: '',
  };

  let toolCallProcessed = false;
  let accumulatedJson = '';

  for await (const chunk of stream) {
    if (
      chunk.type === 'content_block_start' &&
      chunk.content_block?.type === 'tool_use' &&
      sendToolCallsToClient
    ) {
      currentToolCall.name = chunk.content_block.name;

      // Send tool call notification to client immediately
      res.write(
        `data: ${JSON.stringify({
          type: 'tool_call',
          tool_call: {
            function: {
              name: chunk.content_block.name,
            },
          },
        })}\n\n`
      );
      accumulatedJson = ''; // Reset accumulated JSON for new tool call
    } else if (
      chunk.type === 'content_block_delta' &&
      'delta' in chunk &&
      chunk.delta.type === 'input_json_delta'
    ) {
      // Accumulate the JSON string
      accumulatedJson += chunk.delta.partial_json;
    } else if (
      chunk.type === 'message_delta' &&
      chunk.delta?.stop_reason === 'tool_use' &&
      !toolCallProcessed
    ) {
      toolCallProcessed = true;
      try {
        // Set the accumulated JSON as the tool call arguments
        currentToolCall.arguments = accumulatedJson;

        const toolCallContent = await handleToolCallContent(currentToolCall);
        const processedContent = await processToolUsage(toolCallContent);

        if (
          currentToolCall.name !== 'image_generator' &&
          currentToolCall.name !== 'chart_generator'
        ) {
          await runSecondStream(model, processedContent, res);
        } else {
          // For image/chart generators, send the processed content back to the client
          res.write(
            `data: ${JSON.stringify({
              type: 'content',
              content: processedContent + '\n\n',
            })}\n\n`
          );
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
    } else if (
      chunk.type === 'content_block_delta' &&
      'delta' in chunk &&
      'text' in chunk.delta
    ) {
      res.write(
        `data: ${JSON.stringify({
          type: 'content',
          content: chunk.delta.text,
        })}\n\n`
      );
    }
  }
}

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
    await handleAnthropicStreamWithTools(model, messages, res);
  } else {
    await handleOpenAiStreamWithTools(model, messages, res);
  }
}

export async function runSecondStream(
  model: Model,
  processedContent: string,
  res: Response
) {
  const messages = [
    {
      role: model.agent,
      content: secondStreamPrompt,
    },
    {
      role: 'user',
      content: processedContent,
    },
  ] as ChatCompletionMessageParam[];

  if (model.client === 'anthropic') {
    await handleAnthropicStream(model, messages, res, true);
  } else {
    await handleOpenAiStream(model, messages, res);
  }
}
