import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

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

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post('/api/chat', async (req, res) => {
  const { messages, modelName } = req.body;

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const model = models.find((m) => m.name === modelName);
    const client = model?.client === 'gemini' ? gemini : openai;
    if (!model) {
      throw new Error('Invalid model name');
    }

    const stream = await client.chat.completions.create({
      messages: [
        ...(model.stream
          ? [{ role: 'system', content: systemPrompt }]
          : [{ role: 'user', content: systemPrompt }]),
        ...messages,
      ] as ChatCompletionMessageParam[],
      model: model.name,
      stream: model.stream,
      tools,
      tool_choice: 'auto',
    });

    if (model.stream) {
      await runFirstStream(model, stream as Stream<ChatCompletionChunk>, res);
    } else {
      // Handle non-streaming response
      const response = stream as OpenAI.Chat.Completions.ChatCompletion;
      let content = response.choices[0]?.message?.content || '';
      content = await processToolUsage(content);

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
    res.write(
      `data: ${JSON.stringify({
        type: 'error',
        content: 'Error: Something went wrong. Please try again.',
      })}\n\n`
    );
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
