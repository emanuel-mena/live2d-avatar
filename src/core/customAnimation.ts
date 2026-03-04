import type { AvatarState } from "./manifest";

export interface ParameterOscillator {
  paramId: string;
  amplitude: number;
  speedHz: number;
  offset?: number;
  phase?: number;
}

export interface StateAnimationProfile {
  base?: Record<string, number>;
  oscillators?: ParameterOscillator[];
  smoothing?: number;
}

export interface AnimationManifest {
  version?: string;
  states: Record<AvatarState, StateAnimationProfile>;
}

const DEFAULT_SMOOTHING = 0.2;
const TAU = Math.PI * 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function finiteOr(fallback: number, value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeStateProfile(name: string, raw: unknown): StateAnimationProfile {
  if (!isRecord(raw)) {
    throw new Error(`Animation state "${name}" must be an object.`);
  }

  const out: StateAnimationProfile = {};

  if (raw.base !== undefined) {
    if (!isRecord(raw.base)) {
      throw new Error(`Animation state "${name}".base must be an object.`);
    }

    const base: Record<string, number> = {};
    for (const [paramId, value] of Object.entries(raw.base)) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Animation state "${name}".base["${paramId}"] must be a finite number.`);
      }
      base[paramId] = value;
    }
    out.base = base;
  }

  if (raw.oscillators !== undefined) {
    if (!Array.isArray(raw.oscillators)) {
      throw new Error(`Animation state "${name}".oscillators must be an array.`);
    }

    const oscillators: ParameterOscillator[] = [];
    for (const [index, oscRaw] of raw.oscillators.entries()) {
      if (!isRecord(oscRaw)) {
        throw new Error(`Animation state "${name}".oscillators[${index}] must be an object.`);
      }

      const paramId = typeof oscRaw.paramId === "string" ? oscRaw.paramId.trim() : "";
      if (!paramId) {
        throw new Error(`Animation state "${name}".oscillators[${index}].paramId is required.`);
      }

      const amplitude = finiteOr(NaN, oscRaw.amplitude);
      if (!Number.isFinite(amplitude)) {
        throw new Error(`Animation state "${name}".oscillators[${index}].amplitude must be a number.`);
      }

      const speedHz = finiteOr(NaN, oscRaw.speedHz);
      if (!Number.isFinite(speedHz) || speedHz < 0) {
        throw new Error(`Animation state "${name}".oscillators[${index}].speedHz must be >= 0.`);
      }

      oscillators.push({
        paramId,
        amplitude,
        speedHz,
        offset: finiteOr(0, oscRaw.offset),
        phase: finiteOr(0, oscRaw.phase),
      });
    }

    out.oscillators = oscillators;
  }

  if (raw.smoothing !== undefined) {
    const smoothing = finiteOr(NaN, raw.smoothing);
    if (!Number.isFinite(smoothing)) {
      throw new Error(`Animation state "${name}".smoothing must be a number between 0 and 1.`);
    }
    out.smoothing = clamp01(smoothing);
  }

  return out;
}

export function validateAnimationManifest(raw: unknown): AnimationManifest {
  if (!isRecord(raw)) {
    throw new Error("Animation manifest must be an object.");
  }

  const statesRaw = raw.states;
  if (!isRecord(statesRaw)) {
    throw new Error("Animation manifest.states must be an object.");
  }

  const states: Record<string, StateAnimationProfile> = {};
  for (const [state, cfgRaw] of Object.entries(statesRaw)) {
    states[state] = normalizeStateProfile(state, cfgRaw);
  }

  if (Object.keys(states).length === 0) {
    throw new Error("Animation manifest.states must define at least one state.");
  }

  return {
    version: typeof raw.version === "string" ? raw.version : undefined,
    states,
  };
}

export async function loadAnimationManifest(url: string): Promise<AnimationManifest> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load animation manifest: ${res.status} ${res.statusText}`);
  }
  return validateAnimationManifest(await res.json());
}

export const DEFAULT_ANIMATION_MANIFEST: AnimationManifest = {
  version: "0.1",
  states: {
    idle: {
      smoothing: 0.18,
      base: {
        ParamAngleY: -2,
        ParamBodyAngleX: 1,
      },
      oscillators: [
        { paramId: "ParamAngleX", amplitude: 7, speedHz: 0.07 },
        { paramId: "ParamAngleY", amplitude: 3, speedHz: 0.11 },
      ],
    },
    listening: {
      smoothing: 0.22,
      base: {
        ParamAngleY: 2,
        ParamBodyAngleX: 4,
      },
      oscillators: [
        { paramId: "ParamAngleX", amplitude: 4, speedHz: 0.14 },
        { paramId: "ParamBodyAngleX", amplitude: 2, speedHz: 0.12, phase: Math.PI / 3 },
      ],
    },
    speaking: {
      smoothing: 0.28,
      base: {
        ParamBodyAngleX: 3,
        ParamMouthForm: 0.4,
      },
      oscillators: [
        { paramId: "ParamAngleX", amplitude: 10, speedHz: 0.24 },
        { paramId: "ParamAngleY", amplitude: 5, speedHz: 0.2, phase: Math.PI / 2 },
        { paramId: "ParamBodyAngleX", amplitude: 4, speedHz: 0.22 },
      ],
    },
    surprised: {
      smoothing: 0.35,
      base: {
        ParamAngleY: 9,
        ParamBodyAngleX: 6,
        ParamBrowLY: 0.5,
        ParamBrowRY: 0.5,
        ParamEyeLOpen: 1.1,
        ParamEyeROpen: 1.1,
      },
      oscillators: [{ paramId: "ParamAngleX", amplitude: 3, speedHz: 0.4 }],
    },
    confused: {
      smoothing: 0.3,
      base: {
        ParamAngleY: -6,
        ParamBodyAngleX: -4,
        ParamMouthForm: -0.5,
      },
      oscillators: [
        { paramId: "ParamAngleX", amplitude: 5, speedHz: 0.16, phase: Math.PI },
        { paramId: "ParamAngleY", amplitude: 2, speedHz: 0.2 },
      ],
    },
  },
};

export class ParameterAnimationEngine {
  private manifest: AnimationManifest;
  private state: AvatarState = "idle";
  private currentValues = new Map<string, number>();
  private knownParamIds = new Set<string>();

  constructor(manifest: AnimationManifest) {
    this.manifest = manifest;
  }

  setManifest(manifest: AnimationManifest) {
    this.manifest = manifest;
  }

  setState(state: AvatarState) {
    this.state = state;
  }

  reset(state: AvatarState = "idle") {
    this.state = state;
    this.currentValues.clear();
  }

  getKnownParamIds(): string[] {
    return [...this.knownParamIds];
  }

  tick(nowMs = performance.now()): Record<string, number> {
    const stateProfile = this.resolveProfile(this.state);
    const smoothing = clamp01(stateProfile.smoothing ?? DEFAULT_SMOOTHING);
    const blend = Math.max(0.001, smoothing);

    const tSec = nowMs / 1000;
    const targets = new Map<string, number>();

    if (stateProfile.base) {
      for (const [paramId, value] of Object.entries(stateProfile.base)) {
        targets.set(paramId, value);
        this.knownParamIds.add(paramId);
      }
    }

    for (const osc of stateProfile.oscillators ?? []) {
      const wave = Math.sin(tSec * TAU * osc.speedHz + (osc.phase ?? 0));
      const current = targets.get(osc.paramId) ?? 0;
      targets.set(osc.paramId, current + (osc.offset ?? 0) + wave * osc.amplitude);
      this.knownParamIds.add(osc.paramId);
    }

    for (const paramId of this.knownParamIds) {
      const from = this.currentValues.get(paramId) ?? 0;
      const to = targets.get(paramId) ?? 0;
      const next = from + (to - from) * blend;
      this.currentValues.set(paramId, next);
    }

    const out: Record<string, number> = {};
    for (const [paramId, value] of this.currentValues.entries()) {
      out[paramId] = value;
    }
    return out;
  }

  private resolveProfile(state: AvatarState): StateAnimationProfile {
    return this.manifest.states[state] ?? this.manifest.states.idle ?? Object.values(this.manifest.states)[0] ?? {};
  }
}
