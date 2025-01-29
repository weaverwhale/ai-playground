import OpenAI from 'openai';

export const grok = new OpenAI({
  baseURL: 'https://api.x.ai/v1',
  apiKey: process.env.GROK_API_KEY,
});
