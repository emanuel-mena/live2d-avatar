import * as PIXI from "pixi.js";
import { Live2DModel, configureCubism4 } from "pixi-live2d-display-advanced/cubism4";

export type FitMode = "contain" | "cover" | "none";

export interface ModelTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotationDeg: number;
  anchorX: number;
  anchorY: number;
  fit: FitMode;
}

// Let the Live2D plugin discover PIXI (for ticker/auto updates).
(globalThis as any).PIXI = PIXI;

let cubismConfigured = false;

export class Live2DAdapter {
  private app: PIXI.Application | null = null;
  private model: Live2DModel | null = null;

  private builtInAnimationEnabled = false;
  private lipSyncParamId = "PARAM_MOUTH_OPEN_Y";
  private lipSyncValue = 0;

  private lipSyncHook:
    | {
        internal: any;
        handler: () => void;
      }
    | null = null;

  private freezePatch:
    | {
        idleGroup?: string;
        updateFocus?: (this: unknown, ...args: unknown[]) => unknown;
        updateNaturalMovements?: (this: unknown, ...args: unknown[]) => unknown;
      }
    | null = null;

  private resizeObserver: ResizeObserver | null = null;

  private naturalSize: { w: number; h: number } | null = null;

  private transform: ModelTransform = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotationDeg: 0,
    anchorX: 0.5,
    anchorY: 0.5,
    fit: "contain",
  };

  // Barrier: ensures init() completes before loadModel/resize/etc.
  private initPromise: Promise<void> | null = null;

  init(canvas: HTMLCanvasElement): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      // Validate Cubism Core exists BEFORE configuring framework.
      // This should come from: <script src="/live2d/live2dcubismcore.min.js"></script>
      const core = (globalThis as any).Live2DCubismCore;
      if (!core) {
        throw new Error(
          "Live2D Cubism Core not found. Make sure live2dcubismcore.min.js is loaded BEFORE your module script."
        );
      }

      if (!cubismConfigured) {
        configureCubism4({ memorySizeMB: 128 });
        cubismConfigured = true;
      }

      if (this.app) return;

      const app = new PIXI.Application({
        view: canvas,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: devicePixelRatio || 1,
      });

      this.app = app;
    })();

    return this.initPromise;
  }

  private async ensureInit() {
    if (!this.initPromise) {
      throw new Error("Live2DAdapter not initialized. Call init(canvas) first.");
    }
    await this.initPromise;
    if (!this.app) {
      throw new Error("Live2DAdapter initialization failed (app not created).");
    }
  }

  async loadModel(modelUrl: string) {
    await this.ensureInit();

    // Remove old model (swap safely)
    if (this.model) {
      this.detachLipSyncHook();
      this.app!.stage.removeChild(this.model);
      (this.model as any).destroy?.(true);
      this.model = null;
      this.naturalSize = null;
    }

    const model = await Live2DModel.from(modelUrl);
    this.model = model;

    this.app!.stage.addChild(model);
    this.attachLipSyncHook();

    // Measure for precise fit
    this.naturalSize = this.measureNaturalSize(model);
    this.applyBuiltInAnimationMode();
    this.applyLipSyncValue();

    this.layout();
  }

  setBuiltInAnimationEnabled(enabled: boolean) {
    this.builtInAnimationEnabled = enabled;
    this.applyBuiltInAnimationMode();
  }

  setLipSync(paramId: string, value: number) {
    this.lipSyncParamId = paramId.trim() || "PARAM_MOUTH_OPEN_Y";
    this.lipSyncValue = value;
    this.applyLipSyncValue();
  }

  setTransform(partial: Partial<ModelTransform>) {
    this.transform = { ...this.transform, ...partial };
    this.layout();
  }

  setParameter(id: string, value: number) {
    this.writeParameter(id, value);

    // Compatibility alias for mouth-open id across model conventions.
    if (id === "PARAM_MOUTH_OPEN_Y") this.writeParameter("ParamMouthOpenY", value);
    if (id === "ParamMouthOpenY") this.writeParameter("PARAM_MOUTH_OPEN_Y", value);
  }

  private writeParameter(id: string, value: number) {
    const m = this.model as any;
    if (!m) return;

    // pixi-live2d-display-advanced usually exposes internalModel/coreModel.
    const internal = m.internalModel ?? m._internalModel;
    const core = internal?.coreModel;

    if (core && typeof core.setParameterValueById === "function") {
      core.setParameterValueById(id, value);
      return;
    }

    // fallback: some builds expose setParameterValueById directly
    if (typeof m.setParameterValueById === "function") {
      m.setParameterValueById(id, value);
    }
  }

  setParameters(values: Record<string, number>) {
    for (const [id, value] of Object.entries(values)) {
      this.setParameter(id, value);
    }
  }

  attachAutoResize(host: HTMLElement, canvas: HTMLCanvasElement) {
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.resizeToHost(host, canvas));
    this.resizeObserver.observe(host);
    this.resizeToHost(host, canvas);
  }

  private resizeToHost(host: HTMLElement, canvas: HTMLCanvasElement) {
    if (!this.app) return;

    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width || 320));
    const h = Math.max(1, Math.floor(rect.height || 420));

    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    this.app.renderer.resize(w, h);
    this.layout();
  }

  playMotion(group: string, index: number, _fadeMs: number) {
    if (!this.builtInAnimationEnabled) return;

    const m = this.model as any;
    if (!m) return;
    if (typeof m.motion === "function") {
      m.motion(group, index);
    }
  }

  private applyBuiltInAnimationMode() {
    const modelAny = this.model as any;
    if (!modelAny) return;

    const internal = modelAny.internalModel ?? modelAny._internalModel;
    if (!internal) return;

    if (this.builtInAnimationEnabled) {
      this.unfreezeInternalAnimation(internal);
      return;
    }

    this.freezeInternalAnimation(modelAny, internal);
  }

  private attachLipSyncHook() {
    this.detachLipSyncHook();

    const modelAny = this.model as any;
    if (!modelAny) return;

    const internal = modelAny.internalModel ?? modelAny._internalModel;
    if (!internal || typeof internal.on !== "function") return;

    const handler = () => this.applyLipSyncValue();
    internal.on("afterMotionUpdate", handler);
    internal.on("beforeModelUpdate", handler);

    this.lipSyncHook = { internal, handler };
  }

  private detachLipSyncHook() {
    if (!this.lipSyncHook) return;

    const { internal, handler } = this.lipSyncHook;

    if (typeof internal.off === "function") {
      internal.off("afterMotionUpdate", handler);
      internal.off("beforeModelUpdate", handler);
    } else if (typeof internal.removeListener === "function") {
      internal.removeListener("afterMotionUpdate", handler);
      internal.removeListener("beforeModelUpdate", handler);
    }

    this.lipSyncHook = null;
  }

  private applyLipSyncValue() {
    if (!this.model) return;

    const value = Math.max(0, Math.min(1, this.lipSyncValue));
    this.setParameter(this.lipSyncParamId, value);
  }

  private freezeInternalAnimation(modelAny: any, internal: any) {
    if (!this.freezePatch) {
      this.freezePatch = {
        idleGroup: internal.motionManager?.groups?.idle,
        updateFocus: typeof internal.updateFocus === "function" ? internal.updateFocus : undefined,
        updateNaturalMovements:
          typeof internal.updateNaturalMovements === "function" ? internal.updateNaturalMovements : undefined,
      };
    }

    if (typeof modelAny.stopMotions === "function") {
      modelAny.stopMotions();
    }
    internal.motionManager?.stopAllMotions?.();
    for (const parallelManager of internal.parallelMotionManager ?? []) {
      parallelManager?.stopAllMotions?.();
    }

    if (internal.motionManager?.groups) {
      internal.motionManager.groups.idle = "__disabled_idle__";
    }

    if (typeof internal.updateFocus === "function") {
      internal.updateFocus = () => {};
    }
    if (typeof internal.updateNaturalMovements === "function") {
      internal.updateNaturalMovements = () => {};
    }
  }

  private unfreezeInternalAnimation(internal: any) {
    if (!this.freezePatch) return;

    if (internal.motionManager?.groups && this.freezePatch.idleGroup !== undefined) {
      internal.motionManager.groups.idle = this.freezePatch.idleGroup;
    }

    if (this.freezePatch.updateFocus) {
      internal.updateFocus = this.freezePatch.updateFocus;
    }
    if (this.freezePatch.updateNaturalMovements) {
      internal.updateNaturalMovements = this.freezePatch.updateNaturalMovements;
    }

    this.freezePatch = null;
  }

  private layout() {
    if (!this.app || !this.model) return;

    const w = this.app.renderer.width;
    const h = this.app.renderer.height;

    this.model.anchor.set(this.transform.anchorX, this.transform.anchorY);

    this.model.x = w / 2 + this.transform.offsetX;
    this.model.y = h / 2 + this.transform.offsetY;

    this.model.rotation = (this.transform.rotationDeg * Math.PI) / 180;

    let baseScale = 1;

    if (this.transform.fit !== "none") {
      const size = this.naturalSize;
      if (size && size.w > 0 && size.h > 0) {
        const sx = w / size.w;
        const sy = h / size.h;
        baseScale = this.transform.fit === "cover" ? Math.max(sx, sy) : Math.min(sx, sy);
      } else {
        // fallback
        const sx = w / 800;
        const sy = h / 900;
        baseScale = this.transform.fit === "cover" ? Math.max(sx, sy) : Math.min(sx, sy);
      }
      baseScale = Math.max(0.001, baseScale);
    }

    const finalScale = baseScale * this.transform.scale;
    this.model.scale.set(finalScale);
  }

  private measureNaturalSize(model: Live2DModel): { w: number; h: number } {
    const prevScaleX = model.scale.x;
    const prevScaleY = model.scale.y;
    const prevRot = model.rotation;
    const prevAnchorX = model.anchor.x;
    const prevAnchorY = model.anchor.y;

    model.scale.set(1);
    model.rotation = 0;
    model.anchor.set(0, 0);

    const b = model.getLocalBounds();

    model.anchor.set(prevAnchorX, prevAnchorY);
    model.rotation = prevRot;
    model.scale.set(prevScaleX, prevScaleY);

    return { w: Math.max(0, b.width), h: Math.max(0, b.height) };
  }

  destroy() {
    this.detachLipSyncHook();

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.app) {
      this.app.destroy(true);
      this.app = null;
    }

    this.model = null;
    this.naturalSize = null;
    this.initPromise = null;
    this.freezePatch = null;
  }
}
