import React from 'react';
import { EXPORT_QUALITIES } from '../constants.ts';

interface ExportQualitySelectorProps {
  selectedQuality: keyof typeof EXPORT_QUALITIES;
  onQualityChange: (quality: keyof typeof EXPORT_QUALITIES) => void;
}

const ExportQualitySelector: React.FC<ExportQualitySelectorProps> = ({
  selectedQuality,
  onQualityChange
}) => {
  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold text-white mb-3">Export Quality</div>
      <div className="grid grid-cols-1 gap-3">
        {Object.entries(EXPORT_QUALITIES).map(([key, quality]) => (
          <div
            key={key}
            onClick={() => onQualityChange(key as keyof typeof EXPORT_QUALITIES)}
            className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
              selectedQuality === key
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-gray-600 bg-gray-800/50 hover:border-gray-500'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-1">{quality.name}</h3>
                <div className="text-sm text-gray-400 space-y-1">
                  <div>Resolution: {quality.resolution}</div>
                  <div>Bitrate: {(quality.bitrate / 1000000).toFixed(1)} Mbps</div>
                  <div>FPS: {quality.fps}</div>
                </div>
              </div>
              {selectedQuality === key && (
                <div className="text-purple-500 text-xl">✓</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExportQualitySelector;
