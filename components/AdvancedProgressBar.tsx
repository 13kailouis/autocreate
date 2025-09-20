import React from 'react';

interface AdvancedProgressBarProps {
  progress: number;
  stage: string;
  currentStep: number;
  totalSteps: number;
  estimatedTime?: number;
  isGenerating: boolean;
}

const AdvancedProgressBar: React.FC<AdvancedProgressBarProps> = ({
  progress,
  stage,
  currentStep,
  totalSteps,
  estimatedTime,
  isGenerating
}) => {
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getStageIcon = (stage: string): string => {
    switch (stage.toLowerCase()) {
      case 'analyzing': return '🔍';
      case 'generating': return '🎬';
      case 'rendering': return '⚡';
      case 'finalizing': return '✨';
      default: return '⏳';
    }
  };

  const getProgressColor = (progress: number): string => {
    if (progress < 30) return 'bg-red-500';
    if (progress < 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (!isGenerating) return null;

  return (
    <div className="bg-gray-800 rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="text-2xl">{getStageIcon(stage)}</div>
          <div>
            <h3 className="text-white font-semibold">{stage}</h3>
            <p className="text-gray-400 text-sm">
              Step {currentStep} of {totalSteps}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white">{Math.round(progress * 100)}%</div>
          {estimatedTime && (
            <div className="text-sm text-gray-400">
              ETA: {formatTime(estimatedTime)}
            </div>
          )}
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ease-out ${getProgressColor(progress)}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        
        <div className="flex justify-between text-xs text-gray-400">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="bg-gray-700 rounded-lg p-3">
          <div className="text-lg font-semibold text-white">{currentStep}</div>
          <div className="text-xs text-gray-400">Current Step</div>
        </div>
        <div className="bg-gray-700 rounded-lg p-3">
          <div className="text-lg font-semibold text-white">{totalSteps}</div>
          <div className="text-xs text-gray-400">Total Steps</div>
        </div>
        <div className="bg-gray-700 rounded-lg p-3">
          <div className="text-lg font-semibold text-white">
            {estimatedTime ? formatTime(estimatedTime) : '--'}
          </div>
          <div className="text-xs text-gray-400">Estimated Time</div>
        </div>
      </div>
    </div>
  );
};

export default AdvancedProgressBar;
