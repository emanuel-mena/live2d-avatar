const avatar = document.getElementById("avatar");
const audio = document.getElementById("audio");

const playBtn = document.getElementById("play");
const stopBtn = document.getElementById("stop");

const idleBtn = document.getElementById("idle");
const speakingBtn = document.getElementById("speaking");
const surprisedBtn = document.getElementById("surprised");

const fileInput = document.getElementById("file");
const gainEl = document.getElementById("gain");
const smoothEl = document.getElementById("smooth");

if (
  !(avatar instanceof HTMLElement) ||
  !(audio instanceof HTMLAudioElement) ||
  !(playBtn instanceof HTMLButtonElement) ||
  !(stopBtn instanceof HTMLButtonElement) ||
  !(idleBtn instanceof HTMLButtonElement) ||
  !(speakingBtn instanceof HTMLButtonElement) ||
  !(surprisedBtn instanceof HTMLButtonElement) ||
  !(fileInput instanceof HTMLInputElement) ||
  !(gainEl instanceof HTMLInputElement) ||
  !(smoothEl instanceof HTMLInputElement)
) {
  throw new Error("Demo controls are missing in /demo/index.html.");
}

avatar.addEventListener("error", (ev) => {
  const detail = ev.detail ?? {};
  console.error("[avatar:error]", detail.message, detail.error);
});

function lipsyncStart() {
  const gain = Number(gainEl.value);
  const smoothing = Number(smoothEl.value);

  avatar.dispatchEvent(
    new CustomEvent("avatar-audio", {
      detail: {
        media: audio,
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
  avatar.dispatchEvent(new CustomEvent("avatar-audio-stop"));
}

playBtn.addEventListener("click", async () => {
  await audio.play();
  lipsyncStart();
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

audio.addEventListener("ended", () => {
  lipsyncStop();
  avatar.setAttribute("state", "idle");
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  audio.src = url;
  audio.load();
});
