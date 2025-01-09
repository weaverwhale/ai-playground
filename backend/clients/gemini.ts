import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

export const gemini = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
});
