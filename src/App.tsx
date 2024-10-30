import { useState } from 'react';
import { marked } from 'marked';
import { OpenAI } from 'openai';
import './App.css';
import { Stream } from 'openai/streaming.mjs';
import { ChatCompletionChunk } from 'openai/resources/chat/completions.mjs';
import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';

interface Tool extends ChatCompletionTool {
  execute: () => Promise<string>;
}

const tools: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the current weather',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    execute: async () => {
      // Replace with actual API call
      return 'sunny, 72°F';
    },
  },
  // Add more tools like:
  // {
  //   type: 'function',
  //   function: {
  //     name: 'get_time',
  //     description: 'Get current time',
  //     parameters: { type: 'object', properties: {}, required: [] },
  //   },
  //   execute: async () => new Date().toLocaleTimeString(),
  // },
];

const models = [
  {
    name: 'o1-preview',
    label: 'o1 Preview',
    stream: false,
  },
  {
    name: 'o1-mini-2024-09-12',
    label: 'o1 Mini',
    stream: false,
  },
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
];

function App() {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatCompletionMessageParam[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState(models[0]);

  const openai = new OpenAI({
    apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsLoading(true);

    const userMessage: ChatCompletionMessageParam = {
      role: 'user',
      content: prompt,
    };
    setMessages((prevMessages) => [...prevMessages, userMessage]);

    try {
      const assistantMessage: ChatCompletionMessageParam = {
        role: 'assistant',
        content: '',
      };
      setMessages((prevMessages) => [...prevMessages, assistantMessage]);

      const stream = await openai.chat.completions.create({
        messages: [
          ...(model.stream
            ? [
                {
                  role: 'system',
                  content: `
              You have access to the following tools:
                - get_weather: Returns the current weather
                
                To use a tool, respond with: <tool>get_weather</tool>
                Wait for the tool response before continuing.
            `,
                },
              ]
            : [
                {
                  role: 'user',
                  content:
                    'You have access to these tools:\n- get_weather: Returns the current weather\n\nTo use a tool, respond with: <tool>get_weather</tool>\nWait for the tool response before continuing.\n\nPlease acknowledge these instructions.',
                },
              ]),
          ...messages,
          userMessage,
        ] as ChatCompletionMessageParam[],
        model: model.name,
        stream: model.stream,
      });

      if (model.stream) {
        const streamResponse = stream as Stream<ChatCompletionChunk>;
        let fullContent = '';

        for await (const chunk of streamResponse) {
          const content = chunk.choices[0]?.delta?.content || '';
          fullContent += content;

          const toolMatch = fullContent.match(/<tool>(\w+)<\/tool>/);
          if (toolMatch) {
            const toolName = toolMatch[1];
            const tool = tools.find((t) => t.function.name === toolName);
            if (tool) {
              const toolResult = await tool.execute();
              fullContent = fullContent.replace(
                /<tool>\w+<\/tool>/,
                `The current weather is: ${toolResult}`
              );
            }
          }

          setMessages((prevMessages) => {
            const newMessages = [...prevMessages];
            newMessages[newMessages.length - 1].content = fullContent;
            return newMessages;
          });
        }
      } else {
        const response = stream as OpenAI.Chat.ChatCompletion;
        let content = response.choices[0]?.message?.content || '';

        const toolMatch = content.match(/<tool>(\w+)<\/tool>/);
        if (toolMatch) {
          const toolName = toolMatch[1];
          const tool = tools.find((t) => t.function.name === toolName);
          if (tool) {
            const toolResult = await tool.execute();
            content = content.replace(
              /<tool>\w+<\/tool>/,
              `The current weather is: ${toolResult}`
            );
          }
        }

        setMessages((prevMessages) => {
          const newMessages = [...prevMessages];
          newMessages[newMessages.length - 1].content = content;
          return newMessages;
        });
      }

      setPrompt('');
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function handleClear() {
    if (isLoading) return;
    setMessages([]);
  }

  return (
    <div className="container">
      <h1>Chat 🤖</h1>

      <div className="messages">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`message ${message.role}`}
            dangerouslySetInnerHTML={{
              __html: marked(message.content as string, { breaks: true }),
            }}
          />
        ))}
      </div>

      <form className="input-form" onSubmit={handleSubmit}>
        {messages.length > 0 && (
          <div className="clear-conversation" onClick={handleClear}>
            Clear conversation
          </div>
        )}
        <input
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            handleClear();
          }}
          placeholder="Enter your prompt..."
          disabled={isLoading}
        />
        <select
          value={model.name}
          onChange={(e) =>
            setModel(models.find((m) => m.name === e.target.value)!)
          }
          disabled={isLoading}
        >
          {models.map((model) => (
            <option key={model.name} value={model.name}>
              {model.label}
            </option>
          ))}
        </select>

        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Generating...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

export default App;
