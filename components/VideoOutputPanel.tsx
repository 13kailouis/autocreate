import React from 'react';
import { DownloadIcon, SparklesIcon } from './IconComponents.tsx';

interface VideoOutputPanelProps {
  isGeneratingScenes: boolean;
  isRenderingVideo: boolean;
  isPreparingDownload: boolean;
  hasDownload: boolean;
  downloadFormat: 'webm' | 'mp4';
  onDownloadRequest: () => void;
  autoDownloadQueued: boolean;
}

const VideoOutputPanel: React.FC<VideoOutputPanelProps> = ({
  isGeneratingScenes,
  isRenderingVideo,
  isPreparingDownload,
  hasDownload,
  downloadFormat,
  onDownloadRequest,
  autoDownloadQueued,
}) => {
  const resolvedFormatLabel = (downloadFormat ?? 'video').toUpperCase();

  let buttonLabel = `Render & Download ${resolvedFormatLabel}`;
  if (isRenderingVideo) {
    buttonLabel = 'Rendering video...';
  } else if (isPreparingDownload) {
    buttonLabel = `Preparing ${resolvedFormatLabel}...`;
  } else if (hasDownload) {
    buttonLabel = `Download ${resolvedFormatLabel}`;
  }

  const isButtonDisabled =
    isGeneratingScenes || isRenderingVideo || isPreparingDownload;

  return (
    <div className="bg-neutral-900 border border-neutral-700 p-4 sm:p-6 rounded-2xl shadow-lg space-y-4">
      <div className="flex items-center space-x-3 text-white">
        <SparklesIcon className="w-5 h-5 text-yellow-300" />
        <h3 className="text-lg sm:text-xl font-semibold" style={{ fontFamily: 'Fira Code' }}>
          Final Video Output
        </h3>
      </div>

      <p className="text-sm text-gray-300 leading-relaxed">
        We skip the in-browser preview to deliver the final video faster. Once the
        render completes, the {resolvedFormatLabel} download will start
        automatically.
      </p>

      {autoDownloadQueued && !isRenderingVideo && !isPreparingDownload && (
        <p className="text-xs text-gray-400">
          Auto-download queued. Rendering will start in a moment...
        </p>
      )}

      <button
        onClick={onDownloadRequest}
        disabled={isButtonDisabled}
        className="w-full flex items-center justify-center px-4 py-3 bg-white text-black font-medium text-sm sm:text-base rounded-md shadow-md hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        <DownloadIcon className="w-5 h-5 mr-2" />
        {buttonLabel}
      </button>

      {!hasDownload && !isRenderingVideo && !isPreparingDownload && (
        <p className="text-xs text-gray-500">
          Tip: You can click the button to start rendering immediately if the
          automatic download hasn&apos;t begun.
        </p>
      )}

      {hasDownload && (
        <p className="text-xs text-gray-400">
          Download ready. If the automatic download didn&apos;t trigger, use the
          button above.
        </p>
      )}
    </div>
  );
};

export default VideoOutputPanel;
