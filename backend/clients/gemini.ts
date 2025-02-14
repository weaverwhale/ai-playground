import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import dotenv from 'dotenv';

dotenv.config();

export const gemini = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

export const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY!);
