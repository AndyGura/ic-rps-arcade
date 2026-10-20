// 8-bit sound effects, synthesised on the fly with WebAudio: square and
// triangle oscillators plus a white-noise channel, like a sound chip.

const MUTE_KEY = "rps-arcade-muted";

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch (_) {}

function audio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

/// Browsers start audio suspended until a user gesture.
export function unlockAudio() {
  const c = audio();
  if (c && c.state === "suspended") void c.resume();
}

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch (_) {}
}

// One note: `freq` may be [from, to] for a pitch slide.
function tone(type, freq, start, dur, vol = 0.5) {
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  const [f0, f1] = Array.isArray(freq) ? freq : [freq, freq];
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.setValueAtTime(vol, t0 + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(start, dur, vol = 0.5, cutoff = 4000) {
  const t0 = ctx.currentTime + start;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(cutoff, t0);
  f.frequency.exponentialRampToValueAtTime(200, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

const notes = (type, seq, step, vol) => seq.forEach((f, i) => f && tone(type, f, i * step, step * 0.95, vol));

const SOUNDS = {
  blip: () => tone("square", 1320, 0, 0.03, 0.18),
  select: () => notes("square", [660, 990], 0.05, 0.3),
  back: () => notes("square", [660, 440], 0.05, 0.3),
  coin: () => {
    tone("square", 988, 0, 0.08, 0.35);
    tone("square", 1319, 0.08, 0.35, 0.35);
  },
  lock: () => {
    tone("square", [440, 880], 0, 0.08, 0.35);
    tone("triangle", 880, 0.08, 0.12, 0.4);
  },
  ready: () => notes("square", [392, 0, 392], 0.09, 0.35),
  fight: () => {
    noise(0, 0.25, 0.5, 6000);
    tone("square", [880, 110], 0, 0.35, 0.4);
    tone("triangle", [440, 55], 0, 0.4, 0.5);
  },
  hit: () => {
    noise(0, 0.18, 0.7, 3000);
    tone("square", [220, 60], 0, 0.2, 0.45);
  },
  tie: () => {
    tone("square", 330, 0, 0.1, 0.3);
    tone("square", 330, 0.14, 0.18, 0.3);
  },
  roundWin: () => notes("square", [523, 659, 784, 1047], 0.07, 0.3),
  roundLose: () => notes("square", [392, 311, 262], 0.1, 0.3),
  ko: () => {
    noise(0, 0.6, 0.6, 2500);
    tone("square", [600, 40], 0, 0.7, 0.45);
    tone("triangle", [300, 30], 0.05, 0.8, 0.5);
  },
  win: () => {
    notes("square", [523, 523, 523, 659, 0, 784, 0, 1047, 1047], 0.09, 0.3);
    notes("triangle", [262, 0, 262, 330, 0, 392, 0, 523, 523], 0.09, 0.35);
  },
  lose: () => notes("triangle", [392, 370, 349, 330, 0, 262], 0.18, 0.45),
  error: () => {
    tone("square", 98, 0, 0.12, 0.35);
    tone("square", 92, 0.16, 0.2, 0.35);
  },
  challenger: () => notes("square", [880, 660, 880, 660, 880, 660], 0.08, 0.25),
  tick: () => tone("square", 1760, 0, 0.02, 0.12),
};

export function play(name) {
  if (muted) return;
  const c = audio();
  if (!c || c.state !== "running") return;
  SOUNDS[name]?.();
}
