export const models = [
  {
    name: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    stream: true,
    client: 'openai',
  },
  {
    name: 'gpt-4o',
    label: 'GPT-4o',
    stream: true,
    client: 'openai',
  },
  {
    name: 'o1-mini',
    label: 'o1 Mini',
    stream: false,
    client: 'openai',
  },
  {
    name: 'o1-preview',
    label: 'o1 Preview',
    stream: false,
    client: 'openai',
  },
  {
    name: 'gemini-1.5-flash',
    label: 'Gemini 1.5 Flash',
    stream: true,
    client: 'gemini',
  },
];
