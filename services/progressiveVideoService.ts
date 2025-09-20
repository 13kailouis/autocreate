import { Scene, AspectRatio } from '../types.ts';
import { imagePreloadService, PreloadedImage } from './imagePreloadService.ts';

export interface ProgressiveVideoOptions {
  aspectRatio: AspectRatio;
  includeWatermark: boolean;
  quality: 'low' | 'medium' | 'high';
  maxDuration: number; // in seconds
  chunkSize: number; // frames per chunk
}

export interface VideoChunk {
  blob: Blob;
  index: number;
  timestamp: number;
  duration: number;
}

export class ProgressiveVideoGenerator {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private options: ProgressiveVideoOptions;
  private preloadedImages: PreloadedImage[] = [];
  private isGenerating = false;
  private abortController?: AbortController;

  constructor(options: ProgressiveVideoOptions) {
    this.options = options;
    this.setupCanvas();
  }

  private setupCanvas() {
    this.canvas = document.createElement('canvas');
    const { width, height } = this.getCanvasDimensions();
    this.canvas.width = width;
    this.canvas.height = height;
    
    this.ctx = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
      willReadFrequently: false
    })!;

    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = this.options.quality === 'high' ? 'high' : 'medium';
  }

  private getCanvasDimensions(): { width: number; height: number } {
    const baseWidth = this.options.quality === 'high' ? 1920 : 
                     this.options.quality === 'medium' ? 1280 : 854;
    const baseHeight = this.options.quality === 'high' ? 1080 : 
                      this.options.quality === 'medium' ? 720 : 480;
    
    if (this.options.aspectRatio === '16:9') {
      return { width: baseWidth, height: baseHeight };
    }
    
    // 9:16 portrait
    return { width: baseHeight, height: baseWidth };
  }

  private drawKenBurns(
    image: HTMLImageElement | ImageBitmap,
    progress: number,
    kenBurnsConfig: any
  ) {
    const { width, height } = this.getCanvasDimensions();
    
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
    const imgAspect = image.width / image.height;
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

  private drawTextOverlay(scene: Scene, progress: number) {
    const { width, height } = this.getCanvasDimensions();
    const text = scene.sceneText || '';
    
    if (!text.trim()) return;

    const revealRatio = Math.min(1, 0.2 + progress * 0.8);
    const words = text.split(' ');
    const visibleWords = Math.max(1, Math.floor(words.length * revealRatio));
    const displayText = words.slice(0, visibleWords).join(' ');

    if (!displayText) return;

    const fontSize = Math.max(20, Math.round(height * 0.04));
    const padding = Math.round(width * 0.04);
    const maxWidth = width - padding * 2;

    this.ctx.font = `bold ${fontSize}px Arial`;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';

    const lines = this.wrapText(displayText, maxWidth);
    const maxLines = 3;
    const displayLines = lines.slice(0, maxLines);

    if (displayLines.length === 0) return;

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

  private wrapText(text: string, maxWidth: number): string[] {
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

  private drawWatermark() {
    if (!this.options.includeWatermark) return;
    
    const { width, height } = this.getCanvasDimensions();
    const fontSize = Math.round(height * 0.025);
    
    this.ctx.font = `bold ${fontSize}px Arial`;
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    this.ctx.textAlign = 'right';
    this.ctx.fillText('CineSynth', width - 8, height - 8);
  }

  async generateProgressiveVideo(
    scenes: Scene[],
    onChunk: (chunk: VideoChunk) => void,
    onProgress: (progress: number) => void
  ): Promise<void> {
    if (this.isGenerating) {
      throw new Error('Video generation already in progress');
    }

    this.isGenerating = true;
    this.abortController = new AbortController();

    try {
      // Preload all images
      this.preloadedImages = await imagePreloadService.preloadImages(scenes, (loaded, total) => {
        onProgress(loaded / total * 0.2); // 20% for preloading
      });

      if (this.abortController.signal.aborted) return;

      // Calculate video parameters
      const fps = this.options.quality === 'high' ? 24 : 
                  this.options.quality === 'medium' ? 20 : 15;
      const frameDuration = 1 / fps;
      
      const totalDuration = Math.min(
        scenes.reduce((sum, scene) => sum + scene.duration, 0),
        this.options.maxDuration
      );
      
      const totalFrames = Math.floor(totalDuration * fps);
      const totalChunks = Math.ceil(totalFrames / this.options.chunkSize);

      let currentTime = 0;
      let frameIndex = 0;
      let sceneIndex = 0;
      let sceneTime = 0;
      let chunkIndex = 0;

      // Setup MediaRecorder for chunking
      const stream = this.canvas.captureStream(fps);
      const mimeType = this.getSupportedMimeType();
      
      while (frameIndex < totalFrames && !this.abortController.signal.aborted) {
        const chunkFrames = Math.min(this.options.chunkSize, totalFrames - frameIndex);
        const chunk = await this.generateChunk(
          scenes,
          frameIndex,
          chunkFrames,
          fps,
          mimeType,
          stream
        );

        if (chunk) {
          onChunk({
            blob: chunk,
            index: chunkIndex,
            timestamp: currentTime,
            duration: chunkFrames * frameDuration
          });
        }

        frameIndex += chunkFrames;
        currentTime += chunkFrames * frameDuration;
        chunkIndex++;

        // Update progress
        onProgress(0.2 + (frameIndex / totalFrames) * 0.8);

        // Yield to event loop
        await new Promise(resolve => setTimeout(resolve, 0));
      }

    } finally {
      this.isGenerating = false;
      this.abortController = undefined;
    }
  }

  private async generateChunk(
    scenes: Scene[],
    startFrame: number,
    frameCount: number,
    fps: number,
    mimeType: string,
    stream: MediaStream
  ): Promise<Blob | null> {
    return new Promise((resolve, reject) => {
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: this.getBitrate()
      });

      const chunks: BlobPart[] = [];
      let frameIndex = startFrame;
      const endFrame = startFrame + frameCount;
      const frameDuration = 1 / fps;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        resolve(blob);
      };

      mediaRecorder.onerror = (event) => {
        reject(new Error(`MediaRecorder error: ${event}`));
      };

      mediaRecorder.start(100);

      const renderFrame = () => {
        if (frameIndex >= endFrame || this.abortController?.signal.aborted) {
          mediaRecorder.stop();
          return;
        }

        // Find current scene
        let currentSceneIndex = 0;
        let sceneTime = frameIndex * frameDuration;
        
        while (currentSceneIndex < scenes.length && sceneTime >= scenes[currentSceneIndex].duration) {
          sceneTime -= scenes[currentSceneIndex].duration;
          currentSceneIndex++;
        }

        if (currentSceneIndex < scenes.length) {
          const scene = scenes[currentSceneIndex];
          const progressInScene = sceneTime / scene.duration;
          
          // Get preloaded image
          const preloaded = this.preloadedImages.find(img => img.sceneId === scene.id);
          if (preloaded && preloaded.loaded) {
            const image = preloaded.bitmap || preloaded.image;
            this.drawKenBurns(image, progressInScene, scene.kenBurnsConfig);
            // Removed text overlay for cleaner look
            this.drawWatermark();
          }
        }

        frameIndex++;
        requestAnimationFrame(renderFrame);
      };

      renderFrame();
    });
  }

  private getBitrate(): number {
    switch (this.options.quality) {
      case 'high': return 4000000;
      case 'medium': return 2000000;
      case 'low': return 1000000;
      default: return 2000000;
    }
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

  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  dispose() {
    this.abort();
    this.canvas.remove();
  }
}

export const createProgressiveVideo = (
  options: ProgressiveVideoOptions
): ProgressiveVideoGenerator => {
  return new ProgressiveVideoGenerator(options);
};
