import { Scene, AspectRatio } from '../types.ts';

export interface InstantPreviewOptions {
  aspectRatio: AspectRatio;
  includeWatermark: boolean;
  maxPreviewDuration: number; // in seconds
  quality: 'low' | 'medium' | 'high';
}

export interface PreviewFrame {
  canvas: HTMLCanvasElement;
  timestamp: number;
  sceneIndex: number;
}

export class InstantPreviewGenerator {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private aspectRatio: AspectRatio;
  private includeWatermark: boolean;
  private maxPreviewDuration: number;
  private quality: 'low' | 'medium' | 'high';

  constructor(options: InstantPreviewOptions) {
    this.aspectRatio = options.aspectRatio;
    this.includeWatermark = options.includeWatermark;
    this.maxPreviewDuration = options.maxPreviewDuration;
    this.quality = options.quality;

    // Create optimized canvas
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { 
      alpha: false,
      desynchronized: true, // For better performance
      willReadFrequently: false
    })!;

    this.setupCanvas();
  }

  private setupCanvas() {
    const { width, height } = this.getCanvasDimensions();
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = this.quality === 'high' ? 'high' : 'medium';
  }

  private getCanvasDimensions(): { width: number; height: number } {
    const baseWidth = this.quality === 'high' ? 1280 : this.quality === 'medium' ? 854 : 640;
    const baseHeight = this.quality === 'high' ? 720 : this.quality === 'medium' ? 480 : 360;
    
    if (this.aspectRatio === '16:9') {
      return { width: baseWidth, height: baseHeight };
    }
    
    // 9:16 portrait
    return { width: baseHeight, height: baseWidth };
  }

  private drawKenBurnsEffect(
    image: HTMLImageElement,
    progress: number,
    kenBurnsConfig: any
  ) {
    const { width: canvasWidth, height: canvasHeight } = this.getCanvasDimensions();
    
    // Clear canvas
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Calculate Ken Burns transform
    const initialScale = 1.0;
    const targetScale = kenBurnsConfig.targetScale || 1.1;
    const currentScale = initialScale + (targetScale - initialScale) * progress;

    const initialX = 0;
    const initialY = 0;
    const targetX = kenBurnsConfig.targetXPercent || 0;
    const targetY = kenBurnsConfig.targetYPercent || 0;
    const currentX = initialX + (targetX - initialX) * progress;
    const currentY = initialY + (targetY - initialY) * progress;

    // Apply transform
    this.ctx.save();
    
    const originX = canvasWidth * (kenBurnsConfig.originXRatio || 0.5);
    const originY = canvasHeight * (kenBurnsConfig.originYRatio || 0.5);
    
    this.ctx.translate(originX, originY);
    this.ctx.scale(currentScale, currentScale);
    this.ctx.translate(-originX, -originY);
    this.ctx.translate((canvasWidth * currentX) / 100, (canvasHeight * currentY) / 100);

    // Draw image with proper aspect ratio
    const imgAspect = image.naturalWidth / image.naturalHeight;
    const canvasAspect = canvasWidth / canvasHeight;

    let dx, dy, dw, dh;
    if (imgAspect > canvasAspect) {
      dh = canvasHeight;
      dw = dh * imgAspect;
      dx = (canvasWidth - dw) / 2;
      dy = 0;
    } else {
      dw = canvasWidth;
      dh = dw / imgAspect;
      dx = 0;
      dy = (canvasHeight - dh) / 2;
    }

    this.ctx.drawImage(image, dx, dy, dw, dh);
    this.ctx.restore();
  }

  private drawTextOverlay(scene: Scene, progress: number) {
    const { width: canvasWidth, height: canvasHeight } = this.getCanvasDimensions();
    const text = scene.sceneText || '';
    
    if (!text.trim()) return;

    // Calculate text reveal
    const easedProgress = this.easeInOutCubic(Math.max(0, Math.min(1, progress)));
    const revealRatio = 0.3 + 0.7 * easedProgress;
    const words = text.split(' ');
    const visibleWordCount = Math.max(1, Math.floor(words.length * revealRatio));
    const textToDisplay = words.slice(0, visibleWordCount).join(' ');

    if (!textToDisplay) return;

    // Setup text styling
    const fontSize = Math.max(20, Math.round(canvasHeight * 0.04));
    const lineHeight = fontSize * 1.2;
    const padding = Math.round(canvasWidth * 0.04);
    const maxWidth = canvasWidth - padding * 2;

    this.ctx.font = `bold ${fontSize}px "Inter", "Helvetica Neue", "Arial", sans-serif`;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';

    // Wrap text
    const lines = this.wrapText(textToDisplay, maxWidth);
    const maxLines = 3;
    const displayLines = lines.slice(0, maxLines);

    if (displayLines.length === 0) return;

    // Draw background
    const textHeight = displayLines.length * lineHeight;
    const overlayHeight = textHeight + padding * 1.5;
    const overlayTop = canvasHeight - overlayHeight;
    const overlayAlpha = Math.min(1, 0.2 + easedProgress * 0.8);

    this.ctx.save();
    this.ctx.globalAlpha = overlayAlpha;
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, overlayTop - padding, canvasWidth, overlayHeight + padding);
    this.ctx.restore();

    // Draw text
    this.ctx.save();
    this.ctx.globalAlpha = overlayAlpha;
    this.ctx.fillStyle = 'white';
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    this.ctx.shadowBlur = 4;
    this.ctx.shadowOffsetY = 2;

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

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  private drawWatermark() {
    if (!this.includeWatermark) return;
    
    const { width: canvasWidth, height: canvasHeight } = this.getCanvasDimensions();
    const fontSize = Math.round(canvasHeight * 0.03);
    
    this.ctx.font = `bold ${fontSize}px Arial`;
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    this.ctx.textAlign = 'right';
    this.ctx.fillText('CineSynth', canvasWidth - 10, canvasHeight - 10);
  }

  async generatePreviewFrames(scenes: Scene[]): Promise<PreviewFrame[]> {
    const frames: PreviewFrame[] = [];
    const fps = this.quality === 'high' ? 24 : this.quality === 'medium' ? 15 : 12;
    const frameDuration = 1 / fps;
    
    let currentTime = 0;
    let sceneIndex = 0;
    let frameIndex = 0;

    // Limit total duration for instant preview
    const maxFrames = Math.floor(this.maxPreviewDuration * fps);

    while (sceneIndex < scenes.length && frameIndex < maxFrames) {
      const scene = scenes[sceneIndex];
      const sceneDuration = Math.min(scene.duration, this.maxPreviewDuration / scenes.length);
      const sceneFrames = Math.ceil(sceneDuration * fps);
      
      for (let i = 0; i < sceneFrames && frameIndex < maxFrames; i++) {
        const progressInScene = sceneFrames > 1 ? i / (sceneFrames - 1) : 1;
        
        // Load and draw image
        try {
          const image = await this.loadImage(scene.footageUrl);
          this.drawKenBurnsEffect(image, progressInScene, scene.kenBurnsConfig);
          this.drawTextOverlay(scene, progressInScene);
          this.drawWatermark();
          
          // Create frame
          const frameCanvas = document.createElement('canvas');
          frameCanvas.width = this.canvas.width;
          frameCanvas.height = this.canvas.height;
          const frameCtx = frameCanvas.getContext('2d')!;
          frameCtx.drawImage(this.canvas, 0, 0);
          
          frames.push({
            canvas: frameCanvas,
            timestamp: currentTime,
            sceneIndex
          });
        } catch (error) {
          console.warn(`Failed to load image for scene ${sceneIndex}:`, error);
          // Draw fallback
          this.ctx.fillStyle = '#333333';
          this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
          this.ctx.fillStyle = 'white';
          this.ctx.font = '24px Arial';
          this.ctx.textAlign = 'center';
          this.ctx.fillText('Loading...', this.canvas.width / 2, this.canvas.height / 2);
          
          const frameCanvas = document.createElement('canvas');
          frameCanvas.width = this.canvas.width;
          frameCanvas.height = this.canvas.height;
          const frameCtx = frameCanvas.getContext('2d')!;
          frameCtx.drawImage(this.canvas, 0, 0);
          
          frames.push({
            canvas: frameCanvas,
            timestamp: currentTime,
            sceneIndex
          });
        }
        
        currentTime += frameDuration;
        frameIndex++;
      }
      
      sceneIndex++;
    }

    return frames;
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }

  async generatePreviewVideo(scenes: Scene[]): Promise<Blob> {
    const frames = await this.generatePreviewFrames(scenes);
    
    if (frames.length === 0) {
      throw new Error('No frames generated');
    }

    // Use MediaRecorder for fast encoding
    const stream = this.canvas.captureStream(24);
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8',
      videoBitsPerSecond: this.quality === 'high' ? 2000000 : 1000000
    });

    const chunks: BlobPart[] = [];
    
    return new Promise((resolve, reject) => {
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        resolve(blob);
      };

      mediaRecorder.onerror = (event) => {
        reject(new Error(`MediaRecorder error: ${event}`));
      };

      // Start recording
      mediaRecorder.start(100);

      // Play frames
      let frameIndex = 0;
      const playFrame = () => {
        if (frameIndex >= frames.length) {
          mediaRecorder.stop();
          return;
        }

        const frame = frames[frameIndex];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(frame.canvas, 0, 0);
        
        frameIndex++;
        setTimeout(playFrame, 1000 / 24); // 24 FPS
      };

      playFrame();
    });
  }

  dispose() {
    this.canvas.remove();
  }
}

export const createInstantPreview = async (
  scenes: Scene[],
  options: InstantPreviewOptions
): Promise<Blob> => {
  const generator = new InstantPreviewGenerator(options);
  try {
    return await generator.generatePreviewVideo(scenes);
  } finally {
    generator.dispose();
  }
};
