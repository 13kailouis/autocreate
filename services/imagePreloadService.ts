import { Scene } from '../types.ts';

export interface PreloadedImage {
  sceneId: string;
  image: HTMLImageElement;
  bitmap?: ImageBitmap;
  loaded: boolean;
  error?: Error;
}

export class ImagePreloadService {
  private cache = new Map<string, PreloadedImage>();
  private loadingPromises = new Map<string, Promise<PreloadedImage>>();
  private maxCacheSize = 50;
  private preloadQueue: string[] = [];

  async preloadImages(scenes: Scene[], onProgress?: (loaded: number, total: number) => void): Promise<PreloadedImage[]> {
    const results: PreloadedImage[] = [];
    let loaded = 0;
    const total = scenes.length;

    // Create loading promises for all scenes
    const promises = scenes.map(async (scene, index) => {
      try {
        const preloaded = await this.loadImage(scene);
        loaded++;
        onProgress?.(loaded, total);
        return preloaded;
      } catch (error) {
        console.warn(`Failed to preload image for scene ${index}:`, error);
        loaded++;
        onProgress?.(loaded, total);
        return this.createFallbackImage(scene);
      }
    });

    // Process in batches for better performance
    const batchSize = Math.min(4, navigator.hardwareConcurrency || 2);
    for (let i = 0; i < promises.length; i += batchSize) {
      const batch = promises.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
    }

    return results;
  }

  private async loadImage(scene: Scene): Promise<PreloadedImage> {
    const cacheKey = `${scene.id}-${scene.footageUrl}`;
    
    // Return cached image if available
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Return existing loading promise if available
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey)!;
    }

    // Create new loading promise
    const promise = this.loadImageInternal(scene, cacheKey);
    this.loadingPromises.set(cacheKey, promise);

    try {
      const result = await promise;
      this.cache.set(cacheKey, result);
      this.loadingPromises.delete(cacheKey);
      
      // Manage cache size
      this.manageCacheSize();
      
      return result;
    } catch (error) {
      this.loadingPromises.delete(cacheKey);
      throw error;
    }
  }

  private async loadImageInternal(scene: Scene, cacheKey: string): Promise<PreloadedImage> {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.loading = 'eager';

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Image load timeout for scene ${scene.id}`));
      }, 10000); // 10 second timeout

      image.onload = async () => {
        clearTimeout(timeout);
        
        try {
          // Pre-decode the image
          if (image.decode) {
            await image.decode();
          }

          // Create ImageBitmap for better performance if supported
          let bitmap: ImageBitmap | undefined;
          if (typeof createImageBitmap === 'function') {
            try {
              bitmap = await createImageBitmap(image);
            } catch (bitmapError) {
              console.warn('Failed to create ImageBitmap:', bitmapError);
            }
          }

          resolve({
            sceneId: scene.id,
            image,
            bitmap,
            loaded: true
          });
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      };

      image.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`Failed to load image for scene ${scene.id}`));
      };

      image.src = scene.footageUrl;
    });
  }

  private createFallbackImage(scene: Scene): PreloadedImage {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d')!;

    // Create a gradient background
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#1a1a1a');
    gradient.addColorStop(1, '#333333');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Loading...', canvas.width / 2, canvas.height / 2);

    const image = new Image();
    image.src = canvas.toDataURL();

    return {
      sceneId: scene.id,
      image,
      loaded: false,
      error: new Error('Fallback image created')
    };
  }

  private manageCacheSize() {
    if (this.cache.size <= this.maxCacheSize) return;

    // Remove oldest entries
    const entries = Array.from(this.cache.entries());
    const toRemove = entries.slice(0, entries.length - this.maxCacheSize);
    
    toRemove.forEach(([key, preloaded]) => {
      this.cache.delete(key);
      preloaded.bitmap?.close();
    });
  }

  getImage(sceneId: string, footageUrl: string): PreloadedImage | null {
    const cacheKey = `${sceneId}-${footageUrl}`;
    return this.cache.get(cacheKey) || null;
  }

  clearCache() {
    this.cache.forEach(preloaded => {
      preloaded.bitmap?.close();
    });
    this.cache.clear();
    this.loadingPromises.clear();
  }

  dispose() {
    this.clearCache();
  }
}

// Singleton instance
export const imagePreloadService = new ImagePreloadService();
