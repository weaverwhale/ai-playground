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

export interface Model {
  name: string;
  label: string;
  stream: boolean;
  client: string;
}
