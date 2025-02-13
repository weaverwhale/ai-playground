import { ChangeEvent, useRef } from 'react';
import { Model } from '../../shared/types';

interface FileUploadProps {
  onFileUpload: (
    base64File: string,
    fileName: string,
    fileType: string
  ) => void;
  disabled?: boolean;
  accept?: string;
  id?: string;
  model?: Model;
}

export function FileUpload({
  onFileUpload,
  disabled,
  accept,
  id = 'file-upload',
  model,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
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

    // Check file size (10MB limit for videos)
    if (file.type.startsWith('video/') && file.size > 10 * 1024 * 1024) {
      alert('Video files must be under 10MB');
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      onFileUpload(base64String, file.name, file.type);
      inputRef.current?.blur();
      if (inputRef.current) {
        inputRef.current.value = '';
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
