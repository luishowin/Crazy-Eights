// Synthesized game audio — no asset files. All cues are tiny oscillator/noise
// envelopes through one master gain. Safe against autoplay policy: nothing
// plays until a user gesture has unlocked the context, and pre-unlock calls
// are silently dropped.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
try {
  muted = localStorage.getItem('vce8-muted') === '1';
} catch {
  /* storage unavailable */
}

function ensure(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx.state === 'running' ? ctx : null;
  } catch {
    return null;
  }
}

/** Call from a real user gesture (App wires this to the first pointerdown). */
export function unlockAudio(): void {
  ensure();
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem('vce8-muted', m ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (master) master.gain.value = m ? 0 : 1;
}

function noise(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.25, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

interface ToneOpts {
  type?: OscillatorType;
  from: number;
  to?: number;
  dur: number;
  gain?: number;
  at?: number;
}
function tone(o: ToneOpts): void {
  const c = ensure();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.from, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
  const g = c.createGain();
  g.gain.setValueAtTime(o.gain ?? 0.14, t0);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + o.dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.02);
}

interface SwishOpts {
  freq: number;
  freqTo?: number;
  q?: number;
  dur: number;
  gain?: number;
  kind?: BiquadFilterType;
}
function swish(o: SwishOpts): void {
  const c = ensure();
  if (!c || !master || muted) return;
  const t0 = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = o.kind ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq, t0);
  if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, t0 + o.dur);
  f.Q.value = o.q ?? 1.2;
  const g = c.createGain();
  g.gain.setValueAtTime(o.gain ?? 0.22, t0);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + o.dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + o.dur + 0.02);
}

export const sfx = {
  /** Tap / selection blip. */
  select(): void {
    tone({ type: 'triangle', from: 1100, to: 850, dur: 0.035, gain: 0.08 });
  },
  /** Card lands on the pile: felt thwack. */
  play(): void {
    swish({ kind: 'lowpass', freq: 1800, dur: 0.06, gain: 0.28 });
    tone({ from: 170, to: 110, dur: 0.09, gain: 0.16 });
  },
  /** One dealt card (quiet play with a little detune). */
  deal(): void {
    swish({ kind: 'lowpass', freq: 1400 + Math.random() * 400, dur: 0.045, gain: 0.12 });
  },
  /** Drawing from the pile: swish. */
  draw(): void {
    swish({ freq: 400, freqTo: 2200, dur: 0.09, gain: 0.18 });
  },
  /** Illegal action / penalty. */
  error(): void {
    tone({ type: 'square', from: 220, dur: 0.07, gain: 0.07 });
    tone({ type: 'square', from: 160, dur: 0.09, gain: 0.07, at: 0.07 });
  },
  /** Your turn begins. */
  yourTurn(): void {
    tone({ from: 660, dur: 0.09, gain: 0.09 });
    tone({ from: 880, dur: 0.14, gain: 0.09, at: 0.09 });
  },
  /** Direction reversed: pitch bend up and back. */
  reverse(): void {
    tone({ type: 'triangle', from: 500, to: 900, dur: 0.09, gain: 0.1 });
    tone({ type: 'triangle', from: 900, to: 500, dur: 0.09, gain: 0.1, at: 0.09 });
  },
  /** Attack lands (draw stack grows). */
  attack(): void {
    tone({ type: 'sawtooth', from: 300, to: 180, dur: 0.14, gain: 0.09 });
  },
  /** Round won. */
  win(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => tone({ from: f, dur: 0.16, gain: 0.1, at: i * 0.11 }));
  },
};
