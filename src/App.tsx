import { useState, useRef, useEffect, useCallback } from 'react';
import { marked } from 'marked';
import { OpenAI } from 'openai';
import { Stream } from 'openai/streaming.mjs';
import { ChatCompletionChunk } from 'openai/resources/chat/completions.mjs';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { ImageUpload } from './components/ImageUpload';
import mermaid from 'mermaid';

import { models, systemPrompt, secondStreamPrompt } from './constants';
import { processToolUsage } from './utils';
import { tools } from './tools';
import './styles/App.scss';

type ContentPart = {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
};

type ExtendedChatCompletionMessageParam = Omit<
  ChatCompletionMessageParam,
  'content'
> & {
  content: string | ContentPart[];
};

mermaid.initialize({
  startOnLoad: true,
  theme: 'default',
  securityLevel: 'loose',
});

function renderMessage(message: ExtendedChatCompletionMessageParam): string {
  if (!message.content) return '';

  if (typeof message.content === 'string') {
    // Check for Mermaid code blocks
    const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
    let content = message.content;
    const mermaidBlocks: Array<{ id: string; code: string }> = [];
    let index = 0;

    // Replace Mermaid blocks with placeholders
    content = content.replace(mermaidRegex, (_match, code) => {
      const id = `mermaid-${index++}`;
      // Add proper newlines and indentation for Mermaid syntax
      const formattedCode = code
        .trim()
        .split('\n')
        .map((line: string) => line.trim())
        .join('\n');
      mermaidBlocks.push({ id, code: formattedCode });
      return `<div id="${id}" class="mermaid">\n${formattedCode}\n</div>`;
    });

    // Process any Mermaid diagrams
    if (mermaidBlocks.length > 0) {
      setTimeout(() => {
        mermaid.run({
          querySelector: '.mermaid',
          suppressErrors: false, // Change to false to see errors
        });
      }, 0);
    }

    // Render non-Mermaid content with marked
    const htmlContent = marked.parse(content, {
      breaks: true,
      gfm: true,
    }) as string;

    return htmlContent;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((content) => {
        if (content.type === 'text') {
          return marked(content.text || '', { breaks: true, gfm: true });
        }
        if (content.type === 'image_url') {
          return `<img src="${content.image_url!.url}" alt="Uploaded content" />`;
        }
        return '';
      })
      .join('');
  }

  return '';
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<
    ExtendedChatCompletionMessageParam[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState(models[0]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [lastUserMessage, setLastUserMessage] = useState<string>('');
  const [currentImage, setCurrentImage] = useState<string | null>(null);

  const handleScroll = useCallback((e: Event) => {
    const messagesContainer = messagesContainerRef.current;
    if (!messagesContainer || !e.isTrusted) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
    const isScrolledToBottom = scrollHeight - clientHeight - scrollTop < 50;

    setAutoScroll((current) => {
      if (current !== isScrolledToBottom) {
        return isScrolledToBottom;
      }
      return current;
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [autoScroll]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const messagesContainer = messagesContainerRef.current;
    messagesContainer?.addEventListener('scroll', handleScroll);
    return () => messagesContainer?.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const openai = new OpenAI({
    apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  });

  const handleImageUpload = (base64Image: string) => {
    setCurrentImage(base64Image);
    // focus the input
    inputRef.current?.focus();
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if ((!prompt.trim() && !currentImage) || isLoading) return;

    setLastUserMessage(prompt.trim());
    setIsLoading(true);

    const userMessage: ExtendedChatCompletionMessageParam = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: prompt,
        },
        ...(currentImage
          ? [
              {
                type: 'image_url' as const,
                image_url: {
                  url: currentImage,
                },
              },
            ]
          : []),
      ],
    };

    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setPrompt('');
    setCurrentImage(null);

    try {
      const assistantMessage: ExtendedChatCompletionMessageParam = {
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
        tools,
        tool_choice: 'auto',
      });

      if (model.stream) {
        const streamResponse = stream as Stream<ChatCompletionChunk>;
        let fullContent = '';
        let toolCallInProgress = false;
        const currentToolCall = {
          name: '',
          arguments: '',
        };

        // Stream the initial response normally
        for await (const chunk of streamResponse) {
          // Handle tool calls
          if (chunk.choices[0]?.delta?.tool_calls) {
            toolCallInProgress = true;
            const toolCall = chunk.choices[0].delta.tool_calls[0];

            if (toolCall.function?.name) {
              currentToolCall.name = toolCall.function.name;
            }
            if (toolCall.function?.arguments) {
              currentToolCall.arguments += toolCall.function.arguments;
            }
          }

          // Handle regular content
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullContent += content;
            setMessages((prevMessages) => {
              const newMessages = [...prevMessages];
              newMessages[newMessages.length - 1].content = fullContent;
              return newMessages;
            });
          }

          // Handle tool call completion
          if (
            chunk.choices[0]?.finish_reason === 'tool_calls' &&
            toolCallInProgress
          ) {
            try {
              const args = JSON.parse(currentToolCall.arguments);
              let toolCallContent;

              if (currentToolCall.name === 'web_browser') {
                toolCallContent = `<tool>${currentToolCall.name}</tool>${args.url}`;
              } else if (currentToolCall.name === 'wikipedia') {
                toolCallContent = `<tool>${currentToolCall.name}</tool>${args.query}`;
              } else {
                toolCallContent = `<tool>${currentToolCall.name}</tool>${JSON.stringify(args)}`;
              }

              const processedContent = await processToolUsage(toolCallContent);

              if (processedContent !== toolCallContent) {
                // Special handling for chart_generator - pass directly to message content
                if (currentToolCall.name === 'chart_generator') {
                  setMessages((prevMessages) => {
                    const newMessages = [...prevMessages];
                    newMessages[newMessages.length - 1].content =
                      processedContent;
                    return newMessages;
                  });
                } else if (currentToolCall.name !== 'image_generator') {
                  // For other tools, proceed with summarization
                  const summaryStream = await openai.chat.completions.create({
                    messages: [
                      {
                        role: 'system',
                        content: secondStreamPrompt,
                      },
                      {
                        role: 'user',
                        content: processedContent,
                      },
                    ],
                    model: model.name,
                    stream: true,
                  });

                  let summary = '';
                  for await (const summaryChunk of summaryStream) {
                    const summaryContent =
                      summaryChunk.choices[0]?.delta?.content || '';
                    summary += summaryContent;

                    setMessages((prevMessages) => {
                      const newMessages = [...prevMessages];
                      newMessages[newMessages.length - 1].content = summary;
                      return newMessages;
                    });
                  }
                }
              }
            } catch (error) {
              console.error('Error processing tool call:', error);
              setMessages((prevMessages) => {
                const newMessages = [...prevMessages];
                newMessages[newMessages.length - 1].content =
                  'Error processing tool response';
                return newMessages;
              });
            }
          }
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
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const handleClear = () => {
    if (isLoading) return;
    setMessages([]);
    setPrompt('');
    setCurrentImage(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' && lastUserMessage.length > 0) {
      setPrompt(lastUserMessage);
    }
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !isLoading &&
      prompt.trim().length > 0
    ) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="container">
      <h1>Chat 🤖</h1>
      <div className="messages" ref={messagesContainerRef}>
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.role}`}>
            {message.role === 'assistant' &&
            message.content === '' &&
            isLoading ? (
              <div className="loading-indicator">
                <div className="loading-dot"></div>
                <div className="loading-dot"></div>
                <div className="loading-dot"></div>
              </div>
            ) : (
              <div
                dangerouslySetInnerHTML={{
                  __html: renderMessage(message),
                }}
              />
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form className="input-form" onSubmit={handleSubmit}>
        {messages.length > 0 && (
          <div className="clear-conversation" onClick={handleClear}>
            Clear conversation
          </div>
        )}
        <div className="input-container">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter your prompt..."
            disabled={isLoading}
            ref={inputRef}
          />
          <label htmlFor="image-upload" className="upload-button">
            📷
          </label>
          <ImageUpload onImageUpload={handleImageUpload} disabled={isLoading} />
          {currentImage && (
            <div className="image-preview">
              <img src={currentImage} alt="Upload preview" />
              <button className="button" onClick={() => setCurrentImage(null)}>
                ×
              </button>
            </div>
          )}
        </div>
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

        <button className="button" type="submit" disabled={isLoading}>
          {isLoading ? 'Generating...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

export default App;
