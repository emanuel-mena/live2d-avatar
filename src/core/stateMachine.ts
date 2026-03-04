import { DEFAULTS, normalizeMotion } from "./manifest";
import type { AvatarState, MotionsManifest, Rule, StateConfig } from "./manifest";

export interface MotionPlayRequest {
  state: AvatarState;
  motionId: string;
  blendMs: number;
  loop: boolean;
  priority: number;
}

export type SMEvent =
  | { type: "ready" }
  | { type: "state-change"; from: AvatarState | null; to: AvatarState }
  | { type: "motion-start"; state: AvatarState; motionId: string }
  | { type: "motion-end"; state: AvatarState; motionId: string }
  | { type: "blocked"; to: AvatarState; why: string }
  | { type: "error"; message: string; error?: unknown }
  | { type: "state-request"; from: AvatarState | null; to: AvatarState; reason: "attribute" | "api" | "auto" };

export type EventSink = (ev: SMEvent) => void;

export class AvatarStateMachine {
  private emit: EventSink;

  private manifest: MotionsManifest | null = null;
  private currentState: AvatarState | null = null;

  private lastStateAt = new Map<AvatarState, number>();
  private lastTransitionAt = new Map<string, number>();

  private playing: { state: AvatarState; motionId: string; timer?: number } | null = null;

  // ✅ NO parameter properties (compatible con erasableSyntaxOnly)
  constructor(emit: EventSink) {
    this.emit = emit;
  }

  setManifest(manifest: MotionsManifest) {
    this.manifest = manifest;
    this.emit({ type: "ready" });
  }

  setState(to: AvatarState, reason: "attribute" | "api" | "auto" = "api") {
    if (!this.manifest) {
      this.emit({ type: "error", message: "Manifest not loaded." });
      return;
    }

    const from = this.currentState;
    this.emit({ type: "state-request", from, to, reason });

    const decision = this.canTransition(from, to);
    if (!decision.ok) {
      this.emit({ type: "blocked", to, why: decision.why ?? "Blocked" });
      return;
    }

    const req = this.buildPlayRequest(from, to);
    this.apply(req, from);
  }

  private canTransition(from: AvatarState | null, to: AvatarState): { ok: boolean; why?: string } {
    const m = this.manifest!;
    const now = Date.now();

    const toCfg = m.states[to];
    if (!toCfg) return { ok: false, why: `Unknown state "${to}".` };

    const stateCooldown = toCfg.cooldownMs ?? DEFAULTS.cooldownMs;
    const lastAt = this.lastStateAt.get(to) ?? 0;
    if (stateCooldown > 0 && now - lastAt < stateCooldown) {
      return { ok: false, why: `State "${to}" cooldown (${stateCooldown}ms) active.` };
    }

    if (from) {
      const fromCfg = m.states[from];
      const fromPr = fromCfg?.priority ?? DEFAULTS.priority;
      const toPr = toCfg.priority ?? DEFAULTS.priority;
      if (fromPr > toPr) {
        return { ok: false, why: `Blocked by higher priority state "${from}".` };
      }
    }

    const rule = this.matchRule(from, to);
    const key = `${from ?? "null"}->${to}`;
    const transCooldown = rule?.cooldownMs ?? 0;

    if (transCooldown > 0) {
      const lastT = this.lastTransitionAt.get(key) ?? 0;
      if (now - lastT < transCooldown) {
        return { ok: false, why: `Transition cooldown (${transCooldown}ms) active.` };
      }
    }

    return { ok: true };
  }

  private matchRule(from: AvatarState | null, to: AvatarState): Rule | undefined {
    const rules = this.manifest!.rules ?? [];
    return rules.find((r) => (r.from === "*" || r.from === (from ?? "*")) && r.to === to);
  }

  private buildPlayRequest(from: AvatarState | null, to: AvatarState): MotionPlayRequest {
    const m = this.manifest!;
    const toCfg = m.states[to] as StateConfig;

    const rule = this.matchRule(from, to);
    const blendMs = rule?.blendMs ?? toCfg.blendMs ?? DEFAULTS.blendMs;

    const motions = toCfg.motions.map(normalizeMotion);
    const pick = motions[Math.floor(Math.random() * motions.length)];

    return {
      state: to,
      motionId: pick.id,
      blendMs,
      loop: Boolean(toCfg.loop),
      priority: toCfg.priority ?? DEFAULTS.priority,
    };
  }

  private apply(req: MotionPlayRequest, from: AvatarState | null) {
    const now = Date.now();
    this.stopCurrent();

    const to = req.state;
    this.currentState = to;
    this.lastStateAt.set(to, now);
    this.lastTransitionAt.set(`${from ?? "null"}->${to}`, now);

    this.emit({ type: "state-change", from, to });
    this.emit({ type: "motion-start", state: to, motionId: req.motionId });

    const duration = this.manifest!.states[to]?.demoDurationMs ?? DEFAULTS.demoDurationMs;

    const timer = window.setTimeout(() => {
      this.emit({ type: "motion-end", state: to, motionId: req.motionId });

      const cfg = this.manifest!.states[to];
      if (cfg?.loop && this.currentState === to) {
        this.setState(to, "auto");
      }
    }, duration);

    this.playing = { state: to, motionId: req.motionId, timer };
  }

  private stopCurrent() {
    if (!this.playing) return;
    if (this.playing.timer) window.clearTimeout(this.playing.timer);
    this.playing = null;
  }

  dispose() {
    this.stopCurrent();
    this.manifest = null;
    this.currentState = null;
    this.lastStateAt.clear();
    this.lastTransitionAt.clear();
  }
}