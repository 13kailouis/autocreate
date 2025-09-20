
import React, { useState } from 'react';
import { Scene, AspectRatio } from '../types.ts';
import { SparklesIcon } from './IconComponents.tsx'; // For AI refresh button

interface SceneEditorProps {
  scenes: Scene[];
  onUpdateScene: (sceneId: string, newText: string, newDuration: number) => void;
  onDeleteScene: (sceneId: string) => void;
  onAddScene: () => void;
  onUpdateSceneImage: (sceneId: string) => Promise<void>; // Make it async
  aspectRatio: AspectRatio; // To pass to image fetch potentially
  isGenerating: boolean; // To disable buttons during global operations
  apiKeyMissing: boolean;
  useAiImagesGlobal: boolean;
}

const SceneEditor: React.FC<SceneEditorProps> = ({
  scenes,
  onUpdateScene,
  onDeleteScene,
  onAddScene,
  onUpdateSceneImage,
  // aspectRatio, // Not directly used here, but App.tsx might need it for updateSceneImage
  isGenerating,
  apiKeyMissing,
  useAiImagesGlobal,
}) => {
  const [editableSceneId, setEditableSceneId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');
  const [editDuration, setEditDuration] = useState<number>(0);
  const [isUpdatingImage, setIsUpdatingImage] = useState<string | null>(null); // Store ID of scene whose image is updating

  const handleEdit = (scene: Scene) => {
    setEditableSceneId(scene.id);
    setEditText(scene.sceneText);
    setEditDuration(scene.duration);
  };

  const handleSave = (sceneId: string) => {
    onUpdateScene(sceneId, editText, editDuration);
    setEditableSceneId(null);
  };

  const handleImageUpdate = async (sceneId: string) => {
    setIsUpdatingImage(sceneId);
    try {
      await onUpdateSceneImage(sceneId);
    } catch (e) {
      // Error is handled by App.tsx's error/warning system
      console.error("Error in SceneEditor calling onUpdateSceneImage", e);
    } finally {
      setIsUpdatingImage(null);
    }
  };


  return (
    <div className="p-4 sm:p-6 bg-neutral-900/80 backdrop-blur-lg border border-neutral-700 rounded-xl shadow-lg">
      <h3 className="text-xl sm:text-2xl font-semibold mb-4 text-white" style={{ fontFamily: 'Fira Code' }}>4. Edit Scenes</h3>
      {scenes.length === 0 && <p className="text-gray-400">No scenes generated yet. Use Step 1 & 2.</p>}
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
        {scenes.map((scene, index) => (
          <div key={scene.id} className="bg-neutral-900/80 backdrop-blur-lg border border-neutral-700 p-4 rounded-lg shadow-lg">
            <h4 className="font-semibold text-white mb-2" style={{ fontFamily: 'Fira Code' }}>Scene {index + 1}</h4>
            {editableSceneId === scene.id ? (
              <div className="space-y-3">
                <div>
                  <label htmlFor={`sceneText-${scene.id}`} className="block text-sm font-medium text-gray-300 mb-1">Scene Text</label>
                  <textarea
                    id={`sceneText-${scene.id}`}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    className="w-full p-2 bg-neutral-900 border border-neutral-700 rounded-md text-gray-200 focus:ring-white focus:border-white"
                    disabled={isGenerating}
                  />
                </div>
                <div>
                  <label htmlFor={`sceneDuration-${scene.id}`} className="block text-sm font-medium text-gray-300 mb-1">Duration (seconds)</label>
                  <input
                    id={`sceneDuration-${scene.id}`}
                    type="number"
                    value={editDuration}
                    onChange={(e) => {
                      const parsed = parseFloat(e.target.value);
                      setEditDuration(Math.max(1, Number.isFinite(parsed) ? parsed : 1));
                    }}
                    min="1"
                    step="0.1"
                    className="w-full p-2 bg-neutral-900 border border-neutral-700 rounded-md text-gray-200 focus:ring-white focus:border-white"
                    disabled={isGenerating}
                  />
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleSave(scene.id)}
                    disabled={isGenerating}
                    className="px-3 py-1.5 text-sm bg-white hover:bg-gray-200 rounded-md text-black disabled:opacity-50"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setEditableSceneId(null)}
                    disabled={isGenerating}
                    className="px-3 py-1.5 text-sm bg-gray-600 hover:bg-gray-500 rounded-md text-white disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-gray-300 text-sm whitespace-pre-wrap break-words">
                  <strong className="text-gray-400">Text:</strong> {scene.sceneText.length > 100 ? scene.sceneText.substring(0,97) + "..." : scene.sceneText}
                </p>
                <p className="text-gray-300 text-sm"><strong className="text-gray-400">Duration:</strong> {scene.duration.toFixed(1)}s</p>
                <p className="text-gray-300 text-sm truncate">
                    <strong className="text-gray-400">Footage:</strong> {
                        scene.footageType === 'video' ?
                        'Video Placeholder' :
                        (scene.footageUrl.startsWith('data:image') ?
                          (useAiImagesGlobal ? 'AI Generated' : 'Custom Image Data') : 'Placeholder')
                    }
                    {scene.footageType === 'image' && scene.footageUrl.startsWith('data:image') && scene.imagePrompt &&
                     <span className="text-xs text-gray-500 italic ml-1">(Prompt: {scene.imagePrompt.substring(0,30)}...)</span>
                    }
                </p>
                <div className="flex space-x-2 mt-2 flex-wrap gap-2">
                  <button
                    onClick={() => handleEdit(scene)}
                    disabled={isGenerating || isUpdatingImage === scene.id}
                    className="px-3 py-1.5 text-xs bg-white hover:bg-gray-200 rounded-md text-black disabled:opacity-50"
                  >
                    Edit Scene
                  </button>
                  <button
                    onClick={() => handleImageUpdate(scene.id)}
                    disabled={isGenerating || apiKeyMissing || isUpdatingImage === scene.id}
                    className="px-3 py-1.5 text-xs bg-white hover:bg-gray-200 rounded-md text-black disabled:opacity-50 flex items-center"
                    title={apiKeyMissing && useAiImagesGlobal ? "API Key missing, cannot generate AI image" : (useAiImagesGlobal ? "Refresh AI Image" : "Refresh Placeholder")}
                  >
                     {isUpdatingImage === scene.id ? (
                        <SparklesIcon className="w-3 h-3 mr-1 animate-spin" />
                     ) : useAiImagesGlobal && !apiKeyMissing ? (
                        <SparklesIcon className="w-3 h-3 mr-1" />
                     ): null}
                    {isUpdatingImage === scene.id ? 'Updating...' : (useAiImagesGlobal && !apiKeyMissing ? 'Update AI Image' : 'New Placeholder')}
                  </button>
                  <button
                    onClick={() => onDeleteScene(scene.id)}
                    disabled={isGenerating || isUpdatingImage === scene.id}
                    className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 rounded-md text-white disabled:opacity-50"
                  >
                    Delete Scene
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={onAddScene}
        disabled={isGenerating}
        className="mt-6 w-full px-4 py-2 bg-white hover:bg-gray-200 rounded-md text-black font-medium disabled:opacity-50"
      >
        Add New Scene
      </button>
    </div>
  );
};

export default SceneEditor;
