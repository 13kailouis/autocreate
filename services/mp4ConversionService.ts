import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadingPromise: Promise<void> | null = null;

const getFFmpegInstance = async (): Promise<FFmpeg> => {
  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg();
  }

  if (!ffmpegInstance.loaded) {
    ffmpegLoadingPromise = ffmpegLoadingPromise ?? ffmpegInstance.load();
    await ffmpegLoadingPromise;
    ffmpegLoadingPromise = null;
  }

  return ffmpegInstance;
};

interface ConversionStrategy {
  description: string;
  args: string[];
}

const buildConversionStrategies = (inputFileName: string, outputFileName: string): ConversionStrategy[] => [
  {
    description: 'stream copy remux',
    args: [
      '-y',
      '-i',
      inputFileName,
      '-c',
      'copy',
      '-movflags',
      'faststart',
      outputFileName,
    ],
  },
  {
    description: 'stream copy with AAC audio',
    args: [
      '-y',
      '-i',
      inputFileName,
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      'faststart',
      outputFileName,
    ],
  },
  {
    description: 'fallback x264 transcode',
    args: [
      '-y',
      '-i',
      inputFileName,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      'faststart',
      outputFileName,
    ],
  },
];

export const convertWebMToMP4 = async (
  webmBlob: Blob,
  onProgress?: (progress: number) => void
): Promise<Blob> => {
  const ffmpeg = await getFFmpegInstance();
  const inputFileName = `input_${Date.now()}.webm`;
  const outputFileName = `output_${Date.now()}.mp4`;

  const handleProgress = ({ progress }: { progress: number }) => {
    if (onProgress) {
      onProgress(Math.min(1, progress));
    }
  };

  if (onProgress) {
    ffmpeg.on('progress', handleProgress);
  }

  try {
    await ffmpeg.writeFile(inputFileName, await fetchFile(webmBlob));

    const strategies = buildConversionStrategies(inputFileName, outputFileName);
    let lastError: unknown = null;

    for (const strategy of strategies) {
      try {
        await ffmpeg.exec(strategy.args);
        const data = await ffmpeg.readFile(outputFileName);
        if (onProgress) {
          onProgress(1);
        }
        return new Blob([data], { type: 'video/mp4' });
      } catch (strategyError) {
        lastError = strategyError;
        console.warn(`FFmpeg ${strategy.description} failed, trying next strategy.`, strategyError);
        try {
          await (ffmpeg as any).deleteFile?.(outputFileName);
        } catch (cleanupError) {
          console.warn('Failed to delete output file after unsuccessful conversion attempt.', cleanupError);
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Unknown error while converting WebM to MP4.');
  } finally {
    if (onProgress && typeof (ffmpeg as any).off === 'function') {
      (ffmpeg as any).off('progress', handleProgress);
    }
    try {
      await (ffmpeg as any).deleteFile?.(inputFileName);
    } catch (error) {
      console.warn('Failed to delete temporary input file after conversion.', error);
    }
    try {
      await (ffmpeg as any).deleteFile?.(outputFileName);
    } catch (error) {
      console.warn('Failed to delete temporary output file after conversion.', error);
    }
  }
};
