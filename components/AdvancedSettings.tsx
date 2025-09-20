import React, { useState } from 'react';
import { VIDEO_TEMPLATES, AUDIO_EFFECTS, EXPORT_QUALITIES } from '../constants.ts';

interface AdvancedSettingsProps {
  selectedTemplate: keyof typeof VIDEO_TEMPLATES;
  selectedAudioEffect: keyof typeof AUDIO_EFFECTS;
  selectedQuality: keyof typeof EXPORT_QUALITIES;
  onTemplateChange: (template: keyof typeof VIDEO_TEMPLATES) => void;
  onAudioEffectChange: (effect: keyof typeof AUDIO_EFFECTS) => void;
  onQualityChange: (quality: keyof typeof EXPORT_QUALITIES) => void;
  onClose: () => void;
}

const AdvancedSettings: React.FC<AdvancedSettingsProps> = ({
  selectedTemplate,
  selectedAudioEffect,
  selectedQuality,
  onTemplateChange,
  onAudioEffectChange,
  onQualityChange,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'template' | 'audio' | 'quality'>('template');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-white">Advanced Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>
        
        <div className="flex">
          <div className="w-48 bg-gray-800 p-4">
            <nav className="space-y-2">
              <button
                onClick={() => setActiveTab('template')}
                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'template'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                🎬 Video Template
              </button>
              <button
                onClick={() => setActiveTab('audio')}
                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'audio'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                🎵 Audio Effects
              </button>
              <button
                onClick={() => setActiveTab('quality')}
                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'quality'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                📹 Export Quality
              </button>
            </nav>
          </div>
          
          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === 'template' && (
              <div className="space-y-4">
                <div className="text-lg font-semibold text-white mb-3">Choose Video Template</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(VIDEO_TEMPLATES).map(([key, template]) => (
                    <div
                      key={key}
                      onClick={() => onTemplateChange(key as keyof typeof VIDEO_TEMPLATES)}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                        selectedTemplate === key
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-gray-600 bg-gray-800/50 hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-white font-semibold mb-1">{template.name}</h3>
                          <p className="text-gray-400 text-sm mb-2">{template.description}</p>
                          <div className="text-xs text-gray-500">
                            <div>Speed: {template.settings.wordsPerSecond} words/sec</div>
                            <div>Scene: {template.settings.minSceneDuration}-{template.settings.maxSceneDuration}s</div>
                            <div>Style: {template.settings.kenBurnsIntensity} intensity</div>
                          </div>
                        </div>
                        {selectedTemplate === key && (
                          <div className="text-blue-500 text-xl">✓</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {activeTab === 'audio' && (
              <div className="space-y-4">
                <div className="text-lg font-semibold text-white mb-3">Background Music</div>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(AUDIO_EFFECTS).map(([key, effect]) => (
                    <div
                      key={key}
                      onClick={() => onAudioEffectChange(key as keyof typeof AUDIO_EFFECTS)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                        selectedAudioEffect === key
                          ? 'border-green-500 bg-green-500/10'
                          : 'border-gray-600 bg-gray-800/50 hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-white font-medium">{effect.name}</h4>
                          <p className="text-gray-400 text-sm">{effect.description}</p>
                        </div>
                        {selectedAudioEffect === key && (
                          <div className="text-green-500 text-lg">🎵</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {activeTab === 'quality' && (
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
            )}
          </div>
        </div>
        
        <div className="flex justify-end p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdvancedSettings;
