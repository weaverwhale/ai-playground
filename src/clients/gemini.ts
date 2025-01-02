import { OpenAI } from 'openai';

export const gemini = new OpenAI({
  apiKey: import.meta.env.VITE_GEMINI_API_KEY,
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  dangerouslyAllowBrowser: true,
});
