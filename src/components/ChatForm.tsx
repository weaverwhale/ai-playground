import React, { RefObject, useState } from 'react';
import { ExtendedChatCompletionMessageParam, Model } from '../../shared/types';
import { FileUpload } from './FileUpload';
import { SaveLoadConversation } from './SaveConversation';

interface ChatFormProps {
  prompt: string;
  setPrompt: (prompt: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleClear: () => void;
  clearFile: () => void;
  handleFileUpload: (
    base64File: string,
    fileName: string,
    fileType: string
  ) => void;
  isLoading: boolean;
  messages: ExtendedChatCompletionMessageParam[];
  setMessages: (messages: ExtendedChatCompletionMessageParam[]) => void;
  currentFileName: string | null;
  currentFileType: string | null;
  currentFile: string | null;
  model: Model;
  setModel: (model: Model) => void;
  models: Model[];
  inputRef: RefObject<HTMLInputElement>;
  showSaveLoad: boolean;
}

export function ChatForm({
  prompt,
  setPrompt,
  handleSubmit,
  handleKeyDown,
  handleClear,
  clearFile,
  handleFileUpload,
  isLoading,
  messages,
  setMessages,
  currentFileName,
  currentFileType,
  currentFile,
  model,
  setModel,
  models,
  inputRef,
  showSaveLoad,
}: ChatFormProps) {
  const [fileLoading, setFileLoading] = useState(false);

  return (
    <form className="input-form" onSubmit={handleSubmit}>
      <div className="input-container">
        {messages.length > 0 && !currentFile && (
          <div className="chat-form-toolbar">
            <div className="clear-conversation" onClick={handleClear}>
              <span>Clear conversation</span>
            </div>
            {showSaveLoad && (
              <SaveLoadConversation
                messages={messages}
                setMessages={setMessages}
                whichIcons={['save', 'load']}
                isLoading={isLoading}
              />
            )}
          </div>
        )}
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter your prompt..."
          ref={inputRef}
        />
        <label htmlFor="file-upload" className="upload-button">
          {fileLoading ? '⌛️' : '📎'}
        </label>
        <FileUpload
          onFileUpload={handleFileUpload}
          disabled={isLoading}
          model={model}
          setFileLoading={setFileLoading}
        />
        {currentFileName && (
          <div className="image-preview">
            {currentFileType?.startsWith('image') ? (
              <img src={currentFile || ''} alt="Upload preview" />
            ) : (
              <div className="file-preview">📄 {currentFileName}</div>
            )}
            <button className="button" onClick={clearFile}>
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
  );
}
