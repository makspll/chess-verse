// All sounds are synthesised with WebAudio: no sample files to license or load.

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let muted = localStorage.getItem('muted') === '1';

function ac(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise) return noise;
  noise = c.createBuffer(1, c.sampleRate * 0.25, c.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

/** A filtered noise burst: the "wood" of a piece landing. */
function knock(t: number, freq: number, gain: number, decay: number, q = 1.4) {
  const c = ac();
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  src.connect(bp).connect(g).connect(c.destination);
  src.start(t);
  src.stop(t + decay + 0.02);
}

/** A short pitched body under the knock so it feels weighty. */
function thump(t: number, freq: number, gain: number, decay: number) {
  const c = ac();
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t + decay);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + decay + 0.02);
}

function tone(t: number, freq: number, gain: number, decay: number) {
  const c = ac();
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + decay + 0.02);
}

function play(fn: (t: number) => void) {
  if (muted) return;
  try {
    fn(ac().currentTime + 0.005);
  } catch {
    // Audio is a nicety; never let it break a move.
  }
}

export const sfx = {
  move: () =>
    play((t) => {
      knock(t, 1700, 0.55, 0.05);
      thump(t, 210, 0.32, 0.08);
    }),
  capture: () =>
    play((t) => {
      knock(t, 2600, 0.5, 0.035, 2);
      knock(t + 0.028, 1500, 0.6, 0.06);
      thump(t + 0.028, 150, 0.45, 0.1);
    }),
  check: () =>
    play((t) => {
      knock(t, 1700, 0.5, 0.05);
      thump(t, 210, 0.3, 0.08);
      tone(t + 0.04, 987.8, 0.12, 0.22);
      tone(t + 0.04, 1318.5, 0.06, 0.25);
    }),
  select: () => play((t) => knock(t, 3200, 0.12, 0.02, 3)),
  back: () =>
    play((t) => {
      knock(t, 1300, 0.3, 0.04);
      thump(t, 180, 0.15, 0.06);
    }),
  success: () =>
    play((t) => {
      tone(t, 659.3, 0.1, 0.18);
      tone(t + 0.09, 987.8, 0.1, 0.3);
    }),
  error: () => play((t) => thump(t, 140, 0.25, 0.12)),
};

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  localStorage.setItem('muted', m ? '1' : '0');
}
