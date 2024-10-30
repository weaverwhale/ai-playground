import { useState } from 'react';
import { marked } from 'marked';
import { OpenAI } from 'openai';
import { Stream } from 'openai/streaming.mjs';
import { ChatCompletionChunk } from 'openai/resources/chat/completions.mjs';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import { models, systemPrompt } from './constants';
import { processToolUsage } from './utils';
import './App.css';

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
                  content: systemPrompt,
                },
              ]
            : [
                {
                  role: 'user',
                  content: systemPrompt,
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

          // Process any complete tool usage
          const processedContent = await processToolUsage(fullContent);

          setMessages((prevMessages) => {
            const newMessages = [...prevMessages];
            newMessages[newMessages.length - 1].content = processedContent;
            return newMessages;
          });
        }
      } else {
        const response = stream as OpenAI.Chat.ChatCompletion;
        let content = response.choices[0]?.message?.content || '';

        // Process any tool usage in the complete response
        content = await processToolUsage(content);

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
    setPrompt('');
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
          }}
          placeholder="Enter your prompt..."
          disabled={isLoading}
        />
        <select
          value={model.name}
          onChange={(e) => {
            setModel(models.find((m) => m.name === e.target.value)!);
            handleClear();
          }}
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
