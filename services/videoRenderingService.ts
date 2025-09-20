
import { Scene, AspectRatio, KenBurnsConfig } from '../types.ts';
import { WATERMARK_TEXT } from '../constants.ts';
import { Muxer as WebMMuxer, ArrayBufferTarget as WebMArrayBufferTarget } from 'webm-muxer';
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';
import { buildRenderPlan, RenderMode } from './renderTiming.ts';

interface RenderConfig {
  fps: number;
  maxLandscapeWidth: number;
  maxPortraitHeight: number;
  bitrate: number;
}

const RENDER_CONFIG: Record<RenderMode, RenderConfig> = {
  preview: {
    fps: 15,
    maxLandscapeWidth: 854,
    maxPortraitHeight: 960,
    bitrate: 1_200_000,
  },
  download: {
    fps: 24,
    maxLandscapeWidth: 1280,
    maxPortraitHeight: 1280,
    bitrate: 3_500_000,
  },
};

const getRenderConfig = (mode: RenderMode): RenderConfig => RENDER_CONFIG[mode] ?? RENDER_CONFIG.preview;

const MIN_EFFECTIVE_FPS = 4;
const MIN_DOWNLOAD_FPS = 8;
const MIN_PREVIEW_FPS = 10;
const PREVIEW_FRAME_BUDGET = 3_000;
const DOWNLOAD_FRAME_BUDGET = 4_500;
const LONG_FORM_DURATION_THRESHOLD_SECONDS = 120;
const ULTRA_LONG_DURATION_THRESHOLD_SECONDS = 300;
const LONG_FORM_LANDSCAPE_LIMIT = 1_120;
const ULTRA_LONG_LANDSCAPE_LIMIT = 960;
const LONG_FORM_PORTRAIT_LIMIT = 1_120;
const ULTRA_LONG_PORTRAIT_LIMIT = 960;
const LONG_FORM_BITRATE_LIMIT = 3_000_000;
const ULTRA_LONG_BITRATE_LIMIT = 2_200_000;
const MIN_DOWNLOAD_BITRATE = 900_000;
const MIN_PREVIEW_BITRATE = 700_000;

const computeTotalSceneDurationSeconds = (scenes: Scene[]): number =>
  scenes.reduce((total, scene) => {
    const rawDuration = typeof scene.duration === 'number' && Number.isFinite(scene.duration)
      ? scene.duration
      : 0;
    return total + Math.max(0, rawDuration);
  }, 0);

const resolveOptimizedRenderConfig = (mode: RenderMode, scenes: Scene[]): RenderConfig => {
  const baseConfig = getRenderConfig(mode);
  const totalDuration = computeTotalSceneDurationSeconds(scenes);
  if (totalDuration <= 0) {
    return { ...baseConfig };
  }

  const adjustedConfig: RenderConfig = { ...baseConfig };
  const frameBudget = mode === 'download' ? DOWNLOAD_FRAME_BUDGET : PREVIEW_FRAME_BUDGET;
  const minFps = mode === 'download' ? MIN_DOWNLOAD_FPS : MIN_PREVIEW_FPS;
  const baseTotalFrames = totalDuration * baseConfig.fps;

  if (baseTotalFrames > frameBudget) {
    const allowedFpsRaw = Math.floor(frameBudget / totalDuration);
    const allowedFps = Math.max(minFps, Math.min(baseConfig.fps, allowedFpsRaw));
    if (allowedFps < adjustedConfig.fps) {
      adjustedConfig.fps = Math.max(MIN_EFFECTIVE_FPS, allowedFps);
      const bitrateScale = adjustedConfig.fps / baseConfig.fps;
      const minBitrate = mode === 'download' ? MIN_DOWNLOAD_BITRATE : MIN_PREVIEW_BITRATE;
      adjustedConfig.bitrate = Math.max(
        minBitrate,
        Math.round(baseConfig.bitrate * bitrateScale),
      );
    }
  }

  if (totalDuration > LONG_FORM_DURATION_THRESHOLD_SECONDS) {
    adjustedConfig.maxLandscapeWidth = Math.min(baseConfig.maxLandscapeWidth, LONG_FORM_LANDSCAPE_LIMIT);
    adjustedConfig.maxPortraitHeight = Math.min(baseConfig.maxPortraitHeight, LONG_FORM_PORTRAIT_LIMIT);
    adjustedConfig.bitrate = Math.min(adjustedConfig.bitrate, LONG_FORM_BITRATE_LIMIT);
  }

  if (totalDuration > ULTRA_LONG_DURATION_THRESHOLD_SECONDS) {
    adjustedConfig.maxLandscapeWidth = Math.min(adjustedConfig.maxLandscapeWidth, ULTRA_LONG_LANDSCAPE_LIMIT);
    adjustedConfig.maxPortraitHeight = Math.min(adjustedConfig.maxPortraitHeight, ULTRA_LONG_PORTRAIT_LIMIT);
    adjustedConfig.bitrate = Math.min(adjustedConfig.bitrate, ULTRA_LONG_BITRATE_LIMIT);
  }

  const minBitrate = mode === 'download' ? MIN_DOWNLOAD_BITRATE : MIN_PREVIEW_BITRATE;
  adjustedConfig.bitrate = Math.max(minBitrate, adjustedConfig.bitrate);
  adjustedConfig.fps = Math.max(MIN_EFFECTIVE_FPS, Math.min(baseConfig.fps, adjustedConfig.fps));

  return adjustedConfig;
};

const yieldToEventLoop = (): Promise<void> => new Promise(resolve => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => resolve());
    return;
  }
  setTimeout(resolve, 0);
});

const WEB_CODECS_WEBM_CODEC_CANDIDATES = ['vp09.00.10.08', 'vp8'] as const;
const MP4_CODEC_CANDIDATES = ['avc1.640028', 'avc1.4D4028', 'avc1.42E01E'] as const;
const MP4_MIMETYPE = 'video/mp4';
const WEBM_MIMETYPE = 'video/webm';

// watermark text size relative to canvas height
const WATERMARK_FONT_HEIGHT_PERCENT = 0.03;

const IMAGE_LOAD_RETRIES = 2; // Reduced for faster failure if needed
const INITIAL_RETRY_DELAY_MS = 300;
const MEDIA_RECORDER_DEFAULT_BITRATE = 2_500_000; // Default fallback if config bitrate unavailable
const MEDIA_RECORDER_TIMESLICE_MS = 100; // Get data every 100ms
const VIDEO_FRAME_CAPTURE_TIME = 0; // seconds - capture first frame

const hasWebCodecsSupport = (): boolean => {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return typeof w.VideoEncoder === 'function' && typeof w.VideoFrame === 'function';
};

interface VideoRenderOptions {
  includeWatermark: boolean;
  mode?: RenderMode;
}

export interface GeneratedVideoResult {
  blob: Blob;
  mimeType: string;
  format: 'webm' | 'mp4';
}

const FALLBACK_BASE64_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9z9zsAAAAASUVORK5CYII='; // 1x1 gray pixel

const MIN_PRELOAD_CONCURRENCY = 2;
const MAX_PRELOAD_CONCURRENCY = 6;

interface PreloadedImage {
  sceneId: string;
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose?: () => void;
}

const createAbortError = (): Error => {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Video rendering was cancelled.', 'AbortError');
  }
  const error = new Error('Video rendering was cancelled.');
  error.name = 'AbortError';
  return error;
};

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  if (!error || typeof error !== 'object') {
    return false;
  }
  return (error as { name?: string }).name === 'AbortError';
};

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw createAbortError();
  }
};

const resolvePreloadConcurrency = (): number => {
  if (typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number') {
    const suggested = Math.max(
      MIN_PRELOAD_CONCURRENCY,
      Math.floor(navigator.hardwareConcurrency / 2),
    );
    return Math.min(MAX_PRELOAD_CONCURRENCY, suggested || MIN_PRELOAD_CONCURRENCY);
  }
  return 4;
};

function getCanvasDimensions(
  aspectRatio: AspectRatio,
  config: RenderConfig,
): { width: number; height: number } {
  if (aspectRatio === '16:9') {
    const width = config.maxLandscapeWidth;
    const height = Math.round((width * 9) / 16);
    return { width, height };
  }

  const height = config.maxPortraitHeight;
  const width = Math.round((height * 9) / 16);
  return { width, height };
}

// Enhanced easing functions for viral YouTube-style animations
const easeInOutCubic = (t: number): number => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const easeOutQuart = (t: number): number => {
  return 1 - Math.pow(1 - t, 4);
};

const easeInOutQuart = (t: number): number => {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
};

// Smooth bezier curves for professional video editing
const smoothBezier = (t: number): number => {
  return t * t * (3.0 - 2.0 * t); // Smoothstep function
};

const easeInOutExpo = (t: number): number => {
  return t === 0 ? 0 : t === 1 ? 1 : t < 0.5 
    ? Math.pow(2, 20 * t - 10) / 2 
    : (2 - Math.pow(2, -20 * t + 10)) / 2;
};

// Hook curve for engaging content (starts fast, slows down)
const hookCurve = (t: number): number => {
  return 1 - Math.pow(1 - t, 3);
};

function drawImageWithKenBurns(
  ctx: CanvasRenderingContext2D,
  image: PreloadedImage,
  canvasWidth: number,
  canvasHeight: number,
  progressInScene: number, // 0 to 1
  kbConfig: KenBurnsConfig
) {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const initialScale = 1.0;
  const initialXPercent = 0;
  const initialYPercent = 0;

  // Apply ultra-smooth easing for professional video editing
  const easedProgress = smoothBezier(progressInScene);
  const scaleProgress = easeInOutExpo(progressInScene); // Ultra-smooth scale
  const movementProgress = hookCurve(progressInScene); // Hook curve for engagement
  
  const currentScale = initialScale + (kbConfig.targetScale - initialScale) * scaleProgress;
  const currentXPercent = initialXPercent + (kbConfig.targetXPercent - initialXPercent) * movementProgress;
  const currentYPercent = initialYPercent + (kbConfig.targetYPercent - initialYPercent) * movementProgress;

  // Add ultra-smooth rotation for cinematic effect
  const rotationAngle = Math.sin(progressInScene * Math.PI * 2) * 0.3; // Smoother rotation

  const currentXTranslatePx = (canvasWidth * currentXPercent) / 100;
  const currentYTranslatePx = (canvasHeight * currentYPercent) / 100;

  ctx.save();

  // Enable anti-aliasing and smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.textRenderingOptimization = 'optimizeQuality';

  const originPxX = canvasWidth * kbConfig.originXRatio;
  const originPxY = canvasHeight * kbConfig.originYRatio;
  
  // Apply transformations with ultra-smooth rotation
  ctx.translate(originPxX, originPxY);
  ctx.rotate(rotationAngle * Math.PI / 180); // Convert to radians
  ctx.scale(currentScale, currentScale);
  ctx.translate(-originPxX, -originPxY);
  ctx.translate(currentXTranslatePx, currentYTranslatePx);

  let dx, dy, dw, dh;
  const imgNaturalAspect = image.width / image.height || 1;
  const canvasViewAspect = canvasWidth / canvasHeight;

  if (imgNaturalAspect > canvasViewAspect) {
      dh = canvasHeight;
      dw = dh * imgNaturalAspect;
      dx = (canvasWidth - dw) / 2;
      dy = 0;
  } else {
      dw = canvasWidth;
      dh = dw / imgNaturalAspect;
      dx = 0;
      dy = (canvasHeight - dh) / 2;
  }
  
  // Add subtle brightness/contrast adjustment for more cinematic look
  ctx.filter = `brightness(${1 + progressInScene * 0.05}) contrast(${1 + progressInScene * 0.02})`;
  
  ctx.drawImage(image.source, dx, dy, dw, dh);
  
  // Add dynamic vignette effect that changes over time
  ctx.save();
  const vignetteIntensity = 0.08 + Math.sin(progressInScene * Math.PI * 2) * 0.03; // Smoother vignette
  const vignetteGradient = ctx.createRadialGradient(
    canvasWidth / 2, canvasHeight / 2, 0,
    canvasWidth / 2, canvasHeight / 2, Math.max(canvasWidth, canvasHeight) * 0.9
  );
  vignetteGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignetteGradient.addColorStop(0.8, 'rgba(0, 0, 0, 0)');
  vignetteGradient.addColorStop(1, `rgba(0, 0, 0, ${vignetteIntensity})`);
  ctx.fillStyle = vignetteGradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.restore();
  
  // Add professional color grading effect
  ctx.save();
  const colorGradingIntensity = 0.015 + Math.sin(progressInScene * Math.PI * 2) * 0.008;
  const colorGradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
  colorGradient.addColorStop(0, `rgba(255, 220, 120, ${colorGradingIntensity})`);
  colorGradient.addColorStop(0.5, `rgba(255, 255, 255, 0)`);
  colorGradient.addColorStop(1, `rgba(120, 160, 255, ${colorGradingIntensity})`);
  ctx.fillStyle = colorGradient;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.restore();
  
  // Add hook effect - attention-grabbing elements
  if (progressInScene < 0.1) {
    // Opening hook - bright flash effect
    ctx.save();
    const hookIntensity = (1 - progressInScene * 10) * 0.1;
    ctx.fillStyle = `rgba(255, 255, 255, ${hookIntensity})`;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.restore();
  }
  
  // Add engagement elements - subtle motion blur simulation
  if (progressInScene > 0.8) {
    ctx.save();
    const blurIntensity = (progressInScene - 0.8) * 5 * 0.02;
    ctx.filter = `blur(${blurIntensity}px) brightness(1.02)`;
    ctx.globalAlpha = 0.3;
    ctx.drawImage(image.source, dx, dy, dw, dh);
    ctx.restore();
  }
  
  ctx.restore();
}


const ACCENT_COLOR_PALETTE = [
  '#FF5F6D',
  '#FF9966',
  '#FDCB6E',
  '#54A0FF',
  '#5F27CD',
  '#48DB71',
  '#FF6B6B',
  '#1B9CFC',
  '#FF9FF3',
  '#10AC84',
];

const KEYWORD_CHIP_LIMIT = 3;
const SUBTITLE_MAX_WORDS = 42;

const sanitizeSceneText = (value?: string): string =>
  value ? value.replace(/\s+/g, ' ').trim() : '';

const sceneAccentHash = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
};

const computeSceneAccentColor = (scene: Scene): string => {
  const key = `${scene.id}|${scene.keywords?.join('-') ?? ''}|${scene.imagePrompt ?? ''}|${scene.sceneText ?? ''}`;
  const hash = Math.abs(sceneAccentHash(key));
  return ACCENT_COLOR_PALETTE[hash % ACCENT_COLOR_PALETTE.length];
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map(ch => ch + ch).join('')
    : normalized;
  if (value.length !== 6) {
    return null;
  }
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  if ([r, g, b].some(component => Number.isNaN(component))) {
    return null;
  }
  return { r, g, b };
};

const mixHexColors = (hex: string, mixHex: string, weight: number): string => {
  const base = hexToRgb(hex);
  const mix = hexToRgb(mixHex);
  if (!base || !mix) {
    return hex;
  }
  const clamped = Math.max(0, Math.min(1, weight));
  const r = Math.round(base.r * (1 - clamped) + mix.r * clamped);
  const g = Math.round(base.g * (1 - clamped) + mix.g * clamped);
  const b = Math.round(base.b * (1 - clamped) + mix.b * clamped);
  return `rgb(${r}, ${g}, ${b})`;
};

const lightenColor = (hex: string, amount: number): string => mixHexColors(hex, '#ffffff', amount);
const darkenColor = (hex: string, amount: number): string => mixHexColors(hex, '#000000', amount);

const wrapTextIntoLines = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const tentative = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(tentative).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = tentative;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
};

const drawRoundedRectPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  const clampedRadius = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + clampedRadius, y);
  ctx.lineTo(x + width - clampedRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
  ctx.lineTo(x + width, y + height - clampedRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height);
  ctx.lineTo(x + clampedRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
  ctx.lineTo(x, y + clampedRadius);
  ctx.quadraticCurveTo(x, y, x + clampedRadius, y);
  ctx.closePath();
};


function drawKeywordChips(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  accentColor: string,
  canvasWidth: number,
  _canvasHeight: number,
  overlayTop: number,
  basePadding: number,
  overlayAlpha: number,
  accentBarWidth: number,
  baseFontSize: number,
): void {
  const keywords = (scene.keywords || []).filter(Boolean).slice(0, KEYWORD_CHIP_LIMIT);
  if (keywords.length === 0) {
    return;
  }

  const chipFontSize = Math.max(14, Math.round(baseFontSize * 0.55));
  const chipPaddingX = Math.round(chipFontSize * 0.7);
  const chipPaddingY = Math.round(chipFontSize * 0.5);
  const startingX = basePadding + accentBarWidth + basePadding * 0.5;
  let chipX = startingX;
  const chipY = Math.max(basePadding, overlayTop - chipFontSize - basePadding * 0.6);
  const maxX = canvasWidth - basePadding;

  ctx.save();
  ctx.globalAlpha = Math.min(1, overlayAlpha * 0.95);
  ctx.font = `600 ${chipFontSize}px "Inter", "Helvetica Neue", "Arial", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  for (const keyword of keywords) {
    const sanitized = keyword.replace(/[^a-z0-9\s]/gi, ' ').trim();
    if (!sanitized) {
      continue;
    }
    const label = `#${sanitized.replace(/\s+/g, '').toUpperCase()}`;
    const textWidth = ctx.measureText(label).width;
    const chipWidth = textWidth + chipPaddingX * 2;
    const chipHeight = chipFontSize + chipPaddingY * 2;
    if (chipX + chipWidth > maxX) {
      break;
    }

    drawRoundedRectPath(ctx, chipX, chipY, chipWidth, chipHeight, chipHeight / 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fill();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = Math.max(1, Math.round(chipFontSize * 0.12));
    ctx.stroke();

    ctx.fillStyle = 'white';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = Math.round(chipFontSize * 0.5);
    ctx.shadowOffsetY = Math.round(chipFontSize * 0.15);
    ctx.fillText(label, chipX + chipWidth / 2, chipY + chipHeight / 2 + 0.5);

    chipX += chipWidth + chipPaddingX * 0.7;
  }

  ctx.restore();
}

function drawSceneTextOverlay(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  canvasWidth: number,
  canvasHeight: number,
  progressInScene: number,
  accentColorOverride?: string,
): void {
  const sanitized = sanitizeSceneText(scene.sceneText);
  if (!sanitized) {
    return;
  }

  const accentColor = accentColorOverride ?? computeSceneAccentColor(scene);
  const easedProgress = easeInOutCubic(Math.max(0, Math.min(1, progressInScene)));
  const revealRatio = 0.45 + 0.55 * easedProgress;
  const words = sanitized.split(' ');
  const limitedWords = words.slice(0, Math.min(SUBTITLE_MAX_WORDS, words.length));
  const visibleWordCount = easedProgress >= 0.98
    ? limitedWords.length
    : Math.max(1, Math.floor(limitedWords.length * revealRatio));
  const textToDisplay = limitedWords.slice(0, visibleWordCount).join(' ');

  if (!textToDisplay) {
    return;
  }

  const basePadding = Math.round(canvasWidth * 0.06);
  const maxWidth = canvasWidth - basePadding * 2;
  const fontSize = Math.max(28, Math.round(canvasHeight * 0.065)); // Slightly larger font
  const lineHeight = fontSize * 1.15;

  ctx.save();
  ctx.font = `800 ${fontSize}px "Inter", "Helvetica Neue", "Arial", sans-serif`; // Bolder font
  const lines = wrapTextIntoLines(ctx, textToDisplay.toUpperCase(), maxWidth);
  const maxLines = canvasHeight < 720 ? 3 : 4;
  const trimmedLines = lines.slice(0, maxLines);
  if (trimmedLines.length === 0) {
    ctx.restore();
    return;
  }

  const textBlockHeight = trimmedLines.length * lineHeight;
  const overlayHeight = textBlockHeight + basePadding * 2.2; // More padding
  const overlayTop = canvasHeight - overlayHeight;
  
  // Enhanced alpha with pulsing effect
  const pulseEffect = 1 + Math.sin(progressInScene * Math.PI * 4) * 0.05; // Subtle pulse
  const overlayAlpha = Math.min(1, 0.3 + easedProgress * 0.95) * pulseEffect;

  // Enhanced gradient with more dramatic effect
  const gradient = ctx.createLinearGradient(0, overlayTop - basePadding, 0, canvasHeight);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.3)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.9)'); // More dramatic gradient

  ctx.save();
  ctx.globalAlpha = overlayAlpha;
  ctx.fillStyle = gradient;
  ctx.fillRect(0, overlayTop - basePadding, canvasWidth, overlayHeight + basePadding * 1.8);
  ctx.restore();

  // Enhanced accent bar with glow effect
  const accentBarWidth = Math.max(8, Math.round(canvasWidth * 0.015));
  const accentBarHeight = overlayHeight - basePadding * 1.2;
  
  // Add glow effect to accent bar
  ctx.save();
  ctx.globalAlpha = overlayAlpha * 0.6;
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 20;
  ctx.fillStyle = accentColor;
  ctx.fillRect(basePadding * 0.5, overlayTop + basePadding * 0.6, accentBarWidth, accentBarHeight);
  ctx.restore();
  
  // Main accent bar
  ctx.save();
  ctx.globalAlpha = overlayAlpha;
  ctx.fillStyle = accentColor;
  ctx.fillRect(basePadding * 0.5, overlayTop + basePadding * 0.6, accentBarWidth, accentBarHeight);
  ctx.restore();

  // Enhanced text rendering with better effects
  ctx.save();
  ctx.globalAlpha = overlayAlpha;
  ctx.font = `800 ${fontSize}px "Inter", "Helvetica Neue", "Arial", sans-serif`;
  ctx.fillStyle = 'white';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  
  // Enhanced shadow with color variation
  const shadowIntensity = 0.8 + Math.sin(progressInScene * Math.PI * 2) * 0.2;
  ctx.shadowColor = `rgba(0, 0, 0, ${0.7 * shadowIntensity})`;
  ctx.shadowBlur = Math.round(fontSize * 0.6);
  ctx.shadowOffsetY = Math.round(fontSize * 0.25);

  // Add engaging text animation that prevents skipping
  const textOffsetX = Math.sin(progressInScene * Math.PI * 2) * 1.5; // Smoother horizontal movement
  const textOffsetY = Math.sin(progressInScene * Math.PI * 1.5) * 0.8; // Smoother vertical movement
  
  // Add attention-grabbing text effects
  const textPulse = 1 + Math.sin(progressInScene * Math.PI * 4) * 0.05; // Subtle text pulse
  const textGlow = progressInScene < 0.2 ? (1 - progressInScene * 5) * 0.3 : 0; // Opening glow

  trimmedLines.forEach((line, index) => {
    const y = overlayTop + basePadding + (index + 1) * lineHeight;
    const x = basePadding + accentBarWidth + basePadding * 0.6 + textOffsetX;
    const yPos = y + textOffsetY;
    
    // Add word-by-word reveal effect with engagement
    const wordRevealProgress = Math.min(1, (progressInScene - index * 0.08) * 1.5);
    if (wordRevealProgress > 0) {
      ctx.globalAlpha = overlayAlpha * wordRevealProgress * textPulse;
      
      // Add opening glow effect
      if (textGlow > 0) {
        ctx.save();
        ctx.shadowColor = `rgba(255, 255, 255, ${textGlow})`;
        ctx.shadowBlur = 20;
        ctx.fillText(line, x, yPos);
        ctx.restore();
      } else {
        ctx.fillText(line, x, yPos);
      }
    }
  });
  ctx.restore();

  // Enhanced keyword chips
  drawKeywordChips(
    ctx,
    scene,
    accentColor,
    canvasWidth,
    canvasHeight,
    overlayTop,
    basePadding,
    overlayAlpha,
    accentBarWidth,
    fontSize,
  );

  ctx.restore();
}

const convertCanvasToImage = async (canvas: HTMLCanvasElement): Promise<HTMLImageElement> => {
  const dataUrl = canvas.toDataURL('image/png');
  const image = new Image();
  image.src = dataUrl;
  if (typeof image.decode === 'function') {
    try {
      await image.decode();
    } catch {
      // ignore decode errors and fall back to load event
    }
  }
  if (!image.complete) {
    await new Promise<void>(resolve => {
      image.onload = () => resolve();
      image.onerror = () => resolve();
    });
  }
  return image;
};

const createStylizedFallbackImage = async (
  scene: Scene,
  aspectRatio: AspectRatio,
): Promise<HTMLImageElement> => {
  const width = aspectRatio === '16:9' ? 1280 : Math.round(1280 * 9 / 16);
  const height = aspectRatio === '16:9' ? Math.round((width * 9) / 16) : 1280;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    const fallbackImg = new Image();
    fallbackImg.src = FALLBACK_BASE64_IMAGE;
    if (!fallbackImg.complete) {
      await new Promise<void>(resolve => {
        fallbackImg.onload = () => resolve();
        fallbackImg.onerror = () => resolve();
      });
    }
    return fallbackImg;
  }

  ctx.imageSmoothingQuality = 'high';

  const accentColor = computeSceneAccentColor(scene);
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, lightenColor(accentColor, 0.45));
  gradient.addColorStop(1, darkenColor(accentColor, 0.35));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.22;
  const stripeColor = lightenColor(accentColor, 0.6);
  const stripeWidth = Math.max(width, height) / 3.2;
  for (let offset = -height; offset < width * 1.5; offset += stripeWidth * 0.75) {
    ctx.fillStyle = stripeColor;
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + stripeWidth, 0);
    ctx.lineTo(offset + stripeWidth * 0.4, height);
    ctx.lineTo(offset - stripeWidth * 0.6, height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  const ellipseRadius = Math.max(width, height) * 0.55;
  ctx.beginPath();
  ctx.ellipse(width * 0.72, height * 0.32, ellipseRadius, ellipseRadius * 0.55, Math.PI / 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Removed subtitle overlay for cleaner look

  return convertCanvasToImage(canvas);
};


function drawWatermark(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, text: string) {
  const fontSize = Math.round(canvasHeight * WATERMARK_FONT_HEIGHT_PERCENT);
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.textAlign = 'right';
  ctx.fillText(text, canvasWidth - 10, canvasHeight - 10);
}

async function loadImageWithRetries(
  src: string,
  scene: Scene,
  sceneIndexForLog: number,
  aspectRatio: AspectRatio,
  signal?: AbortSignal,
): Promise<HTMLImageElement> {
  if (!src) {
    console.warn(`[Video Rendering Service] Scene ${sceneIndexForLog + 1} has no image source. Generating fallback visual.`);
    return createStylizedFallbackImage(scene, aspectRatio);
  }

  for (let attempt = 0; attempt <= IMAGE_LOAD_RETRIES; attempt++) {
    try {
      throwIfAborted(signal);
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        if (!src.startsWith('data:')) {
          img.crossOrigin = 'anonymous';
        }
        img.decoding = 'async';
        function cleanup() {
          img.onload = null;
          img.onerror = null;
          if (signal) {
            signal.removeEventListener('abort', handleAbort);
          }
        }
        function handleAbort() {
          cleanup();
          reject(createAbortError());
        }
        img.onload = () => {
          cleanup();
          resolve(img);
        };
        img.onerror = (eventOrMessage) => {
          let errorMessage = `Failed to load image for scene ${sceneIndexForLog + 1} (ID: ${scene.id}, URL: ${src.substring(0, 100)}...), attempt ${attempt + 1}/${IMAGE_LOAD_RETRIES + 1}.`;
          if (typeof eventOrMessage === 'string') {
            errorMessage += ` Details: ${eventOrMessage}`;
          } else if (eventOrMessage && (eventOrMessage as Event).type) {
            errorMessage += ` Event type: ${(eventOrMessage as Event).type}.`;
          }
          cleanup();
          reject(new Error(errorMessage));
        };
        if (signal) {
          if (signal.aborted) {
            handleAbort();
            return;
          }
          signal.addEventListener('abort', handleAbort, { once: true });
        }
        img.src = src;
      });
      if (typeof image.decode === 'function') {
        try {
          await image.decode();
        } catch {
          // ignore decode failure; onload already fired
        }
      }
      throwIfAborted(signal);
      return image;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      console.warn(`Image load attempt ${attempt + 1} failed for scene ${sceneIndexForLog + 1}. Error: ${(error as Error).message}`);
      if (attempt < IMAGE_LOAD_RETRIES) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        await new Promise(res => setTimeout(res, delay));
      } else {
        console.error(`All ${IMAGE_LOAD_RETRIES + 1} attempts to load image for scene ${sceneIndexForLog + 1} failed. Using stylized fallback.`);
        return createStylizedFallbackImage(scene, aspectRatio);
      }
    }
  }

  return createStylizedFallbackImage(scene, aspectRatio);
}

async function loadVideoFrameWithRetries(
  src: string,
  scene: Scene,
  sceneIndexForLog: number,
  aspectRatio: AspectRatio,
  signal?: AbortSignal,
): Promise<HTMLImageElement> {
  if (!src) {
    console.warn(`[Video Rendering Service] Scene ${sceneIndexForLog + 1} has no video source. Generating fallback visual.`);
    return createStylizedFallbackImage(scene, aspectRatio);
  }

  for (let attempt = 0; attempt <= IMAGE_LOAD_RETRIES; attempt++) {
    try {
      throwIfAborted(signal);
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const video = document.createElement('video');
        if (!src.startsWith('data:')) {
          video.crossOrigin = 'anonymous';
        }
        video.preload = 'auto';
        video.muted = true;
        function cleanup() {
          video.onloadeddata = null;
          video.onerror = null;
          if (signal) {
            signal.removeEventListener('abort', handleAbort);
          }
        }
        function handleAbort() {
          cleanup();
          reject(createAbortError());
        }
        video.onloadeddata = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 1;
            canvas.height = video.videoHeight || 1;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Failed to get canvas context for video frame');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = new Image();
            img.src = canvas.toDataURL('image/png');
            img.decoding = 'async';
            img.onload = () => {
              cleanup();
              resolve(img);
            };
          } catch (err) {
            cleanup();
            reject(err);
          }
        };
        video.onerror = (eventOrMessage) => {
          let errorMessage = `Failed to load video for scene ${sceneIndexForLog + 1} (ID: ${scene.id}, URL: ${src.substring(0, 100)}...), attempt ${attempt + 1}/${IMAGE_LOAD_RETRIES + 1}.`;
          if (eventOrMessage && (eventOrMessage as Event).type) {
            errorMessage += ` Event type: ${(eventOrMessage as Event).type}.`;
          }
          cleanup();
          reject(new Error(errorMessage));
        };
        video.currentTime = VIDEO_FRAME_CAPTURE_TIME;
        if (signal) {
          if (signal.aborted) {
            handleAbort();
            return;
          }
          signal.addEventListener('abort', handleAbort, { once: true });
        }
        video.src = src;
      });
      if (typeof image.decode === 'function') {
        try {
          await image.decode();
        } catch {
          // ignore decode failure
        }
      }
      throwIfAborted(signal);
      return image;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      console.warn(`Video load attempt ${attempt + 1} failed for scene ${sceneIndexForLog + 1}. Error: ${(error as Error).message}`);
      if (attempt < IMAGE_LOAD_RETRIES) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        await new Promise(res => setTimeout(res, delay));
      } else {
        console.error(`All ${IMAGE_LOAD_RETRIES + 1} attempts to load video for scene ${sceneIndexForLog + 1} failed. Using stylized fallback.`);
        return createStylizedFallbackImage(scene, aspectRatio);
      }
    }
  }

  return createStylizedFallbackImage(scene, aspectRatio);
}

async function createPreloadedImageFromElement(
  sceneId: string,
  element: HTMLImageElement,
  signal?: AbortSignal,
): Promise<PreloadedImage> {
  throwIfAborted(signal);
  const baseWidth = element.naturalWidth || element.width || 1;
  const baseHeight = element.naturalHeight || element.height || 1;

  if (typeof createImageBitmap === 'function') {
    try {
      if (typeof element.decode === 'function') {
        try {
          await element.decode();
        } catch {
          // ignore decode failure
        }
      }
      throwIfAborted(signal);
      const bitmap = await createImageBitmap(element);
      return {
        sceneId,
        source: bitmap,
        width: bitmap.width || baseWidth,
        height: bitmap.height || baseHeight,
        dispose: () => bitmap.close(),
      };
    } catch (error) {
      console.warn('[Video Rendering Service] Failed to create ImageBitmap. Falling back to HTMLImageElement.', error);
    }
  }

  return {
    sceneId,
    source: element,
    width: baseWidth,
    height: baseHeight,
  };
}

async function preloadAllImages(
  scenes: Scene[],
  aspectRatio: AspectRatio,
  onProgress: (message: string, value: number) => void,
  signal?: AbortSignal,
): Promise<PreloadedImage[]> {
  onProgress('Preloading images...', 0);
  const results: PreloadedImage[] = [];
  const concurrency = Math.min(resolvePreloadConcurrency(), scenes.length || MIN_PRELOAD_CONCURRENCY);
  let index = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      throwIfAborted(signal);
      const i = index++;
      if (i >= scenes.length) {
        return;
      }
      const scene = scenes[i];
      let baseImage: HTMLImageElement;
      try {
        baseImage = scene.footageType === 'video'
          ? await loadVideoFrameWithRetries(scene.footageUrl, scene, i, aspectRatio, signal)
          : await loadImageWithRetries(scene.footageUrl, scene, i, aspectRatio, signal);
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        console.warn(`[Video Rendering Service] Preloading fallback for scene ${i + 1} due to error: ${(error as Error).message}`);
        baseImage = await createStylizedFallbackImage(scene, aspectRatio);
      }
      const prepared = await createPreloadedImageFromElement(scene.id, baseImage, signal);
      results.push(prepared);
      completed += 1;
      onProgress(`Preloading images... (${completed}/${scenes.length})`, completed / scenes.length);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
  onProgress('All images preloaded.', 1);
  return results;
}


const generateVideoWithWebCodecs = (
  scenes: Scene[],
  aspectRatio: AspectRatio,
  options: VideoRenderOptions,
  config: RenderConfig,
  onProgressCallback?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<GeneratedVideoResult> => {
  console.log('[Video Rendering Service] Using WebCodecs accelerated renderer.');
  return new Promise(async (resolve, reject) => {
    let encoder: VideoEncoder | null = null;
    let preloadedImages: PreloadedImage[] = [];
    try {
      const { width: canvasWidth, height: canvasHeight } = getCanvasDimensions(aspectRatio, config);
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d', { alpha: false });

      if (!ctx) {
        throw new Error('Failed to get canvas context for WebCodecs video generation.');
      }

      const frameDurationUS = Math.round(1_000_000 / config.fps);

      const updateOverallProgress = (stageProgress: number, stageWeight: number, baseProgress: number) => {
        if (onProgressCallback) {
          onProgressCallback(Math.min(0.99, baseProgress + stageProgress * stageWeight));
        }
      };

      preloadedImages = await preloadAllImages(scenes, aspectRatio, (_msg, val) => {
        updateOverallProgress(val, 0.2, 0);
      }, signal);

      throwIfAborted(signal);

      const imageMap = new Map<string, PreloadedImage>();
      preloadedImages.forEach(item => imageMap.set(item.sceneId, item));
      const accentColorMap = new Map<string, string>();
      scenes.forEach(scene => {
        accentColorMap.set(scene.id, computeSceneAccentColor(scene));
      });

      const mode = options.mode ?? 'preview';
      const renderPlan = buildRenderPlan(scenes, config.fps, mode);
      const totalFramesToRenderOverall = renderPlan.reduce((acc, item) => acc + item.frameCount, 0);

      if (mode === 'preview') {
        const totalPlannedDurationSeconds = renderPlan.reduce((acc, item) => acc + item.durationSeconds, 0);
        console.log(
          `[Video Rendering Service] Preview duration limited to ${totalPlannedDurationSeconds.toFixed(2)}s across ${renderPlan.length} scenes.`,
        );
      }

      const videoEncoderAccess = window as unknown as {
        VideoEncoder?: typeof VideoEncoder;
        VideoFrame?: typeof VideoFrame;
      };
      const VideoEncoderCtor = videoEncoderAccess.VideoEncoder;
      const VideoFrameCtor = videoEncoderAccess.VideoFrame;

      if (!VideoEncoderCtor || !VideoFrameCtor) {
        throw new Error('WebCodecs API is unavailable in this browser.');
      }

      const createBaseEncoderConfig = (codec: string): VideoEncoderConfig => ({
        codec,
        width: canvasWidth,
        height: canvasHeight,
        bitrate: config.bitrate,
        framerate: config.fps,
        latencyMode: 'quality',
        hardwareAcceleration: 'prefer-hardware',
      });

      const defaultEncoderConfig = createBaseEncoderConfig(WEB_CODECS_WEBM_CODEC_CANDIDATES[0]);

      type ChunkWriter = (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void;
      let addVideoChunk: ChunkWriter | null = null;
      let finalizeMuxer: (() => Blob) | null = null;
      let chosenFormat: 'webm' | 'mp4' = 'webm';
      let chosenMimeType = WEBM_MIMETYPE;
      let encoderConfig: VideoEncoderConfig = { ...defaultEncoderConfig };

      const isConfigSupportedFn =
        typeof (VideoEncoderCtor as typeof VideoEncoder).isConfigSupported === 'function'
          ? (VideoEncoderCtor as typeof VideoEncoder).isConfigSupported.bind(VideoEncoderCtor)
          : null;

      if (options.mode === 'download' && isConfigSupportedFn) {
        for (const codec of MP4_CODEC_CANDIDATES) {
          const candidateConfig: VideoEncoderConfig = {
            ...defaultEncoderConfig,
            codec,
          };
          try {
            const support = await isConfigSupportedFn(candidateConfig);
            if (support.supported) {
              const mp4Target = new Mp4ArrayBufferTarget();
              const mp4Muxer = new Mp4Muxer({
                target: mp4Target,
                video: {
                  codec: 'avc',
                  width: canvasWidth,
                  height: canvasHeight,
                  frameRate: config.fps,
                },
                fastStart: 'in-memory',
                firstTimestampBehavior: 'offset',
              });

              addVideoChunk = (chunk, meta) => mp4Muxer.addVideoChunk(chunk, meta);
              finalizeMuxer = () => {
                mp4Muxer.finalize();
                return new Blob([mp4Target.buffer], { type: MP4_MIMETYPE });
              };
              chosenFormat = 'mp4';
              chosenMimeType = MP4_MIMETYPE;

              encoderConfig = {
                ...candidateConfig,
                ...support.config,
                codec: support.config.codec ?? codec,
                width: support.config.width ?? canvasWidth,
                height: support.config.height ?? canvasHeight,
                bitrate: support.config.bitrate ?? candidateConfig.bitrate,
                framerate: support.config.framerate ?? candidateConfig.framerate,
                hardwareAcceleration:
                  support.config.hardwareAcceleration ?? candidateConfig.hardwareAcceleration,
                latencyMode: support.config.latencyMode ?? candidateConfig.latencyMode,
              };
              console.log('[Video Rendering Service] MP4 WebCodecs pipeline selected with codec', encoderConfig.codec);
              break;
            }
          } catch (error) {
            console.warn(`[Video Rendering Service] MP4 codec ${codec} unavailable, trying next candidate.`, error);
          }
        }
      }

      if (!addVideoChunk || !finalizeMuxer) {
        const muxerTarget = new WebMArrayBufferTarget();
        const muxer = new WebMMuxer({
          target: muxerTarget,
          video: {
            codec: 'V_VP9',
            width: canvasWidth,
            height: canvasHeight,
            frameRate: config.fps,
            alpha: false,
          },
        });

        addVideoChunk = (chunk, meta) => muxer.addVideoChunk(chunk, meta);
        finalizeMuxer = () => {
          muxer.finalize();
          return new Blob([muxerTarget.buffer], { type: WEBM_MIMETYPE });
        };
        chosenFormat = 'webm';
        chosenMimeType = WEBM_MIMETYPE;

        let selectedCodec = encoderConfig.codec ?? defaultEncoderConfig.codec;
        if (isConfigSupportedFn) {
          let configured = false;
          for (const codec of WEB_CODECS_WEBM_CODEC_CANDIDATES) {
            const candidateConfig = createBaseEncoderConfig(codec);
            try {
              const support = await isConfigSupportedFn(candidateConfig);
              if (support.supported) {
                encoderConfig = {
                  ...candidateConfig,
                  ...support.config,
                  codec: support.config.codec ?? candidateConfig.codec,
                  width: support.config.width ?? canvasWidth,
                  height: support.config.height ?? canvasHeight,
                  bitrate: support.config.bitrate ?? candidateConfig.bitrate,
                  framerate: support.config.framerate ?? candidateConfig.framerate,
                  hardwareAcceleration:
                    support.config.hardwareAcceleration ?? candidateConfig.hardwareAcceleration,
                  latencyMode: support.config.latencyMode ?? candidateConfig.latencyMode,
                };
                selectedCodec = encoderConfig.codec ?? codec;
                configured = true;
                break;
              }
            } catch (error) {
              console.warn(`[Video Rendering Service] WebM codec ${codec} validation failed, trying next candidate.`, error);
            }
          }

          if (!configured) {
            encoderConfig = { ...defaultEncoderConfig };
            selectedCodec = encoderConfig.codec ?? defaultEncoderConfig.codec;
            console.warn('[Video Rendering Service] Falling back to default WebM encoder configuration.');
          }
        } else {
          encoderConfig = { ...defaultEncoderConfig };
          selectedCodec = encoderConfig.codec ?? defaultEncoderConfig.codec;
        }

        console.log('[Video Rendering Service] WebM WebCodecs pipeline selected with codec', selectedCodec);
      }

      if (!addVideoChunk || !finalizeMuxer) {
        throw new Error('Failed to initialise the media muxer.');
      }

      encoderConfig = {
        ...encoderConfig,
        width: canvasWidth,
        height: canvasHeight,
        bitrate: encoderConfig.bitrate ?? config.bitrate,
        framerate: encoderConfig.framerate ?? config.fps,
        hardwareAcceleration: encoderConfig.hardwareAcceleration ?? 'prefer-hardware',
        latencyMode: encoderConfig.latencyMode ?? 'quality',
      };

      encoder = new VideoEncoderCtor({
        output: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => {
          addVideoChunk(chunk, meta);
        },
        error: (error: unknown) => {
          const err =
            error instanceof Error
              ? error
              : new Error((error && typeof error === 'object' && 'toString' in error)
                  ? String((error as { toString: () => string }).toString())
                  : 'Unknown VideoEncoder error');
          reject(err);
        },
      });

      encoder.configure(encoderConfig);
      const effectiveFrameRate = encoderConfig.framerate ?? config.fps;
      console.log(
        `[Video Rendering Service] Encoder configured for ${chosenFormat.toUpperCase()} output at ${effectiveFrameRate} FPS.`,
      );

      let totalFramesRenderedOverall = 0;
      let framesSinceLastYield = 0;
      const framesBetweenYields = Math.max(60, Math.round(config.fps * 3));

      for (const planItem of renderPlan) {
        const { scene, frameCount } = planItem;
        throwIfAborted(signal);
        const img = imageMap.get(scene.id);
        if (!img) {
          throw new Error(`Internal error: Preloaded image missing for scene ${scene.id}`);
        }

        const numFramesForScene = frameCount;
        const accentColor = accentColorMap.get(scene.id) ?? computeSceneAccentColor(scene);
        for (let frameIndex = 0; frameIndex < numFramesForScene; frameIndex++) {
          throwIfAborted(signal);
          const progressInThisScene = numFramesForScene <= 1 ? 1 : frameIndex / (numFramesForScene - 1);
          drawImageWithKenBurns(ctx, img, canvasWidth, canvasHeight, progressInThisScene, scene.kenBurnsConfig);
          // Removed subtitle overlay for cleaner look
          if (options.includeWatermark) {
            drawWatermark(ctx, canvasWidth, canvasHeight, WATERMARK_TEXT);
          }

          const timestamp = totalFramesRenderedOverall * frameDurationUS;
          const frame = new VideoFrameCtor(canvas, { timestamp, duration: frameDurationUS });
          encoder.encode(frame);
          frame.close();

          totalFramesRenderedOverall++;
          framesSinceLastYield++;
          if (totalFramesToRenderOverall > 0) {
            updateOverallProgress(totalFramesRenderedOverall / totalFramesToRenderOverall, 0.79, 0.20);
          }

          if (framesSinceLastYield >= framesBetweenYields) {
            await yieldToEventLoop();
            throwIfAborted(signal);
            framesSinceLastYield = 0;
          }
        }

        if (framesSinceLastYield > 0) {
          await yieldToEventLoop();
          throwIfAborted(signal);
          framesSinceLastYield = 0;
        }
      }

      await encoder.flush();
      encoder.close();

      if (onProgressCallback) onProgressCallback(1);
      const blob = finalizeMuxer();
      console.log('[Video Rendering Service] WebCodecs rendering complete. Output size:', blob.size);
      resolve({ blob, mimeType: blob.type || chosenMimeType, format: chosenFormat });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      preloadedImages.forEach(item => item.dispose?.());
      if (encoder && encoder.state !== 'closed') {
        try {
          encoder.close();
        } catch (_err) {
          // ignore cleanup error
        }
      }
    }
  });
};


const generateWebMWithMediaRecorder = (
  scenes: Scene[],
  aspectRatio: AspectRatio,
  options: VideoRenderOptions,
  config: RenderConfig,
  onProgressCallback?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<GeneratedVideoResult> => {
  console.log('[Video Rendering Service] Starting MediaRecorder-based rendering.');
  return new Promise(async (resolve, reject) => {
    const recordedChunks: BlobPart[] = [];
    let mediaRecorder: MediaRecorder | null = null;
    let preloadedImages: PreloadedImage[] = [];
    const preloadedImageMap = new Map<string, PreloadedImage>();
    let animationFrameId: number | null = null;
    let frameTimeoutId: number | null = null;
    let stream: MediaStream | null = null;
    let abortHandler: (() => void) | null = null;
    let aborted = false;
    let settled = false;

    const disposePreloadedImages = () => {
      preloadedImages.forEach(item => item.dispose?.());
      preloadedImages = [];
      preloadedImageMap.clear();
    };

    const stopStream = () => {
      if (stream) {
        if (stream.getTracks) {
          stream.getTracks().forEach(track => track.stop());
        }
        stream = null;
      }
    };

    const cleanup = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      if (frameTimeoutId !== null) {
        clearTimeout(frameTimeoutId);
        frameTimeoutId = null;
      }
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler);
        abortHandler = null;
      }
      stopStream();
      disposePreloadedImages();
    };

    const safeResolve = (value: GeneratedVideoResult) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };

    const safeReject = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error instanceof Error) {
        reject(error);
      } else {
        reject(new Error(String(error)));
      }
    };

    try {
      const { width: canvasWidth, height: canvasHeight } = getCanvasDimensions(aspectRatio, config);
      console.log(`[Video Rendering Service] Canvas dimensions: ${canvasWidth}x${canvasHeight}`);

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d', { alpha: false });

      if (!ctx) {
        console.error('[Video Rendering Service] Failed to get canvas context.');
        safeReject(new Error('Failed to get canvas context for video generation.'));
        return;
      }

      ctx.imageSmoothingQuality = 'high';

      if (!(window as any).MediaRecorder || !canvas.captureStream) {
        console.error('[Video Rendering Service] MediaRecorder API or canvas.captureStream not supported.');
        safeReject(new Error('MediaRecorder API or canvas.captureStream is not supported in this browser.'));
        return;
      }

      const updateOverallProgress = (stageProgress: number, stageWeight: number, baseProgress: number) => {
        if (onProgressCallback) {
          onProgressCallback(Math.min(0.99, baseProgress + stageProgress * stageWeight));
        }
      };

      preloadedImages = await preloadAllImages(scenes, aspectRatio, (_msg, val) => {
        updateOverallProgress(val, 0.2, 0);
      }, signal);

      preloadedImages.forEach(item => preloadedImageMap.set(item.sceneId, item));
      const accentColorMap = new Map<string, string>();
      scenes.forEach(scene => {
        accentColorMap.set(scene.id, computeSceneAccentColor(scene));
      });

      throwIfAborted(signal);

      const mode = options.mode ?? 'preview';
      const renderPlan = buildRenderPlan(scenes, config.fps, mode);
      const totalFramesToRenderOverall = renderPlan.reduce((acc, item) => acc + item.frameCount, 0);

      if (mode === 'preview') {
        const totalPlannedDurationSeconds = renderPlan.reduce((acc, item) => acc + item.durationSeconds, 0);
        console.log(
          `[Video Rendering Service] Preview duration limited to ${totalPlannedDurationSeconds.toFixed(2)}s across ${renderPlan.length} scenes.`,
        );
      }

      stream = canvas.captureStream(config.fps);
      console.log(`[Video Rendering Service] Canvas stream captured at ${config.fps} FPS.`);
      const canvasTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
      const supportsManualFramePump = typeof canvasTrack?.requestFrame === 'function';
      let useManualFramePump = supportsManualFramePump;
      if (useManualFramePump) {
        console.log('[Video Rendering Service] Using manual canvas frame pumping for accelerated render.');
      }

      const mimeTypeCandidates: Array<{ type: string; format: 'webm' | 'mp4' }> = [
        { type: 'video/webm;codecs=vp9', format: 'webm' },
        { type: 'video/webm;codecs=vp8', format: 'webm' },
        { type: 'video/webm', format: 'webm' },
        { type: 'video/mp4;codecs="avc1.42E01E, mp4a.40.2"', format: 'mp4' },
        { type: 'video/mp4;codecs="avc1.4D401E, mp4a.40.2"', format: 'mp4' },
        { type: 'video/mp4', format: 'mp4' },
      ];

      let chosenMimeType = '';
      let chosenFormat: 'webm' | 'mp4' = 'webm';
      for (const candidate of mimeTypeCandidates) {
        if (MediaRecorder.isTypeSupported(candidate.type)) {
          chosenMimeType = candidate.type;
          chosenFormat = candidate.format;
          break;
        }
      }

      if (!chosenMimeType) {
        console.warn('[Video Rendering Service] No preferred MIME type reported as supported. Falling back to browser default MediaRecorder settings.');
      } else {
        console.log(`[Video Rendering Service] Using MIME type: ${chosenMimeType}`);
      }

      const recorderOptions: MediaRecorderOptions = {
        videoBitsPerSecond: config.bitrate || MEDIA_RECORDER_DEFAULT_BITRATE,
      };
      if (chosenMimeType) {
        recorderOptions.mimeType = chosenMimeType;
      }

      mediaRecorder = new MediaRecorder(stream, recorderOptions);
      console.log(`[Video Rendering Service] MediaRecorder initialized with bitrate: ${recorderOptions.videoBitsPerSecond}${chosenMimeType ? ` and MIME type ${chosenMimeType}` : ''}`);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        stopStream();
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        if (frameTimeoutId !== null) {
          clearTimeout(frameTimeoutId);
          frameTimeoutId = null;
        }
        console.log('[Video Rendering Service] MediaRecorder stopped. Total chunks:', recordedChunks.length);
        if (aborted) {
          safeReject(createAbortError());
          return;
        }
        if (recordedChunks.length === 0) {
          console.warn('[Video Rendering Service] No data recorded. This might result in an empty or very short video.');
        }
        const blob = new Blob(recordedChunks, { type: chosenMimeType || 'video/webm' });
        const resolvedMimeType = blob.type || chosenMimeType || 'video/webm';
        const resolvedFormat: 'webm' | 'mp4' = resolvedMimeType.includes('mp4') ? 'mp4' : chosenFormat;
        console.log(`[Video Rendering Service] Video blob created, size: ${blob.size}, type: ${resolvedMimeType}`);
        if (onProgressCallback) onProgressCallback(1);
        safeResolve({ blob, mimeType: resolvedMimeType, format: resolvedFormat });
      };

      mediaRecorder.onerror = (event) => {
        const mediaRecorderError = (event as MediaRecorderErrorEvent).error;
        let errorName = 'unknown';
        if (mediaRecorderError) {
          errorName = mediaRecorderError.name || mediaRecorderError.message || 'unknown';
        } else if (event && 'type' in event) {
          errorName = `Event type: ${(event as Event).type}`;
        }
        console.error(`[Video Rendering Service] MediaRecorder error: ${errorName}`, mediaRecorderError || event);
        safeReject(new Error(`MediaRecorder error: ${errorName}`));
      };

      abortHandler = () => {
        if (settled || aborted) {
          return;
        }
        aborted = true;
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          try {
            mediaRecorder.stop();
          } catch (err) {
            console.warn('[Video Rendering Service] Error stopping MediaRecorder after abort.', err);
            safeReject(createAbortError());
          }
        } else {
          safeReject(createAbortError());
        }
      };

      if (signal) {
        if (signal.aborted) {
          abortHandler();
          return;
        }
        signal.addEventListener('abort', abortHandler);
      }

      console.log('[Video Rendering Service] Starting MediaRecorder with timeslice:', MEDIA_RECORDER_TIMESLICE_MS);
      mediaRecorder.start(MEDIA_RECORDER_TIMESLICE_MS);

      let currentSceneIndex = 0;
      let currentFrameInScene = 0;
      let totalFramesRenderedOverall = 0;

      console.log(`[Video Rendering Service] Starting ${useManualFramePump ? 'manual' : 'requestAnimationFrame'} render loop. Total scenes: ${renderPlan.length}, Total frames to render: ${totalFramesToRenderOverall}`);

      const scheduleNextFrame = () => {
        if (settled || aborted || signal?.aborted) {
          return;
        }

        if (useManualFramePump) {
          frameTimeoutId = setTimeout(() => {
            frameTimeoutId = null;
            renderFrame();
          }, 0);
        } else {
          animationFrameId = requestAnimationFrame(renderFrame);
        }
      };

      const renderFrame = () => {
        if (settled || aborted || signal?.aborted) {
          return;
        }

        if (currentSceneIndex >= renderPlan.length) {
          if (mediaRecorder && mediaRecorder.state === 'recording') {
            try {
              mediaRecorder.stop();
            } catch (err) {
              console.warn('[Video Rendering Service] Error stopping MediaRecorder after completing scenes.', err);
              safeReject(err instanceof Error ? err : new Error(String(err)));
            }
          } else if (!aborted && mediaRecorder && mediaRecorder.state !== 'inactive') {
            console.warn('[Video Rendering Service] MediaRecorder was not recording but not inactive, attempting stop. State:', mediaRecorder.state);
            try {
              mediaRecorder.stop();
            } catch (err) {
              console.warn('[Video Rendering Service] Error stopping MediaRecorder during cleanup.', err);
              safeReject(err instanceof Error ? err : new Error(String(err)));
            }
          } else if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            if (!aborted) {
              safeReject(new Error('MediaRecorder stopped prematurely or failed to record data.'));
            }
          }
          return;
        }

        const planItem = renderPlan[currentSceneIndex];
        const scene = planItem.scene;
        const preloadedImgData = preloadedImageMap.get(scene.id);

        if (!preloadedImgData) {
          if (mediaRecorder && mediaRecorder.state === 'recording') {
            try {
              mediaRecorder.stop();
            } catch (err) {
              console.warn('[Video Rendering Service] Error stopping MediaRecorder after missing preloaded image.', err);
            }
          }
          safeReject(new Error(`Internal error: Preloaded image missing for scene ${scene.id}`));
          return;
        }

        const numFramesForThisScene = planItem.frameCount;
        const progressInThisScene = numFramesForThisScene <= 1 ? 1 : currentFrameInScene / (numFramesForThisScene - 1);
        const accentColor = accentColorMap.get(scene.id) ?? computeSceneAccentColor(scene);

        try {
          drawImageWithKenBurns(ctx, preloadedImgData, canvasWidth, canvasHeight, progressInThisScene, scene.kenBurnsConfig);
          // Removed subtitle overlay for cleaner look
          if (options.includeWatermark) {
            drawWatermark(ctx, canvasWidth, canvasHeight, WATERMARK_TEXT);
          }
        } catch (drawError) {
          if (mediaRecorder && mediaRecorder.state === 'recording') {
            try {
              mediaRecorder.stop();
            } catch (err) {
              console.warn('[Video Rendering Service] Error stopping MediaRecorder after draw failure.', err);
            }
          }
          const errorToReject = drawError instanceof Error ? drawError : new Error(String(drawError));
          safeReject(errorToReject);
          return;
        }

        currentFrameInScene++;
        totalFramesRenderedOverall++;

        if (totalFramesToRenderOverall > 0) {
          updateOverallProgress(totalFramesRenderedOverall / totalFramesToRenderOverall, 0.79, 0.20);
        }

        if (currentFrameInScene >= numFramesForThisScene) {
          currentSceneIndex++;
          currentFrameInScene = 0;
        }

        if (useManualFramePump) {
          try {
            canvasTrack?.requestFrame();
          } catch (err) {
            console.warn('[Video Rendering Service] Canvas frame request failed; falling back to rAF loop.', err);
            frameTimeoutId = null;
            useManualFramePump = false;
            animationFrameId = requestAnimationFrame(renderFrame);
            return;
          }
        }

        scheduleNextFrame();
      };

      scheduleNextFrame();
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error || 'Unknown error during video processing'));
      if (isAbortError(normalizedError)) {
        aborted = true;
      }
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        try {
          mediaRecorder.stop();
        } catch (err) {
          console.warn('[Video Rendering Service] Error stopping MediaRecorder after exception.', err);
        }
      }
      safeReject(normalizedError);
    }
  });
};

export const generateWebMFromScenes = (
  scenes: Scene[],
  aspectRatio: AspectRatio,
  options: VideoRenderOptions,
  onProgressCallback?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<GeneratedVideoResult> => {
  const mode = options.mode ?? 'preview';
  const config = resolveOptimizedRenderConfig(mode, scenes);

  if (hasWebCodecsSupport()) {
    return generateVideoWithWebCodecs(scenes, aspectRatio, options, config, onProgressCallback, signal).catch(error => {
      console.warn('[Video Rendering Service] WebCodecs renderer failed, falling back to MediaRecorder.', error);
      return generateWebMWithMediaRecorder(scenes, aspectRatio, options, config, onProgressCallback, signal);
    });
  }

  return generateWebMWithMediaRecorder(scenes, aspectRatio, options, config, onProgressCallback, signal);
};
