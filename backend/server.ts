import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { Stream } from 'openai/streaming.mjs';
import { ChatCompletionChunk } from 'openai/resources/chat/completions.mjs';

import { openai } from './clients/openai';
import { gemini } from './clients/gemini';
import { models } from '../shared/constants';
import { systemPrompt } from './constants';
import { processToolUsage, runFirstStream } from './utils';
import { tools } from './tools';

function transformMessagesForGemini(messages: ChatCompletionMessageParam[]) {
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

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

app.post('/api/chat', async (req, res) => {
  const { messages, modelName } = req.body;

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const model = models.find((m) => m.name === modelName);
    const isGemini = model?.client === 'gemini';
    const client = isGemini ? gemini : openai;
    if (!model) {
      throw new Error('Invalid model name');
    }

    const stream = await client.chat.completions.create({
      messages: [
        ...(model.stream
          ? [{ role: 'system', content: systemPrompt }]
          : [{ role: 'user', content: systemPrompt }]),
        ...(isGemini ? transformMessagesForGemini(messages) : messages),
      ] as ChatCompletionMessageParam[],
      model: model.name,
      stream: model.stream,
      ...(model.tools ? { tools, tool_choice: 'auto' } : {}),
    });

    if (model.stream) {
      try {
        await runFirstStream(model, stream as Stream<ChatCompletionChunk>, res);
      } catch (streamError) {
        // Handle streaming errors
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            content: `Error during streaming: ${streamError.message || 'Unknown streaming error'}`,
          })}\n\n`
        );
      }
    } else {
      // Handle non-streaming response
      const response = stream as OpenAI.Chat.Completions.ChatCompletion;
      let content = response.choices[0]?.message?.content || '';
      try {
        content = await processToolUsage(content);
      } catch (toolError) {
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            content: `Error processing tool: ${toolError.message || 'Unknown tool error'}`,
          })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      res.write(
        `data: ${JSON.stringify({
          type: 'content',
          content: content,
        })}\n\n`
      );
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Error:', error);
    // Send a more detailed error message to the client
    res.write(
      `data: ${JSON.stringify({
        type: 'error',
        content: `Error: ${error.message || 'Something went wrong. Please try again.'}`,
      })}\n\n`
    );
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// Handle all other routes by serving the frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
