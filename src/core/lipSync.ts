export interface LipSyncOptions {
  gain?: number;         // amplifica apertura
  smoothing?: number;    // 0..1, más alto = más suave
  fftSize?: number;      // potencia de 2, ej 1024
  floor?: number;        // umbral mínimo (ruido)
  ceiling?: number;      // clamp máximo
  mode?: "rms" | "peak";
}

export interface LipSyncInput {
  media?: HTMLMediaElement;
  node?: AudioNode;
  stream?: MediaStream;
  audioContext?: AudioContext; // opcional si ya existe
}

export class LipSyncEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source:
    | MediaElementAudioSourceNode
    | MediaStreamAudioSourceNode
    | null = null;

  private data: Uint8Array | null = null;
  private raf = 0;

  private value = 0;

  private opts: Required<LipSyncOptions> = {
    gain: 1.0,
    smoothing: 0.8,
    fftSize: 1024,
    floor: 0.02,
    ceiling: 1.0,
    mode: "rms",
  };

  start(input: LipSyncInput, opts?: LipSyncOptions) {
    this.stop();

    this.opts = { ...this.opts, ...(opts ?? {}) };

    const ctx = input.audioContext ?? new AudioContext();
    this.ctx = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = this.opts.fftSize;
    this.analyser = analyser;

    // Conectar fuente
    if (input.node) {
      input.node.connect(analyser);
      // no conectamos a destination: el audio ya se reproduce por donde toque
      this.source = null;
    } else if (input.media) {
      this.source = ctx.createMediaElementSource(input.media);
      this.source.connect(analyser);
      // importante: para que el audio siga sonando, connect a destination
      analyser.connect(ctx.destination);
    } else if (input.stream) {
      this.source = ctx.createMediaStreamSource(input.stream);
      this.source.connect(analyser);
      // stream no necesariamente va a destination
    } else {
      throw new Error("LipSyncEngine.start: provide media, node, or stream.");
    }

    this.data = new Uint8Array(analyser.frequencyBinCount);

    // Autoplay policy: si está suspendido, intentamos resume (debe ser tras gesto del usuario)
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
    } catch {}
    try {
      this.analyser?.disconnect();
    } catch {}

    this.source = null;
    this.analyser = null;
    this.data = null;

    // Si creamos nuestro propio context, podríamos cerrarlo; pero si te pasan uno externo, no.
    // Para mantenerlo simple: no cerramos automáticamente.
    this.ctx = null;

    this.value = 0;
  }

  /** Valor 0..1 listo para mouth open */
  getValue(): number {
    return this.value;
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
      // peak absoluto
      let peak = 0;
      for (let i = 0; i < this.data.length; i++) {
        const x = (this.data[i] - 128) / 128;
        const ax = Math.abs(x);
        if (ax > peak) peak = ax;
      }
      v = peak;
    } else {
      // RMS
      let sum = 0;
      for (let i = 0; i < this.data.length; i++) {
        const x = (this.data[i] - 128) / 128;
        sum += x * x;
      }
      v = Math.sqrt(sum / this.data.length);
    }

    // normalizar + piso + ganancia
    v = (v - this.opts.floor) / Math.max(1e-6, (this.opts.ceiling - this.opts.floor));
    v = Math.max(0, Math.min(1, v));
    v *= this.opts.gain;
    v = Math.max(0, Math.min(1, v));

    // suavizado (EMA)
    const a = this.opts.smoothing;
    this.value = a * this.value + (1 - a) * v;
  };
}