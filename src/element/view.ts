export function renderAvatarCanvas(shadowRootRef: ShadowRoot): HTMLCanvasElement {
  shadowRootRef.innerHTML = `
    <style>
      :host{ display:inline-block; width:320px; height:420px; }
      canvas{ width:100%; height:100%; display:block; background:#111; }
    </style>
    <canvas></canvas>
  `;

  const canvas = shadowRootRef.querySelector("canvas");
  if (!canvas) {
    throw new Error("Canvas element was not rendered.");
  }
  return canvas;
}
