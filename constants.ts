
export const APP_TITLE = "CineSynth";
export const DEFAULT_ASPECT_RATIO = '16:9';
export const AVERAGE_WORDS_PER_SECOND = 3.0; // Faster pace for better engagement
export const MAX_SCENE_DURATION_SECONDS = 12; // Shorter scenes for better pacing
export const MIN_SCENE_DURATION_SECONDS = 2; // Faster minimum for dynamic feel
export const TARGET_VIDEO_DURATION_MINUTES = { MIN: 7, MAX: 17 }; // Target video length
export const MAX_WORDS_PER_SCENE = 25; // Limit words per scene for better pacing

// Video Templates
export const VIDEO_TEMPLATES = {
  VIRAL: {
    name: 'Viral YouTube',
    description: 'Fast-paced, engaging content for maximum views',
    settings: {
      wordsPerSecond: 3.2,
      maxSceneDuration: 8,
      minSceneDuration: 1.5,
      kenBurnsIntensity: 'high',
      transitionSpeed: 'fast'
    }
  },
  EDUCATIONAL: {
    name: 'Educational',
    description: 'Clear, informative content for learning',
    settings: {
      wordsPerSecond: 2.5,
      maxSceneDuration: 15,
      minSceneDuration: 3,
      kenBurnsIntensity: 'medium',
      transitionSpeed: 'smooth'
    }
  },
  STORYTELLING: {
    name: 'Storytelling',
    description: 'Narrative-driven content with emotional impact',
    settings: {
      wordsPerSecond: 2.0,
      maxSceneDuration: 20,
      minSceneDuration: 4,
      kenBurnsIntensity: 'low',
      transitionSpeed: 'slow'
    }
  },
  TUTORIAL: {
    name: 'Tutorial',
    description: 'Step-by-step instructional content',
    settings: {
      wordsPerSecond: 2.8,
      maxSceneDuration: 12,
      minSceneDuration: 2.5,
      kenBurnsIntensity: 'medium',
      transitionSpeed: 'medium'
    }
  }
};

// Audio Effects
export const AUDIO_EFFECTS = {
  NONE: { name: 'None', description: 'No background music' },
  UPBEAT: { name: 'Upbeat', description: 'Energetic background music' },
  CALM: { name: 'Calm', description: 'Relaxing background music' },
  EPIC: { name: 'Epic', description: 'Dramatic background music' },
  TECH: { name: 'Tech', description: 'Modern tech background music' }
};

// Export Quality Options
export const EXPORT_QUALITIES = {
  PREVIEW: { name: 'Preview', resolution: '854x480', bitrate: 1200000, fps: 15 },
  STANDARD: { name: 'Standard', resolution: '1280x720', bitrate: 2500000, fps: 24 },
  HD: { name: 'HD', resolution: '1920x1080', bitrate: 5000000, fps: 30 },
  ULTRA: { name: 'Ultra HD', resolution: '3840x2160', bitrate: 15000000, fps: 30 }
};

export const FALLBACK_FOOTAGE_KEYWORDS = [
  "abstract", "cityscape", "nature", "technology", "office", "landscape", "motion graphics"
];

// Gemini model for text analysis
// Use a generally available model rather than a short-lived preview build.
export const GEMINI_TEXT_MODEL = 'gemini-1.5-flash';
// Imagen model for image generation
export const IMAGEN_MODEL = 'imagen-3.0-generate-002';


// Placeholder for API Key - this should be set in the environment
export const API_KEY = process.env.API_KEY;
// Optional URL where the main app is hosted. If set, the landing page
// will redirect here when users click "Get Started".
export const LAUNCH_URL = process.env.LAUNCH_URL;

// Premium features
export const IS_PREMIUM_USER = process.env.IS_PREMIUM_USER === 'true';
export const WATERMARK_TEXT = 'CineSynth';
