import React from 'react';
import { VIDEO_TEMPLATES } from '../constants.ts';

interface TemplateSelectorProps {
  selectedTemplate: keyof typeof VIDEO_TEMPLATES;
  onTemplateChange: (template: keyof typeof VIDEO_TEMPLATES) => void;
}

const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  selectedTemplate,
  onTemplateChange
}) => {
  return (
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
  );
};

export default TemplateSelector;
