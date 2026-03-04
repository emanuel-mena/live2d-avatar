import type { MotionsManifest, AvatarState, StateConfig } from "./manifest";
import { normalizeMotion } from "./manifest";

export interface MotionTarget {
  group: string;
  index: number;
  fadeMs: number;
  loop: boolean;
}

function pickRandomIndex(len: number): number {
  return Math.floor(Math.random() * len);
}

export class MotionRouter {
  private manifest: MotionsManifest;

  constructor(manifest: MotionsManifest) {
    this.manifest = manifest;
  }

  setManifest(manifest: MotionsManifest) {
    this.manifest = manifest;
  }

  resolve(state: AvatarState): MotionTarget | null {
    const cfg = this.manifest.states[state] as StateConfig | undefined;
    if (!cfg) return null;

    const fadeMs = cfg.blendMs ?? 200;
    const loop = Boolean(cfg.loop);

    const list = cfg.motions ?? [];
    if (list.length === 0) return null;

    const pick = normalizeMotion(list[pickRandomIndex(list.length)]);
    const group = pick.group;
    const index = pick.index ?? 0;

    if (!group) return null;
    return { group, index, fadeMs, loop };
  }
}