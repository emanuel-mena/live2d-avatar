import { DEFAULT_MANIFEST, loadManifest } from "./core/manifest";
import { AvatarStateMachine } from "./core/stateMachine";
import type { SMEvent } from "./core/stateMachine";
import { Live2DAdapter } from "./core/live2dAdapter";
import type { FitMode } from "./core/live2dAdapter";
import { MotionRouter } from "./core/motionRouter";
import { LipSyncEngine } from "./core/lipSync";

export class Live2DAvatarElement extends HTMLElement {
  static observedAttributes = [
    "model-src",
    "motions-src",
    "state",
    "animations", // ✅ nuevo
    "scale",
    "x",
    "y",
    "rotation",
    "anchor-x",
    "anchor-y",
    "fit",
  ];

  private shadowRootRef: ShadowRoot;
  private canvas!: HTMLCanvasElement;

  private sm: AvatarStateMachine;
  private live2d: Live2DAdapter;
  private motionRouter: MotionRouter;

  private isBootstrapped = false;
  private pendingState: string | null = null;

  private rendererReady: Promise<void> | null = null;

  // Lipsync (aunque esté implementado, lo apagamos si animations=off)
  private lipSync = new LipSyncEngine();
  private lipSyncParamId = "PARAM_MOUTH_OPEN_Y";
  private lipSyncRaf = 0;

  constructor() {
    super();
    this.shadowRootRef = this.attachShadow({ mode: "open" });

    this.sm = new AvatarStateMachine((ev) => this.onSMEvent(ev));
    this.live2d = new Live2DAdapter();
    this.motionRouter = new MotionRouter(DEFAULT_MANIFEST);
  }

  connectedCallback() {
    this.render();

    // listeners lipsync por eventos
    this.addEventListener("avatar-audio", this.onAvatarAudio as EventListener);
    this.addEventListener("avatar-audio-stop", this.onAvatarAudioStop as EventListener);

    this.rendererReady = this.initRenderer().catch((e) => {
      this.dispatchError("Renderer init failed", e);
    }) as any;

    this.bootstrap().catch((e) => this.dispatchError("Bootstrap failed", e));
  }

  disconnectedCallback() {
    this.removeEventListener("avatar-audio", this.onAvatarAudio as EventListener);
    this.removeEventListener("avatar-audio-stop", this.onAvatarAudioStop as EventListener);

    this.stopLipSync();

    this.live2d.destroy();
    this.sm.dispose();
  }

  attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null) {
    if (oldVal === newVal) return;

    if (name === "motions-src") {
      this.bootstrap().catch((e) => this.dispatchError("Failed to load motions manifest", e));
      return;
    }

    if (name === "animations") {
      // Si se apagan, detenemos lipsync inmediatamente
      if (!this.animationsEnabled()) this.stopLipSync();
      return;
    }

    if (name === "state" && newVal) {
      if (!this.isBootstrapped) {
        this.pendingState = newVal;
        return;
      }
      this.sm.setState(newVal, "attribute");
      return;
    }

    if (name === "model-src" && newVal) {
      (this.rendererReady ?? Promise.resolve())
        .then(() => this.live2d.loadModel(newVal))
        .then(() => {
          this.dispatchEvent(new CustomEvent("model-loaded", { detail: { modelSrc: newVal } }));
          this.applyTransformFromAttrs();
        })
        .catch((e) => this.dispatchError("Failed to load model", e));
      return;
    }

    if (
      name === "scale" ||
      name === "x" ||
      name === "y" ||
      name === "rotation" ||
      name === "anchor-x" ||
      name === "anchor-y" ||
      name === "fit"
    ) {
      this.applyTransformFromAttrs();
      return;
    }
  }

  private animationsEnabled(): boolean {
    const v = (this.getAttribute("animations") ?? "on").toLowerCase().trim();
    // soporta: off / false / 0
    if (v === "off" || v === "false" || v === "0") return false;
    return true;
  }

  private async initRenderer() {
    await this.live2d.init(this.canvas);
    this.live2d.attachAutoResize(this, this.canvas);

    const modelSrc = this.getAttribute("model-src");
    if (modelSrc) {
      await this.live2d.loadModel(modelSrc);
      this.dispatchEvent(new CustomEvent("model-loaded", { detail: { modelSrc } }));
    }

    this.applyTransformFromAttrs();
  }

  private async bootstrap() {
    const motionsSrc = this.getAttribute("motions-src");

    if (motionsSrc) {
      const manifest = await loadManifest(motionsSrc);
      this.sm.setManifest(manifest);
      this.motionRouter.setManifest(manifest);
    } else {
      this.sm.setManifest(DEFAULT_MANIFEST);
      this.motionRouter.setManifest(DEFAULT_MANIFEST);
    }

    this.isBootstrapped = true;

    const initial = this.pendingState ?? (this.getAttribute("state") ?? "idle");
    this.pendingState = null;

    this.sm.setState(initial, "api");
  }

  private applyTransformFromAttrs() {
    const scale = this.getNumberAttr("scale", 1);
    const x = this.getNumberAttr("x", 0);
    const y = this.getNumberAttr("y", 0);
    const rotationDeg = this.getNumberAttr("rotation", 0);
    const anchorX = this.clamp01(this.getNumberAttr("anchor-x", 0.5));
    const anchorY = this.clamp01(this.getNumberAttr("anchor-y", 0.5));

    const fitAttr = (this.getAttribute("fit") ?? "contain").toLowerCase();
    const fit: FitMode = fitAttr === "cover" ? "cover" : fitAttr === "none" ? "none" : "contain";

    this.live2d.setTransform({
      scale,
      offsetX: x,
      offsetY: y,
      rotationDeg,
      anchorX,
      anchorY,
      fit,
    });
  }

  private getNumberAttr(name: string, fallback: number) {
    const raw = this.getAttribute(name);
    if (raw == null || raw.trim() === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  private clamp01(v: number) {
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
  }

  private onSMEvent(ev: SMEvent) {
    switch (ev.type) {
      case "ready":
        this.dispatchEvent(new CustomEvent("avatar-ready"));
        break;

      case "state-request":
        this.dispatchEvent(new CustomEvent("state-request", { detail: ev }));
        break;

      case "state-change":
        this.dispatchEvent(new CustomEvent("state-change", { detail: ev }));
        break;

      case "motion-start":
        this.dispatchEvent(new CustomEvent("motion-start", { detail: ev }));

        // ✅ Si animations está OFF: NO reproducir motions
        if (!this.animationsEnabled()) break;

        try {
          const target = this.motionRouter.resolve(ev.state);
          if (target) this.live2d.playMotion(target.group, target.index, target.fadeMs);
        } catch {
          // no-op
        }
        break;

      case "motion-end":
        this.dispatchEvent(new CustomEvent("motion-end", { detail: ev }));
        break;

      case "blocked":
        this.dispatchEvent(new CustomEvent("state-blocked", { detail: ev }));
        break;

      case "error":
        this.dispatchError(ev.message, ev.error);
        break;
    }
  }

  // --- Lipsync events (disabled when animations=off) ---

  private onAvatarAudio = (e: Event) => {
    if (!this.animationsEnabled()) return;

    const ev = e as CustomEvent<any>;
    const detail = ev.detail ?? {};

    try {
      this.lipSync.start(
        { media: detail.media, node: detail.node, stream: detail.stream, audioContext: detail.audioContext },
        {
          gain: detail.gain,
          smoothing: detail.smoothing,
          mode: detail.mode,
          floor: detail.floor,
          ceiling: detail.ceiling,
        }
      );
      this.startLipSyncLoop();
    } catch (err) {
      this.dispatchError("Failed to start lipsync", err);
    }
  };

  private onAvatarAudioStop = () => {
    this.stopLipSync();
  };

  private startLipSyncLoop() {
    cancelAnimationFrame(this.lipSyncRaf);

    const tick = () => {
      this.lipSyncRaf = requestAnimationFrame(tick);
      const v = this.lipSync.getValue();
      this.live2d.setParameter(this.lipSyncParamId, v);
    };

    tick();
  }

  private stopLipSync() {
    cancelAnimationFrame(this.lipSyncRaf);
    this.lipSyncRaf = 0;
    this.lipSync.stop();
    this.live2d.setParameter(this.lipSyncParamId, 0);
  }

  private dispatchError(message: string, error?: unknown) {
    this.dispatchEvent(new CustomEvent("error", { detail: { message, error } }));
    console.error(`[live2d-avatar] ${message}`, error);
  }

  private render() {
    this.shadowRootRef.innerHTML = `
      <style>
        :host{ display:inline-block; width:320px; height:420px; }
        canvas{ width:100%; height:100%; display:block; background:#111; }
      </style>
      <canvas></canvas>
    `;
    this.canvas = this.shadowRootRef.querySelector("canvas")!;
  }
}