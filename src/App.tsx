import { useState } from 'react';
import { marked } from 'marked';
import { OpenAI } from 'openai';
import './App.css';
import { Stream } from 'openai/streaming.mjs';
import { ChatCompletionChunk } from 'openai/resources/chat/completions.mjs';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

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
  const [messages, setMessages] = useState<Message[]>([]);
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

    const userMessage: Message = { role: 'user', content: prompt };
    setMessages((prevMessages) => [...prevMessages, userMessage]);

    try {
      const assistantMessage: Message = { role: 'assistant', content: '' };
      setMessages((prevMessages) => [...prevMessages, assistantMessage]);

      const stream = await openai.chat.completions.create({
        messages: [...messages, userMessage].map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        model: model.name,
        stream: model.stream,
      });

      if (model.stream) {
        const streamResponse = stream as Stream<ChatCompletionChunk>;
        let fullContent = '';

        for await (const chunk of streamResponse) {
          const content = chunk.choices[0]?.delta?.content || '';
          fullContent += content;

          setMessages((prevMessages) => {
            const newMessages = [...prevMessages];
            newMessages[newMessages.length - 1].content = fullContent;
            return newMessages;
          });
        }
      } else {
        const response = stream as OpenAI.Chat.ChatCompletion;
        const content = response.choices[0]?.message?.content || '';

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
              __html: marked(message.content, { breaks: true }),
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
          onChange={(e) => setPrompt(e.target.value)}
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
