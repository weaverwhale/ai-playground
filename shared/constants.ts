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
  {
    name: 'deepseek-reasoner',
    label: 'DeepSeek Reasoner',
    tools: false,
    client: 'deepseek',
    agent: 'system',
  },
  {
    name: 'deepseek-chat',
    label: 'DeepSeek Chat',
    tools: true,
    client: 'deepseek',
    agent: 'system',
  },
  {
    name: 'claude-3-5-sonnet-latest',
    label: 'Claude 3.5 Sonnet',
    tools: true,
    client: 'anthropic',
    agent: 'assistant',
  },
  {
    name: 'llama-3.3-70b',
    label: 'Llama 3.3 70B',
    tools: true,
    client: 'cerebras',
    agent: 'system',
  },
  {
    name: 'llama-3.1-8b',
    label: 'Llama 3.1 8B',
    tools: true,
    client: 'cerebras',
    agent: 'system',
  },
  // {
  //   name: 'grok-ai',
  //   label: 'Grok AI',
  //   tools: true,
  //   client: 'grok',
  //   agent: 'system',
  // },
];
