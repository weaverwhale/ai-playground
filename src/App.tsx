import { useState, useRef, useEffect, useCallback } from 'react';
import { models } from '../shared/constants';
import {
  MessageContentArray,
  ExtendedChatCompletionMessageParam,
  Model,
} from '../shared/types';

import { ThemeToggle } from './components/ThemeToggle';
import { ChatForm } from './components/ChatForm';
import { SaveLoadConversation } from './components/SaveConversation';

import './styles/App.scss';

// Lazy-load marked library to reduce initial bundle size
let cachedMarked: typeof import('marked').marked | null = null;
async function getMarked() {
  if (cachedMarked) return cachedMarked;
  const markedModule = await import('marked');
  cachedMarked = markedModule.marked;
  return cachedMarked;
}

// lazy-load mermaid with caching
let cachedMermaid: typeof import('mermaid').default | null = null;
async function getMermaid() {
  if (cachedMermaid) return cachedMermaid;
  const mermaidModule = await import('mermaid');
  cachedMermaid = mermaidModule.default;
  cachedMermaid.initialize({
    startOnLoad: true,
    theme: 'default',
    securityLevel: 'loose',
  });
  return cachedMermaid;
}

// lazy-load katex with caching
let cachedKatex: typeof import('katex').default | null = null;
async function getKatex() {
  if (cachedKatex) return cachedKatex;
  const katexModule = await import('katex');
  cachedKatex = katexModule.default;
  return cachedKatex;
}

function renderMessage(message: ExtendedChatCompletionMessageParam): string {
  if (!message.content) return '';

  if (typeof message.content === 'string') {
    // Check for Mermaid code blocks and replace them with placeholders
    const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
    let content = message.content;
    const mermaidBlocks: Array<{ id: string; code: string }> = [];
    let index = 0;

    content = content.replace(mermaidRegex, (_match, code) => {
      const id = `mermaid-${index++}`;
      const formattedCode = code
        .trim()
        .split('\n')
        .map((line: string) => line.trim())
        .join('\n');
      mermaidBlocks.push({ id, code: formattedCode });
      return `<div id="${id}" class="mermaid">\n${formattedCode}\n</div>`;
    });

    if (cachedKatex) {
      // Process LaTeX equations
      content = content.replace(/\$(.*?)\$/g, (match, latex) => {
        try {
          const html = cachedKatex?.renderToString(latex, {
            throwOnError: false,
            displayMode: false,
          });
          return `<span class="katex-inline">${html}</span>`;
        } catch (error) {
          console.error('LaTeX rendering error:', error);
          return match;
        }
      });

      // Process display-mode LaTeX equations
      content = content.replace(/\$\$(.*?)\$\$/g, (match, latex) => {
        try {
          const html = cachedKatex?.renderToString(latex, {
            throwOnError: false,
            displayMode: true,
          });
          return `<div class="katex-display">${html}</div>`;
        } catch (error) {
          console.error('LaTeX rendering error:', error);
          return match;
        }
      });
    }

    // When a message contains Mermaid blocks, process them via dynamic import
    if (mermaidBlocks.length > 0) {
      setTimeout(() => {
        (async () => {
          const mermaidInstance = await getMermaid();
          mermaidInstance.run({
            querySelector: '.mermaid',
            suppressErrors: false,
          });
        })();
      }, 0);
    }

    // Use lazy-loaded marked to process markdown formatting
    if (cachedMarked) {
      const htmlContent = cachedMarked.parse(content, {
        breaks: true,
        gfm: true,
      }) as string;
      return htmlContent;
    } else {
      return content;
    }
  }

  // If the message content is an array of content objects
  if (Array.isArray(message.content)) {
    return message.content
      .map((content) => {
        if (content.type === 'text') {
          return cachedMarked
            ? cachedMarked.parse(content.text || '', {
                breaks: true,
                gfm: true,
              })
            : content.text || '';
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

function renderToolCall(toolName: string) {
  if (toolName === 'wikipedia') return '🔍 Searching Wikipedia...';
  if (toolName === 'web_browser') return '🌐 Searching the web...';
  if (toolName === 'calculator') return '🔢 Calculating...';
  if (toolName === 'image_generator') return '🖼️ Generating image...';
  if (toolName === 'moby') return '🐳 Asking Moby...';
  if (toolName === 'urban_dictionary')
    return '📚 Searching Urban Dictionary...';
  if (toolName === 'forecast') return '🌤️ Forecasting...';
  if (toolName === 'chart_generator') return '📈 Creating chart...';
  if (toolName === 'conversation_summary_saver')
    return '💾 Saving conversation summary';
  if (toolName === 'github_review') return '🐙 Checking GitHub...';
  return `🛠️ Using tool: ${toolName}`;
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

  // Add state to force a re-render once marked is loaded
  const [, setIsMarkedLoaded] = useState(false);
  const [, setIsKatexLoaded] = useState(false);

  // Preload marked once the App mounts. Once loaded, trigger a re-render.
  useEffect(() => {
    getMarked().then(() => setIsMarkedLoaded(true));
    getKatex().then(() => setIsKatexLoaded(true));
  }, []);

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

  const focusInput = () => {
    inputRef.current?.focus();
  };

  const doScroll = () => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'instant',
      block: 'end',
    });
  };

  const scrollToBottom = useCallback(() => {
    if (autoScroll) {
      doScroll();
    }
  }, [autoScroll]);

  useEffect(() => {
    scrollToBottom();
    focusInput();
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
    focusInput();
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

    setTimeout(() => {
      doScroll();
    }, 50);

    const userMessage: ExtendedChatCompletionMessageParam = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: prompt,
        },
      ],
    };

    if (currentFileName && currentFile) {
      if (currentFileType?.startsWith('image')) {
        (userMessage.content as MessageContentArray).push({
          type: 'image_url',
          image_url: { url: currentFile },
        });
      } else {
        // Decode base64 for text-based files
        const isTextFile = ['csv', 'json', 'txt'].some((ext) =>
          currentFileType?.includes(ext)
        );
        const base64Content = currentFile.split('base64,')[1];
        const content = isTextFile
          ? decodeURIComponent(escape(window.atob(base64Content)))
          : currentFile;

        (userMessage.content as MessageContentArray).push({
          type: 'text',
          text: `<details><summary>File: ${currentFileName}</summary>\n<pre>${content}</pre></details>`,
        });
      }
    }

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
                      lastMessage.content += renderToolCall(
                        toolCall.function?.name
                      );
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
      focusInput();
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
        <div className="header-right">
          {messages.length <= 1 && (
            <SaveLoadConversation
              messages={messages}
              setMessages={setMessages}
              whichIcons={['load']}
              isLoading={isLoading}
              big={true}
            />
          )}
          <ThemeToggle />
        </div>
      </div>
      <div className="messages" ref={messagesContainerRef}>
        {messages?.map((message, index) => (
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
        setMessages={setMessages}
        currentFileName={currentFileName}
        currentFileType={currentFileType}
        currentFile={currentFile}
        showSaveLoad={messages.length > 1}
        model={model as Model}
        setModel={setModel}
        models={models as Model[]}
        inputRef={inputRef}
      />
    </div>
  );
}

export default App;
