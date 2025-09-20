
export const APP_TITLE = "CineSynth";
export const DEFAULT_ASPECT_RATIO = '16:9';
export const AVERAGE_WORDS_PER_SECOND = 3.0; // Faster pace for better engagement
export const MAX_SCENE_DURATION_SECONDS = 12; // Shorter scenes for better pacing
export const MIN_SCENE_DURATION_SECONDS = 2; // Faster minimum for dynamic feel
export const TARGET_VIDEO_DURATION_MINUTES = { MIN: 7, MAX: 17 }; // Target video length
export const MAX_WORDS_PER_SCENE = 25; // Limit words per scene for better pacing

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
