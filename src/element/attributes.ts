import type { FitMode, ModelTransform } from "../core/live2dAdapter";

export type AnimationMode = "custom" | "model" | "off";

function getNumberAttr(el: HTMLElement, name: string, fallback: number): number {
  const raw = el.getAttribute(name);
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export function readTransformFromAttrs(el: HTMLElement): ModelTransform {
  const scale = getNumberAttr(el, "scale", 1);
  const offsetX = getNumberAttr(el, "x", 0);
  const offsetY = getNumberAttr(el, "y", 0);
  const rotationDeg = getNumberAttr(el, "rotation", 0);
  const anchorX = clamp01(getNumberAttr(el, "anchor-x", 0.5));
  const anchorY = clamp01(getNumberAttr(el, "anchor-y", 0.5));

  const fitAttr = (el.getAttribute("fit") ?? "contain").toLowerCase();
  const fit: FitMode = fitAttr === "cover" ? "cover" : fitAttr === "none" ? "none" : "contain";

  return {
    scale,
    offsetX,
    offsetY,
    rotationDeg,
    anchorX,
    anchorY,
    fit,
  };
}

function normalizeLegacyAnimationsAttr(value: string | null): AnimationMode {
  const v = (value ?? "").toLowerCase().trim();

  if (v === "off" || v === "false" || v === "0") return "off";
  if (v === "model" || v === "native") return "model";
  if (v === "custom") return "custom";

  // Compat + nuevo default: on/true/1 usan animacion custom por parametros.
  return "custom";
}

export function readAnimationMode(el: HTMLElement): AnimationMode {
  const explicit = (el.getAttribute("animation-mode") ?? "").toLowerCase().trim();
  if (explicit === "off" || explicit === "model" || explicit === "custom") {
    return explicit;
  }

  return normalizeLegacyAnimationsAttr(el.getAttribute("animations"));
}

export function readMouthParameterId(el: HTMLElement): string {
  const explicit = el.getAttribute("mouth-param-id")?.trim();
  if (explicit) return explicit;

  return "ParamMouthOpenY";
}
