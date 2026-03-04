export interface LipSyncOptions {
  gain?: number;
  smoothing?: number;
  fftSize?: number;
  floor?: number;
  ceiling?: number;
  mode?: "rms" | "peak";
}

export interface LipSyncInput {
  media?: HTMLMediaElement;
  node?: AudioNode;
  stream?: MediaStream;
  audioContext?: AudioContext;
}

interface MediaSourceBinding {
  ctx: AudioContext;
  node: MediaElementAudioSourceNode;
}

export class LipSyncEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: AudioNode | null = null;

  private mediaSources = new WeakMap<HTMLMediaElement, MediaSourceBinding>();

  private data: Uint8Array<ArrayBuffer> | null = null;
  private raf = 0;

  private value = 0;

  private opts: Required<LipSyncOptions> = {
    gain: 1,
    smoothing: 0.8,
    fftSize: 1024,
    floor: 0.005,
    ceiling: 0.25,
    mode: "rms",
  };

  start(input: LipSyncInput, opts?: LipSyncOptions) {
    this.stop();

    this.opts = { ...this.opts, ...(opts ?? {}) };

    const ctx = this.resolveContext(input);
    this.ctx = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = this.opts.fftSize;
    analyser.smoothingTimeConstant = Math.max(0, Math.min(0.95, this.opts.smoothing));
    this.analyser = analyser;

    if (input.node) {
      input.node.connect(analyser);
      this.source = input.node;
    } else if (input.media) {
      const sourceNode = this.resolveMediaSourceNode(input.media, ctx);
      sourceNode.connect(analyser);
      analyser.connect(ctx.destination);
      this.source = sourceNode;
    } else if (input.stream) {
      const sourceNode = ctx.createMediaStreamSource(input.stream);
      sourceNode.connect(analyser);
      this.source = sourceNode;
    } else {
      throw new Error("LipSyncEngine.start: provide media, node, or stream.");
    }

    this.data = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    this.loop();
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;

    try {
      this.source?.disconnect();
    } catch {
      // no-op
    }

    try {
      this.analyser?.disconnect();
    } catch {
      // no-op
    }

    this.source = null;
    this.analyser = null;
    this.data = null;

    this.value = 0;
  }

  getValue(): number {
    return this.value;
  }

  private resolveContext(input: LipSyncInput): AudioContext {
    if (input.audioContext) return input.audioContext;

    if (input.media) {
      const bound = this.mediaSources.get(input.media);
      if (bound) return bound.ctx;
    }

    if (this.ctx) return this.ctx;
    return new AudioContext();
  }

  private resolveMediaSourceNode(media: HTMLMediaElement, ctx: AudioContext): MediaElementAudioSourceNode {
    const bound = this.mediaSources.get(media);
    if (bound) {
      if (bound.ctx !== ctx) {
        throw new Error("LipSyncEngine: media element is already bound to a different AudioContext.");
      }
      return bound.node;
    }

    const node = ctx.createMediaElementSource(media);
    this.mediaSources.set(media, { ctx, node });
    return node;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.compute();
  };

  private compute() {
    if (!this.analyser || !this.data) return;

    this.analyser.getByteTimeDomainData(this.data);

    let v = 0;

    if (this.opts.mode === "peak") {
      let peak = 0;
      for (let i = 0; i < this.data.length; i++) {
        const x = (this.data[i] - 128) / 128;
        const absX = Math.abs(x);
        if (absX > peak) peak = absX;
      }
      v = peak;
    } else {
      let sum = 0;
      for (let i = 0; i < this.data.length; i++) {
        const x = (this.data[i] - 128) / 128;
        sum += x * x;
      }
      v = Math.sqrt(sum / this.data.length);
    }

    v = (v - this.opts.floor) / Math.max(1e-6, this.opts.ceiling - this.opts.floor);
    v = Math.max(0, Math.min(1, v));
    v *= this.opts.gain;
    v = Math.max(0, Math.min(1, v));

    const smoothing = this.opts.smoothing;
    this.value = smoothing * this.value + (1 - smoothing) * v;
  }
}
