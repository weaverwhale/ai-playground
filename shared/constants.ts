export const models = [
  {
    name: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    stream: true,
    tools: true,
    client: 'openai',
  },
  {
    name: 'gpt-4o',
    label: 'GPT-4o',
    stream: true,
    tools: true,
    client: 'openai',
  },
  {
    name: 'o1-mini',
    label: 'o1 Mini',
    stream: false,
    tools: false,
    client: 'openai',
  },
  {
    name: 'o1-preview',
    label: 'o1 Preview',
    stream: false,
    tools: false,
    client: 'openai',
  },
  {
    name: 'gemini-1.5-flash',
    label: 'Gemini 1.5 Flash',
    stream: true,
    tools: false,
    client: 'gemini',
  },
  {
    name: 'gemini-2.0-flash-exp',
    label: 'Gemini 2.0 Exp',
    stream: true,
    tools: false,
    client: 'gemini',
  },
];

export type Model = (typeof models)[number];
