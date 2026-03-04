import { Live2DAvatarElement } from "./element";

const TAG = "live2d-avatar";

if (!customElements.get(TAG)) {
  customElements.define(TAG, Live2DAvatarElement);
}

const avatar = document.getElementById("avatar") as HTMLElement;
const audio = document.getElementById("audio") as HTMLAudioElement;

const playBtn = document.getElementById("play") as HTMLButtonElement;
const stopBtn = document.getElementById("stop") as HTMLButtonElement;

const idleBtn = document.getElementById("idle") as HTMLButtonElement;
const speakingBtn = document.getElementById("speaking") as HTMLButtonElement;
const surprisedBtn = document.getElementById("surprised") as HTMLButtonElement;

const fileInput = document.getElementById("file") as HTMLInputElement;

const gainEl = document.getElementById("gain") as HTMLInputElement;
const smoothEl = document.getElementById("smooth") as HTMLInputElement;

function lipsyncStart() {
  const gain = Number(gainEl.value);
  const smoothing = Number(smoothEl.value);

  avatar.dispatchEvent(
    new CustomEvent("avatar-audio", {
      detail: {
        media: audio,
        gain,
        smoothing,
        mode: "rms",
        floor: 0.02,
        ceiling: 1.0,
      },
    })
  );
}

function lipsyncStop() {
  avatar.dispatchEvent(new CustomEvent("avatar-audio-stop"));
}

playBtn.addEventListener("click", async () => {
  // Autoplay policy: must be after user gesture
  await audio.play();

  // Arranca lipsync con el audio actual
  lipsyncStart();

  // opcional: poné estado speaking automáticamente
  avatar.setAttribute("state", "speaking");
});

stopBtn.addEventListener("click", () => {
  audio.pause();
  lipsyncStop();
  avatar.setAttribute("state", "idle");
});

idleBtn.addEventListener("click", () => avatar.setAttribute("state", "idle"));
speakingBtn.addEventListener("click", () => avatar.setAttribute("state", "speaking"));
surprisedBtn.addEventListener("click", () => avatar.setAttribute("state", "surprised"));

// Si el audio termina, detenemos lipsync
audio.addEventListener("ended", () => {
  lipsyncStop();
  avatar.setAttribute("state", "idle");
});

// Cargar audio local en el <audio>
fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  audio.src = url;
  audio.load();
});