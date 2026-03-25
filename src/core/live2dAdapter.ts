import initInochi, { InochiViewer } from "../pkg/inochi_viewer.js";

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

interface ParamMeta {
  y: number;
}

export class Live2DAdapter {
  private viewer: InochiViewer | null = null;
  private canvas: HTMLCanvasElement | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private initPromise: Promise<void> | null = null;
  private renderLoopId: number | null = null;

  private builtInAnimationEnabled = false;
  private lipSyncParamId = "PARAM_MOUTH_OPEN_Y";
  private lipSyncValue = 0;

  private transform: ModelTransform = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotationDeg: 0,
    anchorX: 0.5,
    anchorY: 0.5,
    fit: "contain",
  };

  private paramMeta = new Map<string, ParamMeta>();

  init(canvas: HTMLCanvasElement): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.canvas = canvas;
      await initInochi(new URL("../pkg/inochi_viewer_bg.wasm", import.meta.url));
    })();

    return this.initPromise;
  }

  private async ensureInit() {
    if (!this.initPromise || !this.canvas) {
      throw new Error("Live2DAdapter not initialized. Call init(canvas) first.");
    }

    await this.initPromise;
  }

  async loadModel(modelUrl: string) {
    await this.ensureInit();

    const response = await fetch(modelUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch model: ${modelUrl} (${response.status})`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());

    this.viewer?.free();
    this.viewer = new InochiViewer(this.canvas!.id, bytes);

    this.paramMeta.clear();
    this.readModelParams();

    this.applyTransform();
    this.applyLipSyncValue();
    this.ensureRenderLoop();
  }

  setBuiltInAnimationEnabled(enabled: boolean) {
    this.builtInAnimationEnabled = enabled;
  }

  setLipSync(paramId: string, value: number) {
    this.lipSyncParamId = paramId.trim() || "PARAM_MOUTH_OPEN_Y";
    this.lipSyncValue = value;
    this.applyLipSyncValue();
  }

  setTransform(partial: Partial<ModelTransform>) {
    this.transform = { ...this.transform, ...partial };
    this.applyTransform();
  }

  setParameter(id: string, value: number) {
    const v = Number.isFinite(value) ? value : 0;
    const current = this.paramMeta.get(id);
    const y = current?.y ?? 0;

    this.viewer?.set_param(id, v, y);
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

  playMotion(_group: string, _index: number, _fadeMs: number) {
    if (!this.builtInAnimationEnabled) return;
    // Inochi viewer bridge currently exposes parameter/camera controls only.
  }

  destroy() {
    if (this.renderLoopId != null) {
      cancelAnimationFrame(this.renderLoopId);
      this.renderLoopId = null;
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.viewer?.free();
    this.viewer = null;
    this.canvas = null;

    this.paramMeta.clear();
    this.initPromise = null;
  }

  private readModelParams() {
    if (!this.viewer) return;

    try {
      const params = JSON.parse(this.viewer.get_params_json()) as Array<{
        name: string;
        def_y: number;
        is_vec2: boolean;
      }>;

      for (const p of params) {
        this.paramMeta.set(p.name, { y: p.def_y ?? 0 });
      }
    } catch {
      this.paramMeta.clear();
    }
  }

  private ensureRenderLoop() {
    if (this.renderLoopId != null) {
      cancelAnimationFrame(this.renderLoopId);
      this.renderLoopId = null;
    }

    const frame = (ts: number) => {
      this.viewer?.render(ts);
      this.renderLoopId = requestAnimationFrame(frame);
    };

    this.renderLoopId = requestAnimationFrame(frame);
  }

  private resizeToHost(host: HTMLElement, canvas: HTMLCanvasElement) {
    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width || 320));
    const h = Math.max(1, Math.floor(rect.height || 420));

    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = w;
    canvas.height = h;

    this.viewer?.resize(w, h);
  }

  private applyLipSyncValue() {
    const value = Math.max(0, Math.min(1, this.lipSyncValue));
    this.setParameter(this.lipSyncParamId, value);
  }

  private applyTransform() {
    if (!this.viewer) return;

    this.viewer.set_camera(
      this.transform.offsetX,
      this.transform.offsetY,
      Math.max(0.001, this.transform.scale),
      (this.transform.rotationDeg * Math.PI) / 180
    );
  }
}
