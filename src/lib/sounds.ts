/**
 * Synthesized sound effects via WebAudio — no binary assets needed.
 * The AudioContext is created lazily on the first user-triggered sound so
 * browser autoplay policies are respected.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  durationMs: number,
  type: OscillatorType,
  gainValue: number,
  delayMs = 0,
): void {
  const ac = audio();
  if (!ac) return;
  const start = ac.currentTime + delayMs / 1000;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(gainValue, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + durationMs / 1000);
}

function noiseBurst(durationMs: number, gainValue: number, delayMs = 0): void {
  const ac = audio();
  if (!ac) return;
  const length = Math.floor((ac.sampleRate * durationMs) / 1000);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const gain = ac.createGain();
  gain.gain.value = gainValue;
  const filter = ac.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 900;
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(ac.currentTime + delayMs / 1000);
}

export const sounds = {
  /** Dice tumbling: two short noise bursts. */
  roll(): void {
    noiseBurst(70, 0.25);
    noiseBurst(60, 0.2, 90);
    noiseBurst(45, 0.15, 170);
  },
  /** Picking a checker up (selection / drag start): soft tick. */
  pick(): void {
    tone(1400, 30, "triangle", 0.12);
  },
  /**
   * Checker landing on a point: wood-on-wood click — a bright tap plus a
   * low thump so it reads clearly over speakers and laptop audio.
   */
  move(): void {
    tone(1100, 35, "triangle", 0.22);
    tone(190, 90, "sine", 0.26, 5);
    noiseBurst(25, 0.12);
  },
  /** A blot gets hit. */
  hit(): void {
    tone(200, 160, "square", 0.16);
    tone(140, 220, "sawtooth", 0.12, 40);
    noiseBurst(50, 0.14, 10);
  },
  /** Bearing a checker off. */
  bearOff(): void {
    tone(1200, 70, "triangle", 0.16);
    tone(1600, 90, "sine", 0.12, 60);
  },
  /** Game or match won. */
  win(): void {
    tone(523, 140, "sine", 0.14);
    tone(659, 140, "sine", 0.14, 140);
    tone(784, 140, "sine", 0.14, 280);
    tone(1047, 320, "sine", 0.16, 420);
  },
  /** Game lost. */
  lose(): void {
    tone(392, 200, "sine", 0.12);
    tone(311, 200, "sine", 0.12, 200);
    tone(262, 380, "sine", 0.12, 400);
  },
};

export type SoundName = keyof typeof sounds;
