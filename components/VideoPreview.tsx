
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Scene, AspectRatio } from '../types.ts';
import { PlayIcon, PauseIcon, DownloadIcon } from './IconComponents.tsx';
import { computePreviewPlaybackPlan, PREVIEW_MAX_TOTAL_DURATION_SECONDS } from '../services/renderTiming.ts';

const FADE_DURATION_MS = 800; // Faster cross-fade for more dynamic feel
const TRANSITION_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'; // More dynamic easing

interface ImageSlotState {
  scene: Scene | null;
  opacity: number;
  zIndex: number;
  transform: string;
  transformOrigin: string;
  transition: string;
}

interface VideoPreviewProps {
  scenes: Scene[];
  aspectRatio: AspectRatio;
  onDownloadRequest: () => void;
  isGenerating: boolean;
  isDownloading?: boolean;
  isPreparingVideoFile?: boolean;
  isPreparingDownload?: boolean;
  isDownloadReady?: boolean;
  isTTSEnabled: boolean;
  onTTSPlay: (text: string) => void;
  onTTSPause: () => void;
  onTTSResume: () => void;
  onTTSStop: () => void;
  ttsPlaybackStatus: 'idle' | 'playing' | 'paused' | 'ended';
  videoUrl?: string | null;
  videoFormat?: 'webm' | 'mp4';
  downloadFormat?: 'webm' | 'mp4';
  isOptimized?: boolean;
}

const getDefaultSlotState = (): ImageSlotState => ({
  scene: null,
  opacity: 0,
  zIndex: 0,
  transform: 'scale(1) translate(0%, 0%)',
  transformOrigin: 'center center',
  transition: `opacity ${FADE_DURATION_MS}ms ${TRANSITION_EASING}`,
});

const VideoPreview: React.FC<VideoPreviewProps> = ({
  scenes,
  aspectRatio,
  onDownloadRequest,
  isGenerating,
  isDownloading,
  isPreparingVideoFile = false,
  isPreparingDownload = false,
  isDownloadReady = false,
  isTTSEnabled,
  onTTSPlay,
  onTTSPause,
  onTTSResume,
  onTTSStop,
  ttsPlaybackStatus,
  videoUrl,
  videoFormat = 'webm',
  downloadFormat = videoFormat,
  isOptimized = false,
}) => {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPreviewReady, setIsPreviewReady] = useState(false);

  const [imageSlots, setImageSlots] = useState<[ImageSlotState, ImageSlotState]>([
    getDefaultSlotState(), getDefaultSlotState()
  ]);
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);

  const { durationsMs: previewDurationsMs, totalDurationMs: previewTotalDurationMs } = useMemo(
    () => computePreviewPlaybackPlan(scenes),
    [scenes],
  );
  const originalTotalDurationMs = useMemo(
    () => scenes.reduce((sum, scene) => sum + Math.max(0, scene.duration) * 1000, 0),
    [scenes],
  );
  const previewIsAccelerated = previewTotalDurationMs > 0 && originalTotalDurationMs > previewTotalDurationMs + 1;
  const resolveSceneDurationMs = (index: number): number => {
    if (index < 0 || index >= scenes.length) {
      return 0;
    }
    const planned = previewDurationsMs[index];
    if (typeof planned === 'number' && planned > 0) {
      return planned;
    }
    return Math.max(0, scenes[index].duration) * 1000;
  };
  const formatSeconds = (value: number): string => {
    if (!Number.isFinite(value) || value <= 0) {
      return '0.0';
    }
    return value >= 10 ? Math.round(value).toString() : value.toFixed(1);
  };

  const sceneTimeoutRef = useRef<number | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const animationTriggerFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const frameSkipRef = useRef<number>(0);

  const currentScene = scenes[currentSceneIndex];
  const currentSceneDurationMs = resolveSceneDurationMs(currentSceneIndex);
  const previewElapsedSeconds = currentSceneDurationMs > 0 ? Math.min(elapsedTime, currentSceneDurationMs) / 1000 : 0;
  const previewSceneSeconds = currentSceneDurationMs / 1000;
  const originalSceneSeconds = currentScene ? Math.max(0, currentScene.duration) : 0;

  useEffect(() => {
    if (!videoUrl) {
      return;
    }
    if (animationTriggerFrameRef.current !== null) cancelAnimationFrame(animationTriggerFrameRef.current);
    if (sceneTimeoutRef.current) clearTimeout(sceneTimeoutRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setIsPlaying(false);
    setElapsedTime(0);
    onTTSStop();
  }, [videoUrl, onTTSStop]);

  // Effect for initial scene load and regeneration
  useEffect(() => {
    if (scenes.length > 0 && !isGenerating) {
      setCurrentSceneIndex(0);
      setActiveSlotIndex(0);
      setImageSlots([getDefaultSlotState(), getDefaultSlotState()]);
      setElapsedTime(0);
      setIsPlaying(true);
      setIsPreviewReady(true);
    } else if (scenes.length === 0 || isGenerating) {
      setIsPlaying(false);
      setIsPreviewReady(false);
      onTTSStop(); 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes, isGenerating]);


  // Main playback and transition effect
  useEffect(() => {
    if (animationTriggerFrameRef.current !== null) cancelAnimationFrame(animationTriggerFrameRef.current);
    if (sceneTimeoutRef.current) clearTimeout(sceneTimeoutRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

    if (!isPlaying || !currentScene || scenes.length === 0) {
      if (!isPlaying && ttsPlaybackStatus === 'playing') onTTSPause();
      if (isPlaying && ttsPlaybackStatus === 'paused' && scenes.length > 0) onTTSResume();
      
      if (!currentScene || scenes.length === 0) {
         setImageSlots(prevSlots => [
            {...prevSlots[0], opacity: 0},
            {...prevSlots[1], opacity: 0}
        ]);
      }
      return;
    }

    if (isTTSEnabled) {
      onTTSPlay(currentScene.sceneText);
    } else {
      onTTSStop();
    }

    const primarySlot = activeSlotIndex;
    const secondarySlot = 1 - activeSlotIndex;
    const sceneDurationMs = resolveSceneDurationMs(currentSceneIndex);
    const kbConfig = currentScene.kenBurnsConfig; // Use stored config

    const initialCSSTransform = `scale(1) translate(0%, 0%)`;
    const targetCSSTransform = `scale(${kbConfig.targetScale}) translate(${kbConfig.targetXPercent}%, ${kbConfig.targetYPercent}%)`;
    const cssTransformOrigin = `${kbConfig.originXRatio * 100}% ${kbConfig.originYRatio * 100}%`;

    setImageSlots(prevSlots => {
      const newSlots = [...prevSlots] as [ImageSlotState, ImageSlotState];
      newSlots[primarySlot] = {
        scene: currentScene,
        opacity: 1,
        zIndex: 10,
        transform: initialCSSTransform,
        transformOrigin: cssTransformOrigin,
        transition: `opacity ${FADE_DURATION_MS}ms ${TRANSITION_EASING}`,
      };
      if (newSlots[secondarySlot].opacity !== 0) {
        newSlots[secondarySlot] = { ...newSlots[secondarySlot], opacity: 0, zIndex: 5 };
      } else {
        newSlots[secondarySlot].zIndex = 5;
      }
      return newSlots;
    });

    animationTriggerFrameRef.current = requestAnimationFrame(() => {
      setImageSlots(prevSlots => {
        const newSlots = [...prevSlots] as [ImageSlotState, ImageSlotState];
        if (newSlots[primarySlot].scene?.id === currentScene.id) {
          newSlots[primarySlot].transform = targetCSSTransform;
          newSlots[primarySlot].transition = `opacity ${FADE_DURATION_MS}ms ${TRANSITION_EASING}, transform ${kbConfig.animationDurationS}s cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        }
        return newSlots;
      });
    });

    setElapsedTime(0);
    
    // Enhanced timing system for better audio synchronization
    let currentElapsed = 0;
    let startTime = performance.now();
    
    const updateProgress = (currentTime: number) => {
      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = currentTime;
        startTime = currentTime;
      }
      
      const deltaTime = currentTime - lastFrameTimeRef.current;
      const totalElapsed = currentTime - startTime;
      
      // More frequent updates for better synchronization (16ms for 60fps)
      if (deltaTime >= 16) {
        currentElapsed = totalElapsed;
        
        // Ensure we don't exceed scene duration
        if (currentElapsed >= sceneDurationMs) {
          setElapsedTime(sceneDurationMs);
          return;
        }
        
        setElapsedTime(currentElapsed);
        lastFrameTimeRef.current = currentTime;
      }
      
      if (currentElapsed < sceneDurationMs) {
        animationTriggerFrameRef.current = requestAnimationFrame(updateProgress);
      }
    };
    
    animationTriggerFrameRef.current = requestAnimationFrame(updateProgress);

    sceneTimeoutRef.current = window.setTimeout(() => {
      if (animationTriggerFrameRef.current) {
        cancelAnimationFrame(animationTriggerFrameRef.current);
        animationTriggerFrameRef.current = null;
      }

      if (currentSceneIndex < scenes.length - 1) {
        const nextScene = scenes[currentSceneIndex + 1];
        const nextKbConfig = nextScene.kenBurnsConfig; // Use stored config for next scene
        const nextInitialCSSTransform = `scale(1) translate(0%, 0%)`;
        const nextTargetCSSTransform = `scale(${nextKbConfig.targetScale}) translate(${nextKbConfig.targetXPercent}%, ${nextKbConfig.targetYPercent}%)`;
        const nextCSSTransformOrigin = `${nextKbConfig.originXRatio * 100}% ${nextKbConfig.originYRatio * 100}%`;


        setImageSlots(prevSlots => {
          const newSlots = [...prevSlots] as [ImageSlotState, ImageSlotState];
          newSlots[primarySlot] = { ...newSlots[primarySlot], opacity: 0, zIndex: 5 };
          newSlots[secondarySlot] = {
            scene: nextScene,
            opacity: 1,
            zIndex: 10,
            transform: nextInitialCSSTransform,
            transformOrigin: nextCSSTransformOrigin,
            transition: `opacity ${FADE_DURATION_MS}ms ${TRANSITION_EASING}`,
          };
          return newSlots;
        });

        animationTriggerFrameRef.current = requestAnimationFrame(() => {
          setImageSlots(prevSlots => {
            const newSlots = [...prevSlots] as [ImageSlotState, ImageSlotState];
            if (newSlots[secondarySlot].scene?.id === nextScene.id) {
              newSlots[secondarySlot].transform = nextTargetCSSTransform;
              newSlots[secondarySlot].transition = `opacity ${FADE_DURATION_MS}ms ${TRANSITION_EASING}, transform ${nextKbConfig.animationDurationS}s cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
            }
            return newSlots;
          });
        });

        window.setTimeout(() => {
          setCurrentSceneIndex(prevIndex => prevIndex + 1);
          setActiveSlotIndex(secondarySlot);
        }, FADE_DURATION_MS);

      } else { 
        setImageSlots(prevSlots => {
          const newSlots = [...prevSlots] as [ImageSlotState, ImageSlotState];
          newSlots[primarySlot] = { ...newSlots[primarySlot], opacity: 0 };
          return newSlots;
        });
        window.setTimeout(() => {
          setIsPlaying(false);
        }, FADE_DURATION_MS);
      }
    }, Math.max(200, sceneDurationMs - FADE_DURATION_MS));

    return () => { 
      if (animationTriggerFrameRef.current !== null) {
        cancelAnimationFrame(animationTriggerFrameRef.current);
        animationTriggerFrameRef.current = null;
      }
      if (sceneTimeoutRef.current) clearTimeout(sceneTimeoutRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      lastFrameTimeRef.current = 0;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentScene?.id, scenes.length, activeSlotIndex, isTTSEnabled]); 


  useEffect(() => {
    return () => {
      onTTSStop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 


  const handlePlayPause = () => {
    if (scenes.length === 0 || isGenerating) return;
    const newIsPlaying = !isPlaying;
    setIsPlaying(newIsPlaying);

    if (newIsPlaying) {
        if (currentSceneIndex === scenes.length - 1 && elapsedTime >= resolveSceneDurationMs(currentSceneIndex)) {
            handleRestart(); 
        } else {
           if (ttsPlaybackStatus === 'paused') onTTSResume();
        }
    } else {
        if (ttsPlaybackStatus === 'playing') onTTSPause();
    }
  };

  const handleRestart = () => {
    if (scenes.length === 0 || isGenerating) return;
    onTTSStop();
    setCurrentSceneIndex(0);
    setActiveSlotIndex(0);
    setImageSlots([getDefaultSlotState(), getDefaultSlotState()]);
    setElapsedTime(0);
    setIsPlaying(true);
  };

  const footageAspectRatioClass = aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]';
  const previewFormatLabel = videoFormat?.toUpperCase() ?? 'VIDEO';
  const resolvedDownloadFormatLabel = (downloadFormat ?? videoFormat ?? 'video').toUpperCase();
  const downloadButtonText = (() => {
    if (isDownloading) return 'Rendering video...';
    if (isPreparingVideoFile) return `Updating ${previewFormatLabel} preview...`;
    if (isPreparingDownload && !isDownloadReady) return 'Preparing HD download...';
    if (isPreparingDownload && isDownloadReady) return `Refreshing ${resolvedDownloadFormatLabel} download...`;
    if (isDownloadReady) return `Download ${resolvedDownloadFormatLabel}`;
    return `Download ${previewFormatLabel}`;
  })();
  const isDownloadButtonBusy = isPreparingVideoFile || isPreparingDownload;

  if (videoUrl) {
    return (
      <div className="bg-neutral-900 border border-neutral-700 p-1 sm:p-2 rounded-lg shadow-xl">
        <div className={`relative w-full ${footageAspectRatioClass} bg-black overflow-hidden rounded-md`}>
          <video
            key={videoUrl}
            controls
            playsInline
            loop
            autoPlay
            muted
            className="w-full h-full rounded-md"
          >
            <source src={videoUrl} type={`video/${videoFormat}`} />
            Your browser does not support the video tag.
          </video>
          {isPreparingVideoFile && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-sm sm:text-base">
              Updating preview video...
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between space-x-2">
          <div className="text-xs sm:text-sm text-gray-400 uppercase tracking-wide">
            {previewFormatLabel} preview ready
          </div>
          <button
            onClick={onDownloadRequest}
            disabled={isDownloading || isGenerating}
            className="flex items-center px-3 py-2 sm:px-4 sm:py-2.5 bg-white hover:bg-gray-200 disabled:opacity-50 text-black text-xs sm:text-sm font-medium rounded-md shadow-sm transition-colors"
            aria-live="polite"
            aria-busy={isDownloadButtonBusy || undefined}
          >
            <DownloadIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
            {downloadButtonText}
          </button>
        </div>
        {isPreparingDownload && !isDownloadReady && (
          <p className="mt-2 text-[10px] sm:text-xs text-gray-400">
            Preparing a high-quality download in the background...
          </p>
        )}
        {isDownloadReady && downloadFormat && (
          <p className="mt-2 text-[10px] sm:text-xs text-gray-400">
            Download ready as {resolvedDownloadFormatLabel}.
          </p>
        )}
      </div>
    );
  }

  const getImageStyle = (slotState: ImageSlotState): React.CSSProperties => ({
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: slotState.opacity,
    zIndex: slotState.zIndex,
    transform: slotState.transform,
    transformOrigin: slotState.transformOrigin,
    transition: slotState.transition,
    willChange: 'opacity, transform',
  });

  if (scenes.length === 0 && !isGenerating) {
    return (
      <div className={`w-full bg-neutral-900 border border-neutral-700 rounded-lg shadow-lg flex items-center justify-center text-gray-500 ${aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'}`}>
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">Ready to Create</div>
          <div className="text-sm">Enter narration and click "Generate Video" to see preview</div>
        </div>
      </div>
    );
  }

  if (isGenerating && scenes.length === 0) {
     return (
      <div className={`w-full bg-neutral-900 border border-neutral-700 rounded-lg shadow-lg flex flex-col items-center justify-center text-gray-400 ${aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent mb-4"></div>
        <p className="text-lg font-semibold mb-2">Generating Video...</p>
        <p className="text-sm text-gray-500">Creating your viral content</p>
      </div>
    );
  }

  const previewTotalDurationSeconds = previewTotalDurationMs / 1000;
  const previewPlayedDurationSeconds =
    previewDurationsMs.slice(0, currentSceneIndex).reduce((sum, duration) => sum + duration, 0) / 1000 +
    (currentSceneDurationMs > 0 ? Math.min(elapsedTime, currentSceneDurationMs) / 1000 : 0);

  return (
    <div className="bg-neutral-900 border border-neutral-700 p-1 sm:p-2 rounded-lg shadow-xl">
      <div className={`relative w-full ${footageAspectRatioClass} bg-black overflow-hidden rounded-md`}>
        {imageSlots.map((slot, index) => (
          slot.scene ? (
            slot.scene.footageType === 'video' ? (
              <video
                key={`slot-${index}-${slot.scene.id}`}
                src={slot.scene.footageUrl}
                style={getImageStyle(slot)}
                crossOrigin="anonymous"
                autoPlay
                muted
                loop
                playsInline
              />
            ) : (
              <img
                key={`slot-${index}-${slot.scene.id}`}
                src={slot.scene.footageUrl}
                alt={`Footage for: ${slot.scene.keywords.join(', ')}`}
                style={getImageStyle(slot)}
                crossOrigin="anonymous"
                loading={index === activeSlotIndex || index === (1-activeSlotIndex) ? "eager" : "lazy"}
              />
            )
          ) : null
        ))}
        {currentScene && isPlaying && (
            <div
              className="absolute top-0 left-0 h-1 bg-white transition-all duration-100 ease-linear"
              style={{ width: `${currentSceneDurationMs > 0 ? (Math.min(elapsedTime, currentSceneDurationMs) / currentSceneDurationMs) * 100 : 0}%` }}
            ></div>
        )}
      </div>
      {scenes.length > 0 && (
        <div className="mt-2 h-2 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-white"
            style={{
              width: `${previewTotalDurationSeconds > 0 ? (previewPlayedDurationSeconds / previewTotalDurationSeconds) * 100 : 0}%`,
              transition: previewPlayedDurationSeconds > 0 ? 'width 0.1s linear' : 'none',
            }}
          ></div>
        </div>
      )}
      {previewIsAccelerated && (
        <div className="mt-1 text-[10px] sm:text-xs text-gray-500">
          Preview fast-forwarded to finish within {PREVIEW_MAX_TOTAL_DURATION_SECONDS}s.
        </div>
      )}
      {isOptimized && (
        <div className="mt-1 text-[10px] sm:text-xs text-green-400">
          ⚡ Optimized preview - instant loading
        </div>
      )}
      <div className="mt-3 flex items-center justify-between space-x-2">
        <div className="flex items-center space-x-2">
          <button
            onClick={handlePlayPause}
            disabled={scenes.length === 0 || isGenerating || isDownloading}
            className="p-2 rounded-full bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 transition-colors text-white hover:text-gray-300"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <PauseIcon className="w-5 h-5 sm:w-6 sm:h-6" /> : <PlayIcon className="w-5 h-5 sm:w-6 sm:h-6" />}
          </button>
           <button
            onClick={handleRestart}
            disabled={scenes.length === 0 || isGenerating || isDownloading}
            className="p-2 rounded-full bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 transition-colors text-sm text-white hover:text-gray-300"
            aria-label="Restart"
          >
            Restart
          </button>
        </div>
        <div className="text-xs sm:text-sm text-gray-400 truncate">
          {currentScene ? `Scene ${currentSceneIndex + 1}/${scenes.length}` : (scenes.length > 0 ? `Ready` : `No video`)}
          {currentScene && isPlaying && ` (${formatSeconds(previewElapsedSeconds)}s / ${formatSeconds(previewSceneSeconds)}s${previewIsAccelerated ? ` · Original ${formatSeconds(originalSceneSeconds)}s` : ''})`}
          {currentScene && ttsPlaybackStatus === 'playing' && isTTSEnabled && <span className="ml-1 animate-pulse">(🔊)</span>}
          {!isPlaying && scenes.length > 0 && currentSceneIndex === scenes.length -1 && elapsedTime >= resolveSceneDurationMs(currentSceneIndex) && " Ended"}
          <div className="text-xs text-gray-500 mt-1">
            Total: {formatSeconds(previewTotalDurationSeconds)}s
          </div>
        </div>
        <button
          onClick={onDownloadRequest}
          disabled={scenes.length === 0 || isGenerating || isDownloading}
          className="flex items-center px-3 py-2 sm:px-4 sm:py-2.5 bg-white hover:bg-gray-200 disabled:opacity-50 text-black text-xs sm:text-sm font-medium rounded-md shadow-sm transition-colors"
          aria-live="polite"
          aria-busy={isDownloadButtonBusy || undefined}
        >
          <DownloadIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
          {downloadButtonText}
        </button>
      </div>
      {isPreparingDownload && !isDownloadReady && (
        <div className="mt-2 text-xs sm:text-sm text-gray-400 text-right">
          Preparing a high-quality download in the background...
        </div>
      )}
      {isPreparingVideoFile && (
        <div className="mt-2 text-xs sm:text-sm text-gray-400 text-right">Rendering preview video file...</div>
      )}
      {isDownloadReady && downloadFormat && (
        <div className="mt-1 text-xs sm:text-sm text-gray-400 text-right">
          Download ready as {resolvedDownloadFormatLabel}.
        </div>
      )}
    </div>
  );
};

export default VideoPreview;
