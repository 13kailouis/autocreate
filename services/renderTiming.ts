import { Scene } from '../types.ts';

export type RenderMode = 'preview' | 'download';

export interface SceneRenderPlanItem {
  scene: Scene;
  durationSeconds: number;
  frameCount: number;
}

const PREVIEW_MIN_SCENE_DURATION_SECONDS = 0.75;
export const PREVIEW_MAX_TOTAL_DURATION_SECONDS = 15;

const clampDurationsWithMinimums = (
  durations: number[],
  minimums: number[],
  targetTotal: number,
): number[] => {
  const adjusted = durations.slice();
  if (adjusted.length === 0) {
    return adjusted;
  }

  const epsilon = 1e-3;
  let total = adjusted.reduce((sum, value) => sum + value, 0);

  if (total <= targetTotal) {
    return adjusted;
  }

  let iterations = 0;
  while (total - targetTotal > epsilon && iterations < 1000) {
    const adjustableIndices = adjusted
      .map((value, index) => ({ value, index }))
      .filter(({ value, index }) => value - minimums[index] > epsilon);

    if (adjustableIndices.length === 0) {
      break;
    }

    const excess = total - targetTotal;
    const decrement = excess / adjustableIndices.length;
    let consumed = 0;

    for (const { index } of adjustableIndices) {
      const maxReduction = adjusted[index] - minimums[index];
      if (maxReduction <= 0) {
        continue;
      }
      const reduction = Math.min(maxReduction, decrement);
      if (reduction <= 0) {
        continue;
      }
      adjusted[index] -= reduction;
      consumed += reduction;
    }

    if (consumed <= epsilon) {
      break;
    }

    total -= consumed;
    iterations += 1;
  }

  if (total > targetTotal) {
    const scale = targetTotal / total;
    for (let i = 0; i < adjusted.length; i++) {
      adjusted[i] = Math.max(minimums[i], adjusted[i] * scale);
    }
  }

  return adjusted;
};

const sanitiseDuration = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
};

export const computeEffectiveDurations = (scenes: Scene[], mode: RenderMode): number[] => {
  if (mode !== 'preview') {
    return scenes.map(scene => sanitiseDuration(scene.duration));
  }

  if (scenes.length === 0) {
    return [];
  }

  const sanitisedDurations = scenes.map(scene => sanitiseDuration(scene.duration));
  const totalOriginalDuration = sanitisedDurations.reduce((sum, value) => sum + value, 0);

  if (totalOriginalDuration <= 0) {
    return new Array(scenes.length).fill(0);
  }

  if (totalOriginalDuration <= PREVIEW_MAX_TOTAL_DURATION_SECONDS) {
    return sanitisedDurations;
  }

  const scaledDurations = sanitisedDurations.map(value => {
    if (value <= 0) {
      return 0;
    }
    return (value / totalOriginalDuration) * PREVIEW_MAX_TOTAL_DURATION_SECONDS;
  });

  const positiveDurationCount = sanitisedDurations.filter(value => value > 0).length;
  const dynamicMinimum = positiveDurationCount > 0
    ? Math.min(
        PREVIEW_MIN_SCENE_DURATION_SECONDS,
        PREVIEW_MAX_TOTAL_DURATION_SECONDS / positiveDurationCount,
      )
    : 0;

  const minimums = sanitisedDurations.map(value => (value > 0 ? dynamicMinimum : 0));

  const clamped = scaledDurations.map((value, index) => {
    if (minimums[index] === 0) {
      return 0;
    }
    return Math.max(minimums[index], value);
  });

  return clampDurationsWithMinimums(clamped, minimums, PREVIEW_MAX_TOTAL_DURATION_SECONDS);
};

export const buildRenderPlan = (
  scenes: Scene[],
  fps: number,
  mode: RenderMode,
): SceneRenderPlanItem[] => {
  const effectiveDurations = computeEffectiveDurations(scenes, mode);

  return scenes.map((scene, index) => {
    const durationSecondsRaw = effectiveDurations[index] ?? 0;
    const safeDurationSeconds = durationSecondsRaw > 0.01
      ? durationSecondsRaw
      : mode === 'preview'
        ? PREVIEW_MIN_SCENE_DURATION_SECONDS
        : Math.max(1.2, 1 / fps);
    const frameCount = Math.max(1, Math.ceil(safeDurationSeconds * fps));

    return {
      scene,
      durationSeconds: safeDurationSeconds,
      frameCount,
    };
  });
};

export const computePreviewPlaybackPlan = (
  scenes: Scene[],
): {
  durationsMs: number[];
  totalDurationMs: number;
  playbackSpeed: number;
} => {
  const effectiveDurations = computeEffectiveDurations(scenes, 'preview');
  const durationsMs = effectiveDurations.map(duration => Math.max(0, duration) * 1000);
  const totalEffectiveDurationMs = durationsMs.reduce((sum, value) => sum + value, 0);
  const totalOriginalDurationMs = scenes.reduce(
    (sum, scene) => sum + sanitiseDuration(scene.duration) * 1000,
    0,
  );

  const playbackSpeed = totalEffectiveDurationMs > 0
    ? totalOriginalDurationMs > 0
      ? totalOriginalDurationMs / totalEffectiveDurationMs
      : 1
    : 1;

  return {
    durationsMs,
    totalDurationMs: totalEffectiveDurationMs,
    playbackSpeed,
  };
};

