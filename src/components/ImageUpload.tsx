import { ChangeEvent, useRef } from 'react';

interface ImageUploadProps {
  onImageUpload: (base64Image: string) => void;
  disabled?: boolean;
}

export function ImageUpload({ onImageUpload, disabled }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      onImageUpload(base64String);
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
      accept="image/*"
      onChange={handleImageChange}
      disabled={disabled}
      style={{ display: 'none' }}
      id="image-upload"
      // Prevent form submission when focused
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
        }
      }}
    />
  );
}
