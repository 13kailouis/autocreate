import { Scene, AspectRatio } from '../types.ts';
import { Muxer as WebMMuxer, ArrayBufferTarget as WebMArrayBufferTarget } from 'webm-muxer';
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';

export interface FastRenderOptions {
  includeWatermark: boolean;
  mode: 'preview' | 'download';
  quality: 'ultra-fast' | 'fast' | 'balanced' | 'high';
}

export interface FastRenderConfig {
  fps: number;
  width: number;
  height: number;
  bitrate: number;
  maxDuration: number; // in seconds
  frameSkip: number; // render every Nth frame
}

const QUALITY_CONFIGS: Record<string, FastRenderConfig> = {
  'ultra-fast': {
    fps: 12,
    width: 640,
    height: 360,
    bitrate: 500000,
    maxDuration: 30,
    frameSkip: 2
  },
  'fast': {
    fps: 15,
    width: 854,
    height: 480,
    bitrate: 1000000,
    maxDuration: 60,
    frameSkip: 1
  },
  'balanced': {
    fps: 20,
    width: 1280,
    height: 720,
    bitrate: 2000000,
    maxDuration: 120,
    frameSkip: 1
  },
  'high': {
    fps: 24,
    width: 1920,
    height: 1080,
    bitrate: 4000000,
    maxDuration: 300,
    frameSkip: 1
  }
};

export class FastVideoRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: FastRenderConfig;
  private options: FastRenderOptions;

  constructor(aspectRatio: AspectRatio, options: FastRenderOptions) {
    this.options = options;
    this.config = this.getOptimizedConfig(aspectRatio, options.quality);
    
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.config.width;
    this.canvas.height = this.config.height;
    
    this.ctx = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
      willReadFrequently: false
    })!;

    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = options.quality === 'high' ? 'high' : 'medium';
  }

  private getOptimizedConfig(aspectRatio: AspectRatio, quality: string): FastRenderConfig {
    const baseConfig = QUALITY_CONFIGS[quality] || QUALITY_CONFIGS['balanced'];
    
    if (aspectRatio === '9:16') {
      // Portrait mode - swap dimensions
      return {
        ...baseConfig,
        width: baseConfig.height,
        height: baseConfig.width
      };
    }
    
    return baseConfig;
  }

  private async loadImageOptimized(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      
      img.onload = () => {
        // Pre-decode for better performance
        if (img.decode) {
          img.decode().then(() => resolve(img)).catch(() => resolve(img));
        } else {
          resolve(img);
        }
      };
      
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }

  private drawKenBurnsFast(
    image: HTMLImageElement,
    progress: number,
    kenBurnsConfig: any
  ) {
    const { width, height } = this.config;
    
    // Clear canvas
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, width, height);

    // Calculate transform
    const scale = 1 + (kenBurnsConfig.targetScale - 1) * progress;
    const x = (kenBurnsConfig.targetXPercent || 0) * progress;
    const y = (kenBurnsConfig.targetYPercent || 0) * progress;

    this.ctx.save();
    
    const originX = width * (kenBurnsConfig.originXRatio || 0.5);
    const originY = height * (kenBurnsConfig.originYRatio || 0.5);
    
    this.ctx.translate(originX, originY);
    this.ctx.scale(scale, scale);
    this.ctx.translate(-originX, -originY);
    this.ctx.translate((width * x) / 100, (height * y) / 100);

    // Draw image
    const imgAspect = image.naturalWidth / image.naturalHeight;
    const canvasAspect = width / height;

    let dx, dy, dw, dh;
    if (imgAspect > canvasAspect) {
      dh = height;
      dw = dh * imgAspect;
      dx = (width - dw) / 2;
      dy = 0;
    } else {
      dw = width;
      dh = dw / imgAspect;
      dx = 0;
      dy = (height - dh) / 2;
    }

    this.ctx.drawImage(image, dx, dy, dw, dh);
    this.ctx.restore();
  }

  private drawTextOverlayFast(scene: Scene, progress: number) {
    const { width, height } = this.config;
    const text = scene.sceneText || '';
    
    if (!text.trim()) return;

    // Simplified text reveal
    const revealRatio = Math.min(1, 0.2 + progress * 0.8);
    const words = text.split(' ');
    const visibleWords = Math.max(1, Math.floor(words.length * revealRatio));
    const displayText = words.slice(0, visibleWords).join(' ');

    if (!displayText) return;

    // Fast text rendering
    const fontSize = Math.max(16, Math.round(height * 0.03));
    const padding = Math.round(width * 0.03);
    const maxWidth = width - padding * 2;

    this.ctx.font = `bold ${fontSize}px Arial`;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';

    // Simple text wrapping
    const lines = this.wrapTextFast(displayText, maxWidth);
    const maxLines = 2;
    const displayLines = lines.slice(0, maxLines);

    if (displayLines.length === 0) return;

    // Draw background
    const lineHeight = fontSize * 1.2;
    const textHeight = displayLines.length * lineHeight;
    const overlayHeight = textHeight + padding;
    const overlayTop = height - overlayHeight;
    const alpha = Math.min(1, 0.3 + progress * 0.7);

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.ctx.fillRect(0, overlayTop, width, overlayHeight);
    this.ctx.restore();

    // Draw text
    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = 'white';
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    this.ctx.shadowBlur = 2;

    displayLines.forEach((line, index) => {
      const y = overlayTop + padding + (index + 1) * lineHeight;
      this.ctx.fillText(line.toUpperCase(), padding, y);
    });
    this.ctx.restore();
  }

  private wrapTextFast(text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = this.ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  private drawWatermarkFast() {
    if (!this.options.includeWatermark) return;
    
    const { width, height } = this.config;
    const fontSize = Math.round(height * 0.025);
    
    this.ctx.font = `bold ${fontSize}px Arial`;
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    this.ctx.textAlign = 'right';
    this.ctx.fillText('CineSynth', width - 8, height - 8);
  }

  async renderVideo(scenes: Scene[], onProgress?: (progress: number) => void): Promise<Blob> {
    const startTime = performance.now();
    
    // Preload all images
    const imagePromises = scenes.map(scene => 
      this.loadImageOptimized(scene.footageUrl).catch(() => {
        // Create fallback image
        const fallback = document.createElement('canvas');
        fallback.width = this.config.width;
        fallback.height = this.config.height;
        const fallbackCtx = fallback.getContext('2d')!;
        fallbackCtx.fillStyle = '#333333';
        fallbackCtx.fillRect(0, 0, fallback.width, fallback.height);
        fallbackCtx.fillStyle = 'white';
        fallbackCtx.font = '24px Arial';
        fallbackCtx.textAlign = 'center';
        fallbackCtx.fillText('Loading...', fallback.width / 2, fallback.height / 2);
        
        const img = new Image();
        img.src = fallback.toDataURL();
        return img;
      })
    );

    const images = await Promise.all(imagePromises);
    
    // Calculate total frames
    const totalDuration = Math.min(
      scenes.reduce((sum, scene) => sum + scene.duration, 0),
      this.config.maxDuration
    );
    
    const totalFrames = Math.floor(totalDuration * this.config.fps);
    const frameDuration = 1 / this.config.fps;
    
    // Setup MediaRecorder
    const stream = this.canvas.captureStream(this.config.fps);
    const mimeType = this.getSupportedMimeType();
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: this.config.bitrate
    });

    const chunks: BlobPart[] = [];
    
    return new Promise((resolve, reject) => {
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const endTime = performance.now();
        console.log(`Fast video rendering completed in ${(endTime - startTime) / 1000}s`);
        resolve(blob);
      };

      mediaRecorder.onerror = (event) => {
        reject(new Error(`MediaRecorder error: ${event}`));
      };

      // Start recording
      mediaRecorder.start(100);

      // Render frames
      let currentTime = 0;
      let frameIndex = 0;
      let sceneIndex = 0;
      let sceneTime = 0;

      const renderFrame = () => {
        if (frameIndex >= totalFrames) {
          mediaRecorder.stop();
          return;
        }

        // Find current scene
        while (sceneIndex < scenes.length && sceneTime >= scenes[sceneIndex].duration) {
          sceneTime -= scenes[sceneIndex].duration;
          sceneIndex++;
        }

        if (sceneIndex < scenes.length) {
          const scene = scenes[sceneIndex];
          const progressInScene = sceneTime / scene.duration;
          
          // Draw scene
          this.drawKenBurnsFast(images[sceneIndex], progressInScene, scene.kenBurnsConfig);
          this.drawTextOverlayFast(scene, progressInScene);
          this.drawWatermarkFast();
        }

        // Update progress
        if (onProgress) {
          onProgress(frameIndex / totalFrames);
        }

        currentTime += frameDuration;
        sceneTime += frameDuration;
        frameIndex++;

        // Use requestAnimationFrame for smooth rendering
        requestAnimationFrame(renderFrame);
      };

      renderFrame();
    });
  }

  private getSupportedMimeType(): string {
    const mimeTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs="avc1.42E01E"',
      'video/mp4'
    ];

    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return mimeType;
      }
    }

    return 'video/webm';
  }

  dispose() {
    this.canvas.remove();
  }
}

export const renderVideoFast = async (
  scenes: Scene[],
  aspectRatio: AspectRatio,
  options: FastRenderOptions,
  onProgress?: (progress: number) => void
): Promise<Blob> => {
  const renderer = new FastVideoRenderer(aspectRatio, options);
  try {
    return await renderer.renderVideo(scenes, onProgress);
  } finally {
    renderer.dispose();
  }
};
