
import React from 'react';
import { AspectRatio } from '../types.ts';
import { LandscapeIcon, PortraitIcon, SparklesIcon } from './IconComponents.tsx'; 

interface ControlsProps {
  aspectRatio: AspectRatio;
  onAspectRatioChange: (ratio: AspectRatio) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  hasScenes: boolean;
  narrationText: string; // Added to disable button if no text
  includeWatermark: boolean;
  onIncludeWatermarkChange: (include: boolean) => void;
  isTTSEnabled: boolean;
  onTTSEnabledChange: (enabled: boolean) => void;
  ttsSupported: boolean;
  useAiImages: boolean;
  onUseAiImagesChange: (use: boolean) => void;
  useAiVideo: boolean;
  onUseAiVideoChange: (use: boolean) => void;
  apiKeyMissing: boolean; // Added to disable generate button
  isPremiumUser: boolean;
}

const Controls: React.FC<ControlsProps> = ({
  aspectRatio,
  onAspectRatioChange,
  onGenerate,
  isGenerating,
  hasScenes,
  narrationText,
  includeWatermark,
  onIncludeWatermarkChange,
  isTTSEnabled,
  onTTSEnabledChange,
  ttsSupported,
  useAiImages,
  onUseAiImagesChange,
  useAiVideo,
  onUseAiVideoChange,
  apiKeyMissing,
  isPremiumUser,
}) => {
  const canGenerate = !isGenerating && narrationText.trim() !== '' && !apiKeyMissing;

  return (
    <div className="p-4 bg-neutral-900 border border-neutral-700 rounded-lg shadow-lg space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Aspect Ratio</label>
        <div className="flex space-x-2">
          {(['16:9', '9:16'] as AspectRatio[]).map((ratio) => (
            <button
              key={ratio}
              type="button"
              onClick={() => onAspectRatioChange(ratio)}
              disabled={isGenerating}
              className={`flex-1 p-3 rounded-md text-sm font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-800 focus:ring-white
                ${aspectRatio === ratio ? 'bg-white text-black shadow-md' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}
                ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-pressed={aspectRatio === ratio}
            >
              <div className="flex items-center justify-center space-x-2">
                {ratio === '16:9' ? <LandscapeIcon className="w-5 h-5" /> : <PortraitIcon className="w-5 h-5" />}
                <span>{ratio === '16:9' ? 'Landscape' : 'Portrait'}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="useAiImages" className="flex items-center text-sm font-medium text-gray-300 mb-1 cursor-pointer select-none">
          <input
            id="useAiImages"
            type="checkbox"
            checked={useAiImages}
            onChange={(e) => onUseAiImagesChange(e.target.checked)}
            disabled={isGenerating || apiKeyMissing || !isPremiumUser}
            className="h-4 w-4 text-white border-neutral-600 rounded focus:ring-white bg-neutral-800 mr-2 disabled:opacity-50"
          />
          Use AI-Generated Images <span className="text-xs text-gray-400 ml-1">(Slower, uses more quota)</span>
          {!isPremiumUser && <span className="ml-1 text-xs text-yellow-400">(Premium)</span>}
        </label>
      </div>

      <div>
        <label htmlFor="useAiVideo" className="flex items-center text-sm font-medium text-gray-300 mb-1 cursor-pointer select-none">
          <input
            id="useAiVideo"
            type="checkbox"
            checked={useAiVideo}
            onChange={(e) => onUseAiVideoChange(e.target.checked)}
            disabled={isGenerating || apiKeyMissing || !isPremiumUser}
            className="h-4 w-4 text-white border-neutral-600 rounded focus:ring-white bg-neutral-800 mr-2 disabled:opacity-50"
          />
          Use AI Video Generation
          {!isPremiumUser && <span className="ml-1 text-xs text-yellow-400">(Premium)</span>}
        </label>
      </div>

      <div>
        <label htmlFor="includeWatermark" className="flex items-center text-sm font-medium text-gray-300 mb-1 cursor-pointer select-none">
          <input
            id="includeWatermark"
            type="checkbox"
            checked={includeWatermark}
            onChange={(e) => onIncludeWatermarkChange(e.target.checked)}
            disabled={isGenerating}
            className="h-4 w-4 text-white border-neutral-600 rounded focus:ring-white bg-neutral-800 mr-2 disabled:opacity-50"
          />
          Add watermark to download
        </label>
      </div>
       {ttsSupported && (
        <div>
          <label htmlFor="enableTTS" className="flex items-center text-sm font-medium text-gray-300 cursor-pointer select-none">
            <input
              id="enableTTS"
              type="checkbox"
              checked={isTTSEnabled}
              onChange={(e) => onTTSEnabledChange(e.target.checked)}
              disabled={isGenerating || !isPremiumUser}
              className="h-4 w-4 text-white border-neutral-600 rounded focus:ring-white bg-neutral-800 mr-2 disabled:opacity-50"
            />
            Enable TTS Narration (Preview)
            {!isPremiumUser && <span className="ml-1 text-xs text-yellow-400">(Premium)</span>}
          </label>
        </div>
       )}

      <button
        onClick={onGenerate}
        disabled={!canGenerate}
        className={`w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-black
                  ${!canGenerate ? 'bg-gray-600 cursor-not-allowed text-white' : 'bg-white hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-800 focus:ring-white'}
                  transition-colors duration-150`}
        aria-live="polite"
        title={apiKeyMissing ? "API Key is missing. Cannot generate." : (narrationText.trim() === '' ? "Please enter narration text." : (hasScenes ? "Re-analyze narration & generate new scenes" : "Generate Video"))}
      >
        <SparklesIcon className={`w-5 h-5 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
        {isGenerating ? 'Generating Video...' : (hasScenes ? 'Re-Generate Video from Narration' : 'Generate Video')}
      </button>
       {!ttsSupported && (
         <p className="text-xs text-gray-500 text-center mt-2">TTS narration not supported by your browser.</p>
       )}
       {apiKeyMissing && (
         <p className="text-xs text-red-400 text-center mt-2">AI features disabled: API Key missing.</p>
       )}
    </div>
  );
};

export default Controls;
