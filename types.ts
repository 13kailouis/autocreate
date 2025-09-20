
export interface KenBurnsConfig {
  targetScale: number;
  targetXPercent: number;
  targetYPercent: number;
  originXRatio: number;  // 0.0 to 1.0
  originYRatio: number;  // 0.0 to 1.0
  animationDurationS: number;
}

export interface Scene {
  id: string;
  sceneText: string;
  keywords: string[];
  imagePrompt: string; // Added for AI image generation
  duration: number; // in seconds
  footageUrl: string; // URL to image or video (can be base64 data URL)
  footageType: 'image' | 'video';
  kenBurnsConfig: KenBurnsConfig;
}

export type AspectRatio = '16:9' | '9:16';

export interface VideoOptions {
  aspectRatio: AspectRatio;
}

export interface GeneratedVideo {
  scenes: Scene[];
  options: VideoOptions;
  simulatedUrl?: string; // For simulated download
}

// For Gemini API response structure
export interface GeminiSceneResponseItem {
  sceneText: string;
  keywords: string[];
  imagePrompt: string; // Added for AI image generation
  duration: number;
}
