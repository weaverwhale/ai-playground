export const models = [
  {
    name: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    tools: true,
    client: 'openai',
    agent: 'system',
  },
  {
    name: 'gpt-4o',
    label: 'GPT-4o',
    tools: true,
    client: 'openai',
    agent: 'system',
  },
  {
    name: 'o1-mini',
    label: 'o1 Mini',
    tools: false,
    client: 'openai',
    agent: 'assistant',
  },
  {
    name: 'o1-preview',
    label: 'o1 Preview',
    tools: false,
    client: 'openai',
    agent: 'assistant',
  },
  {
    name: 'gemini-2.0-flash-exp',
    label: 'Gemini 2.0 Exp',
    tools: true,
    client: 'gemini',
    agent: 'system',
  },
];
