import { useState, useRef, useEffect, useCallback } from 'react';
import { marked } from 'marked';
import mermaid from 'mermaid';

import { models } from '../shared/constants';
import { ExtendedChatCompletionMessageParam } from '../shared/types';

import { ThemeToggle } from './components/ThemeToggle';
import { ChatForm } from './components/ChatForm';
import './styles/App.scss';

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
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [currentFileType, setCurrentFileType] = useState<string | null>(null);

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

  const handleFileUpload = (
    base64File: string,
    fileName: string,
    fileType: string
  ) => {
    setCurrentFile(base64File);
    setCurrentFileName(fileName);
    setCurrentFileType(fileType);
    // focus the input
    inputRef.current?.focus();
  };

  const clearFile = () => {
    setCurrentFile(null);
    setCurrentFileName(null);
    setCurrentFileType(null);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if ((!prompt.trim() && !currentFileName) || isLoading) return;

    setLastUserMessage(prompt.trim());
    setIsLoading(true);

    const userMessage: ExtendedChatCompletionMessageParam = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: prompt,
        },
        ...(currentFileName && currentFile
          ? [
              currentFileType?.startsWith('image')
                ? {
                    type: 'image_url' as const,
                    image_url: { url: currentFile },
                  }
                : {
                    type: 'text' as const,
                    text: `File: ${currentFileName}\nContent: ${currentFile}`,
                  },
            ]
          : []),
      ],
    };

    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setPrompt('');
    setCurrentFile(null);
    setCurrentFileName(null);

    try {
      const assistantMessage: ExtendedChatCompletionMessageParam = {
        role: 'assistant',
        content: '',
      };

      const currentMessages = messages;
      setMessages((prevMessages) => [...prevMessages, assistantMessage]);

      const response = await fetch(
        `http://localhost:${import.meta.env.VITE_SERVER_PORT}/api/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [...currentMessages, userMessage],
            modelName: model.name,
          }),
        }
      );

      clearFile();

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let content = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content') {
                content += parsed.content;
                setMessages((prevMessages) => {
                  const newMessages = [...prevMessages];
                  newMessages[newMessages.length - 1].content = content;
                  return newMessages;
                });
              } else if (parsed.type === 'error') {
                setMessages((prevMessages) => {
                  const newMessages = [...prevMessages];
                  newMessages[newMessages.length - 1].content = parsed.content;
                  return newMessages;
                });
              } else if (parsed.type === 'tool_call') {
                const toolCall = parsed.tool_call;
                setMessages((prevMessages) => {
                  const newMessages = [...prevMessages];
                  const lastMessage = newMessages[newMessages.length - 1];

                  // Only show "Using tool" message once
                  if (
                    toolCall.function?.name &&
                    typeof lastMessage.content === 'string'
                  ) {
                    lastMessage.content = lastMessage.content || '';
                    if (
                      !lastMessage.content.includes(
                        `Using tool: ${toolCall.function.name}`
                      )
                    ) {
                      lastMessage.content = `Using tool: ${toolCall.function.name}\n\n`;
                    }
                  }
                  return newMessages;
                });
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages((prevMessages) => {
        const newMessages = [...prevMessages];
        newMessages[newMessages.length - 1].content =
          'Error: Something went wrong. Please try again.';
        return newMessages;
      });
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  const handleClear = () => {
    if (isLoading) return;
    setMessages([]);
    setPrompt('');
    setCurrentFile(null);
    setCurrentFileName(null);
    setCurrentFileType(null);
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
      <div className="header">
        <h1 onClick={handleClear}>Chat 🤖</h1>
        <ThemeToggle />
      </div>
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

      <ChatForm
        prompt={prompt}
        setPrompt={setPrompt}
        handleSubmit={handleSubmit}
        handleKeyDown={handleKeyDown}
        handleClear={handleClear}
        clearFile={clearFile}
        handleFileUpload={handleFileUpload}
        isLoading={isLoading}
        messages={messages}
        currentFileName={currentFileName}
        currentFileType={currentFileType}
        currentFile={currentFile}
        model={model}
        setModel={setModel}
        models={models}
        inputRef={inputRef}
      />
    </div>
  );
}

export default App;
