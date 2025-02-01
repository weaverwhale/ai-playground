import { models } from './constants';

export interface ExtendedChatCompletionMessageParam {
  role: 'system' | 'user' | 'assistant' | 'function';
  content:
    | string
    | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  name?: string;
  function_call?: {
    name?: string;
    arguments?: string;
  };
}

export type Model = (typeof models)[number] & {
  agent: 'system' | 'assistant';
};

export type ToolCall = { name: string; arguments: string };
