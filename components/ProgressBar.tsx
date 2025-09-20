
import React from 'react';

interface ProgressBarProps {
  progress: number; // 0 to 100
  message?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress, message }) => {
  return (
    <div className="w-full my-4">
      {message && <p className="text-sm text-gray-400 mb-1 text-center">{message}</p>}
      <div className="w-full bg-neutral-800 rounded-full h-2.5">
        <div
          className="bg-white h-2.5 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
    </div>
  );
};

export default ProgressBar;
