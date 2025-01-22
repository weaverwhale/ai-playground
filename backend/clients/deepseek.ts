import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

export const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});
