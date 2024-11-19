import { createWebBrowser } from './tools/WebBrowser';

export const tools = [createWebBrowser()];

export const models = [
  {
    name: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    stream: true,
  },
  {
    name: 'gpt-4o-2024-08-06',
    label: 'GPT-4o',
    stream: true,
  },
  {
    name: 'o1-mini-2024-09-12',
    label: 'o1 Mini',
    stream: false,
  },
  {
    name: 'o1-preview',
    label: 'o1 Preview',
    stream: false,
  },
];

export const systemPrompt = `
As an AI assistant, you have access to the following tools:
${tools
  .map((tool) => `- ${tool.function.name}: ${tool.function.description}`)
  .join('\n')}

When using the \`web_browser\` tool, please adhere to the following guidelines:

1. **Always provide full and valid URLs**, including the protocol (e.g., \`http://\` or \`https://\`), domain name, and domain extension (e.g., \`.com\`, \`.org\`).

2. **Do not use shorthand or incomplete URLs**. For example, use \`https://cnet.com\` instead of \`cnet\`.

3. **Ensure URLs are correctly formatted** and do not contain typos or missing components.

4. Use the tool in this format:

\`\`\`
<tool>web_browser</tool>https://www.example.com
\`\`\`

**Examples:**

- Correct:
  \`\`\`
  <tool>web_browser</tool>https://www.cnet.com
  \`\`\`

- Incorrect:
  \`\`\`
  <tool>web_browser</tool>cnet
  \`\`\`

5. After receiving the tool's output, use the information to provide a coherent and helpful response.

Remember, you should only use the tools when necessary and provide clear and concise answers to the user's queries.
`;