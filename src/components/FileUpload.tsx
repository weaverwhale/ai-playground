import { ChangeEvent, useRef } from 'react';

interface FileUploadProps {
  onFileUpload: (
    base64File: string,
    fileName: string,
    fileType: string
  ) => void;
  disabled?: boolean;
  accept?: string; // e.g., "image/*", "application/pdf", ".doc,.docx,application/msword"
  id?: string;
}

export function FileUpload({
  onFileUpload,
  disabled,
  accept = '*/*',
  id = 'file-upload',
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      let base64String = reader.result as string;
      // For non-image files, we need to extract just the base64 data
      if (!file.type.startsWith('image/')) {
        base64String = base64String.split(',')[1]; // Remove the data URL prefix
      }
      onFileUpload(base64String, file.name, file.type);
      // Blur the input after upload to prevent it from capturing Enter key
      inputRef.current?.blur();
      // Clear the input value so the same file can be uploaded again
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      onChange={handleFileChange}
      disabled={disabled}
      style={{ display: 'none' }}
      id={id}
      // Prevent form submission when focused
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
        }
      }}
    />
  );
}
