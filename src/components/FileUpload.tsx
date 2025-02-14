import { ChangeEvent, useRef } from 'react';
import { Model } from '../../shared/types';

interface FileUploadProps {
  onFileUpload: (
    base64File: string,
    fileName: string,
    fileType: string,
    fileSize?: number
  ) => void;
  disabled?: boolean;
  accept?: string;
  id?: string;
  model?: Model;
  setFileLoading?: (file: boolean) => void;
}

export function FileUpload({
  onFileUpload,
  disabled,
  accept,
  id = 'file-upload',
  model,
  setFileLoading,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if it's a video file and the model is not Gemini
    if (
      file.type.startsWith('video/') &&
      (!model || model.client !== 'gemini')
    ) {
      alert('Video uploads are only supported with Gemini models');
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      return;
    }

    setFileLoading?.(true);

    // For Gemini video files larger than 20MB, use File API
    if (file.type.startsWith('video/')) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        // Upload to your backend endpoint that will handle the File API upload
        const response = await fetch(
          `http://localhost:${import.meta.env.VITE_SERVER_PORT}/api/upload`,
          {
            method: 'POST',
            body: formData,
          }
        );

        if (!response.ok) {
          throw new Error('Failed to upload file');
        }

        const { fileRef } = await response.json();

        // Pass the File API reference instead of base64
        onFileUpload(fileRef, file.name, file.type, file.size);
      } catch (error) {
        console.error('Error uploading file:', error);
        alert('Failed to upload video file');
      } finally {
        setFileLoading?.(false);
      }

      return;
    }

    // For smaller files, continue with base64 encoding
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      onFileUpload(base64String, file.name, file.type, file.size);
      inputRef.current?.blur();
      if (inputRef.current) {
        inputRef.current.value = '';
        setFileLoading?.(false);
      }
    };

    reader.readAsDataURL(file);
  };

  // Determine accept string based on model
  const acceptString =
    accept || (model?.client === 'gemini' ? 'image/*,video/*' : 'image/*');

  return (
    <input
      ref={inputRef}
      type="file"
      accept={acceptString}
      onChange={handleFileChange}
      disabled={disabled}
      style={{ display: 'none' }}
      id={id}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
        }
      }}
    />
  );
}
