import { Live2DAvatarElement } from "./element";

const TAG = "live2d-avatar";

if (!customElements.get(TAG)) {
  customElements.define(TAG, Live2DAvatarElement);
}

const avatar = (document.getElementById("avatar") ?? document.querySelector(TAG)) as HTMLElement | null;
const audio = document.getElementById("audio") as HTMLAudioElement | null;

const playBtn = document.getElementById("play") as HTMLButtonElement | null;
const stopBtn = document.getElementById("stop") as HTMLButtonElement | null;

const idleBtn = document.getElementById("idle") as HTMLButtonElement | null;
const speakingBtn = document.getElementById("speaking") as HTMLButtonElement | null;
const surprisedBtn = document.getElementById("surprised") as HTMLButtonElement | null;

const fileInput = document.getElementById("file") as HTMLInputElement | null;

const gainEl = document.getElementById("gain") as HTMLInputElement | null;
const smoothEl = document.getElementById("smooth") as HTMLInputElement | null;

if (
  !avatar ||
  !audio ||
  !playBtn ||
  !stopBtn ||
  !idleBtn ||
  !speakingBtn ||
  !surprisedBtn ||
  !fileInput ||
  !gainEl ||
  !smoothEl
) {
  throw new Error("Demo controls are missing in the page.");
}

const avatarEl = avatar;
const audioEl = audio;
const playButton = playBtn;
const stopButton = stopBtn;
const idleButton = idleBtn;
const speakingButton = speakingBtn;
const surprisedButton = surprisedBtn;
const fileInputEl = fileInput;
const gainInput = gainEl;
const smoothInput = smoothEl;

// Keep lipsync target explicit for this model.
avatarEl.setAttribute("mouth-param-id", "PARAM_MOUTH_OPEN_Y");

avatarEl.addEventListener("error", (ev: Event) => {
  const detail = (ev as CustomEvent<{ message?: string; error?: unknown }>).detail;
  console.error("[avatar:error]", detail?.message, detail?.error);
});

function lipsyncStart() {
  const gain = Number(gainInput.value);
  const smoothing = Number(smoothInput.value);

  avatarEl.dispatchEvent(
    new CustomEvent("avatar-audio", {
      detail: {
        media: audioEl,
        paramId: "PARAM_MOUTH_OPEN_Y",
        gain,
        smoothing,
        mode: "rms",
        floor: 0.005,
        ceiling: 0.25,
      },
    })
  );
}

function lipsyncStop() {
  avatarEl.dispatchEvent(new CustomEvent("avatar-audio-stop"));
}

playButton.addEventListener("click", async () => {
  // Autoplay policy: must be after user gesture.
  await audioEl.play();

  lipsyncStart();
  avatarEl.setAttribute("state", "speaking");
});

stopButton.addEventListener("click", () => {
  audioEl.pause();
  lipsyncStop();
  avatarEl.setAttribute("state", "idle");
});

idleButton.addEventListener("click", () => avatarEl.setAttribute("state", "idle"));
speakingButton.addEventListener("click", () => avatarEl.setAttribute("state", "speaking"));
surprisedButton.addEventListener("click", () => avatarEl.setAttribute("state", "surprised"));

audioEl.addEventListener("ended", () => {
  lipsyncStop();
  avatarEl.setAttribute("state", "idle");
});

fileInputEl.addEventListener("change", () => {
  const file = fileInputEl.files?.[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  audioEl.src = url;
  audioEl.load();
});

