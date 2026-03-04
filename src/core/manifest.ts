export type AvatarState = string;

export interface MotionRef {
  id?: string;     // opcional (compat)
  group?: string;  // nuevo
  index?: number;  // nuevo
}

export interface StateConfig {
  motions: (string | MotionRef)[];
  blendMs?: number;
  loop?: boolean;
  priority?: number;
  cooldownMs?: number;
  demoDurationMs?: number; // por ahora; luego se reemplaza por duración real
}

export interface Rule {
  from: AvatarState | "*";
  to: AvatarState;
  blendMs?: number;
  cooldownMs?: number;
}

export interface MotionsManifest {
  version?: string;
  states: Record<AvatarState, StateConfig>;
  rules?: Rule[];
}

export const DEFAULTS = {
  blendMs: 200,
  priority: 0,
  cooldownMs: 0,
  demoDurationMs: 900,
} as const;

export const DEFAULT_MANIFEST: MotionsManifest = {
  version: "0.1",
  states: {
    idle: { motions: ["Idle_01", "Idle_02"], loop: true, blendMs: 250, demoDurationMs: 900 },
    listening: { motions: ["Listen_01"], loop: true, blendMs: 180, demoDurationMs: 700 },
    speaking: { motions: ["Talk_01", "Talk_02"], loop: true, blendMs: 120, demoDurationMs: 600 },
    surprised: { motions: ["Surprise"], blendMs: 80, priority: 10, cooldownMs: 2000, demoDurationMs: 900 },
    confused: { motions: ["Confused_01"], blendMs: 140, priority: 5, cooldownMs: 1200, demoDurationMs: 1000 }
  },
  rules: [
    { from: "*", to: "surprised", cooldownMs: 2000 },
    { from: "speaking", to: "listening", blendMs: 160 }
  ]
};

export function normalizeMotion(m: string | MotionRef): MotionRef {
  if (typeof m === "string") return { group: m, index: 0, id: m };
  return {
    id: m.id,
    group: m.group ?? m.id,
    index: typeof m.index === "number" ? m.index : 0,
  };
}

export function validateManifest(raw: unknown): MotionsManifest {
  if (!raw || typeof raw !== "object") throw new Error("Manifest must be an object.");
  const obj = raw as any;

  if (!obj.states || typeof obj.states !== "object") {
    throw new Error("Manifest.states must be an object.");
  }

  for (const [stateName, cfg] of Object.entries(obj.states)) {
    if (!cfg || typeof cfg !== "object") throw new Error(`State "${stateName}" must be an object.`);
    if (!Array.isArray((cfg as any).motions) || (cfg as any).motions.length === 0) {
      throw new Error(`State "${stateName}" must have a non-empty motions array.`);
    }
  }

  if (obj.rules && !Array.isArray(obj.rules)) {
    throw new Error("Manifest.rules must be an array if provided.");
  }

  return obj as MotionsManifest;
}

export async function loadManifest(url: string): Promise<MotionsManifest> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load motions manifest: ${res.status} ${res.statusText}`);
  return validateManifest(await res.json());
}