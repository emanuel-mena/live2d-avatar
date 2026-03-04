import { DEFAULT_MANIFEST, loadManifest } from "./core/manifest";
import { AvatarStateMachine } from "./core/stateMachine";
import type { SMEvent } from "./core/stateMachine";
import { Live2DAdapter } from "./core/live2dAdapter";
import { MotionRouter } from "./core/motionRouter";
import { loadAnimationManifest } from "./core/customAnimation";
import { OBSERVED_ATTRIBUTES } from "./element/constants";
import {
  readAnimationMode,
  readMouthParameterId,
  readTransformFromAttrs,
  type AnimationMode,
} from "./element/attributes";
import { renderAvatarCanvas } from "./element/view";
import { AvatarLipSyncController, type AvatarAudioEventDetail } from "./element/lipSyncController";
import { AvatarCustomAnimationController } from "./element/customAnimationController";

const TRANSFORM_ATTRIBUTES = new Set(["scale", "x", "y", "rotation", "anchor-x", "anchor-y", "fit"]);

export class Live2DAvatarElement extends HTMLElement {
  static observedAttributes = OBSERVED_ATTRIBUTES;

  private readonly shadowRootRef: ShadowRoot;
  private canvas!: HTMLCanvasElement;

  private readonly sm: AvatarStateMachine;
  private readonly live2d: Live2DAdapter;
  private readonly motionRouter: MotionRouter;

  private readonly customAnimation: AvatarCustomAnimationController;
  private readonly lipSync: AvatarLipSyncController;

  private isBootstrapped = false;
  private pendingState: string | null = null;
  private rendererReady: Promise<void> | null = null;

  private animationMode: AnimationMode = "custom";
  private mouthParamId = "ParamMouthOpenY";
  private lipSyncValue = 0;

  constructor() {
    super();
    this.shadowRootRef = this.attachShadow({ mode: "open" });

    this.sm = new AvatarStateMachine((ev) => this.onSMEvent(ev));
    this.live2d = new Live2DAdapter();
    this.motionRouter = new MotionRouter(DEFAULT_MANIFEST);

    this.customAnimation = new AvatarCustomAnimationController({
      onFrame: (values) => this.live2d.setParameters(values),
    });

    this.lipSync = new AvatarLipSyncController({
      onValue: (value) => {
        this.lipSyncValue = value;
        this.live2d.setLipSync(this.mouthParamId, value);
      },
      onError: (message, error) => this.dispatchError(message, error),
    });
  }

  connectedCallback() {
    this.canvas = renderAvatarCanvas(this.shadowRootRef);

    this.animationMode = readAnimationMode(this);
    this.mouthParamId = readMouthParameterId(this);
    this.live2d.setLipSync(this.mouthParamId, this.lipSyncValue);
    this.live2d.setBuiltInAnimationEnabled(this.animationMode === "model");
    this.customAnimation.setMode(this.animationMode);
    this.customAnimation.ensureRunning();

    this.addEventListener("avatar-audio", this.onAvatarAudio as EventListener);
    this.addEventListener("avatar-audio-stop", this.onAvatarAudioStop as EventListener);

    this.rendererReady = this.initRenderer().catch((error) => {
      this.dispatchError("Renderer init failed", error);
    }) as Promise<void>;

    this.bootstrap().catch((error) => this.dispatchError("Bootstrap failed", error));
    this.bootstrapAnimationManifest().catch((error) =>
      this.dispatchError("Failed to load animation manifest", error)
    );
  }

  disconnectedCallback() {
    this.removeEventListener("avatar-audio", this.onAvatarAudio as EventListener);
    this.removeEventListener("avatar-audio-stop", this.onAvatarAudioStop as EventListener);

    this.lipSync.destroy();
    this.customAnimation.destroy();

    this.live2d.destroy();
    this.sm.dispose();
  }

  attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null) {
    if (oldVal === newVal) return;

    if (name === "motions-src") {
      this.bootstrap().catch((error) => this.dispatchError("Failed to load motions manifest", error));
      return;
    }

    if (name === "animations-src") {
      this.bootstrapAnimationManifest().catch((error) =>
        this.dispatchError("Failed to load animation manifest", error)
      );
      return;
    }

    if (name === "animation-mode" || name === "animations") {
      this.animationMode = readAnimationMode(this);
      this.live2d.setBuiltInAnimationEnabled(this.animationMode === "model");
      this.customAnimation.setMode(this.animationMode);
      return;
    }

    if (name === "mouth-param-id") {
      this.mouthParamId = readMouthParameterId(this);
      this.live2d.setLipSync(this.mouthParamId, this.lipSyncValue);
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
        .catch((error) => this.dispatchError("Failed to load model", error));
      return;
    }

    if (TRANSFORM_ATTRIBUTES.has(name)) {
      this.applyTransformFromAttrs();
    }
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

  private async bootstrapAnimationManifest() {
    const animationsSrc = this.getAttribute("animations-src");

    if (!animationsSrc) {
      this.customAnimation.resetManifest();
      return;
    }

    const manifest = await loadAnimationManifest(animationsSrc);
    this.customAnimation.setManifest(manifest);
  }

  private applyTransformFromAttrs() {
    this.live2d.setTransform(readTransformFromAttrs(this));
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
        this.customAnimation.setState(ev.to);
        break;

      case "motion-start": {
        this.dispatchEvent(new CustomEvent("motion-start", { detail: ev }));
        this.customAnimation.setState(ev.state);

        if (this.animationMode !== "model") {
          break;
        }

        try {
          const target = this.motionRouter.resolve(ev.state);
          if (target) this.live2d.playMotion(target.group, target.index, target.fadeMs);
        } catch {
          // no-op
        }
        break;
      }

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

  private onAvatarAudio = (e: Event) => {
    const ev = e as CustomEvent<AvatarAudioEventDetail>;
    const detail = ev.detail ?? {};

    if (typeof detail.paramId === "string" && detail.paramId.trim()) {
      this.mouthParamId = detail.paramId.trim();
      this.live2d.setLipSync(this.mouthParamId, this.lipSyncValue);
    }

    this.lipSync.start(detail);
  };

  private onAvatarAudioStop = () => {
    this.lipSync.stop();
  };

  private dispatchError(message: string, error?: unknown) {
    this.dispatchEvent(new CustomEvent("error", { detail: { message, error } }));
    console.error(`[live2d-avatar] ${message}`, error);
  }
}
