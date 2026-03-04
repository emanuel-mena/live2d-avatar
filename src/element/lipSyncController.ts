import { LipSyncEngine } from "../core/lipSync";
import type { LipSyncInput, LipSyncOptions } from "../core/lipSync";

export interface AvatarAudioEventDetail extends LipSyncInput, LipSyncOptions {
  paramId?: string;
}

interface AvatarLipSyncControllerHooks {
  onValue: (value: number) => void;
  onError: (message: string, error?: unknown) => void;
}

export class AvatarLipSyncController {
  private readonly hooks: AvatarLipSyncControllerHooks;
  private readonly engine = new LipSyncEngine();

  private raf = 0;

  constructor(hooks: AvatarLipSyncControllerHooks) {
    this.hooks = hooks;
  }

  start(detail: AvatarAudioEventDetail) {
    try {
      this.engine.start(
        {
          media: detail.media,
          node: detail.node,
          stream: detail.stream,
          audioContext: detail.audioContext,
        },
        {
          gain: detail.gain,
          smoothing: detail.smoothing,
          floor: detail.floor,
          ceiling: detail.ceiling,
          mode: detail.mode,
        }
      );

      this.startLoop();
    } catch (error) {
      this.hooks.onError("Failed to start lipsync", error);
    }
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;

    this.engine.stop();
    this.hooks.onValue(0);
  }

  destroy() {
    this.stop();
  }

  private startLoop() {
    cancelAnimationFrame(this.raf);

    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      this.hooks.onValue(this.engine.getValue());
    };

    tick();
  }
}
