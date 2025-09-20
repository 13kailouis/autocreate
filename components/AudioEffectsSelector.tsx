import React from 'react';
import { AUDIO_EFFECTS } from '../constants.ts';

interface AudioEffectsSelectorProps {
  selectedEffect: keyof typeof AUDIO_EFFECTS;
  onEffectChange: (effect: keyof typeof AUDIO_EFFECTS) => void;
}

const AudioEffectsSelector: React.FC<AudioEffectsSelectorProps> = ({
  selectedEffect,
  onEffectChange
}) => {
  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold text-white mb-3">Background Music</div>
      <div className="grid grid-cols-1 gap-2">
        {Object.entries(AUDIO_EFFECTS).map(([key, effect]) => (
          <div
            key={key}
            onClick={() => onEffectChange(key as keyof typeof AUDIO_EFFECTS)}
            className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
              selectedEffect === key
                ? 'border-green-500 bg-green-500/10'
                : 'border-gray-600 bg-gray-800/50 hover:border-gray-500'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-white font-medium">{effect.name}</h4>
                <p className="text-gray-400 text-sm">{effect.description}</p>
              </div>
              {selectedEffect === key && (
                <div className="text-green-500 text-lg">🎵</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AudioEffectsSelector;
