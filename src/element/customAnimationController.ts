import {
  DEFAULT_ANIMATION_MANIFEST,
  ParameterAnimationEngine,
  type AnimationManifest,
} from "../core/customAnimation";
import type { AvatarState } from "../core/manifest";
import type { AnimationMode } from "./attributes";

interface AvatarCustomAnimationControllerHooks {
  onFrame: (values: Record<string, number>) => void;
}

export class AvatarCustomAnimationController {
  private readonly hooks: AvatarCustomAnimationControllerHooks;
  private readonly engine = new ParameterAnimationEngine(DEFAULT_ANIMATION_MANIFEST);

  private mode: AnimationMode = "custom";
  private currentState: AvatarState = "idle";
  private raf = 0;
  private touchedParamIds = new Set<string>();

  constructor(hooks: AvatarCustomAnimationControllerHooks) {
    this.hooks = hooks;
  }

  setManifest(manifest: AnimationManifest) {
    this.engine.setManifest(manifest);
    this.engine.reset(this.currentState);
  }

  resetManifest() {
    this.setManifest(DEFAULT_ANIMATION_MANIFEST);
  }

  setState(state: AvatarState) {
    this.currentState = state;
    this.engine.setState(state);
  }

  setMode(mode: AnimationMode) {
    if (this.mode === mode) return;
    this.mode = mode;

    if (mode === "custom") {
      this.start();
      return;
    }

    this.stopAndClear();
  }

  ensureRunning() {
    if (this.mode === "custom") {
      this.start();
    }
  }

  destroy() {
    this.stopAndClear();
  }

  private start() {
    if (this.raf) return;

    const tick = () => {
      this.raf = requestAnimationFrame(tick);

      const values = this.engine.tick();
      for (const paramId of Object.keys(values)) {
        this.touchedParamIds.add(paramId);
      }

      this.hooks.onFrame(values);
    };

    tick();
  }

  private stopAndClear() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;

    const zeros: Record<string, number> = {};
    for (const paramId of this.touchedParamIds) {
      zeros[paramId] = 0;
    }

    if (Object.keys(zeros).length > 0) {
      this.hooks.onFrame(zeros);
    }

    this.touchedParamIds.clear();
    this.engine.reset(this.currentState);
  }
}
