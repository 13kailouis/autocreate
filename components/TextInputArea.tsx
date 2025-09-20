
import React from 'react';

interface TextInputAreaProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const TextInputArea: React.FC<TextInputAreaProps> = ({ value, onChange, placeholder, disabled }) => {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || "Enter your narration here..."}
      disabled={disabled}
      rows={8}
      className="w-full p-4 bg-neutral-900 border border-neutral-800 rounded-lg shadow-md focus:ring-2 focus:ring-white focus:border-white text-gray-200 placeholder-gray-500 resize-y transition-colors duration-150"
    />
  );
};

export default TextInputArea;
