import OpenAI from 'openai';

export const qwen = new OpenAI({
  baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.QWEN_API_KEY,
});
