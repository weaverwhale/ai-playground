import { models } from './constants';

export type MessageContentArray = Array<{
  type: string;
  text?: string;
  image_url?: { url: string };
  fileData?: {
    fileUri: string;
    mimeType: string;
  };
}>;

export interface ExtendedChatCompletionMessageParam {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string | MessageContentArray;
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
