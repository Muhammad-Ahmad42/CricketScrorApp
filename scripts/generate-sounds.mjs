import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 22050;
const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

function createNoise(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000 - 0.5;
  };
}

function buffer(durationMs) {
  return new Float64Array(Math.round((SAMPLE_RATE * durationMs) / 1000));
}

function addTone(samples, { frequency, endFrequency = frequency, startMs = 0, attackMs = 2, decayMs, gain }) {
  const start = Math.round((SAMPLE_RATE * startMs) / 1000);
  const attack = Math.max(1, Math.round((SAMPLE_RATE * attackMs) / 1000));
  const decay = (SAMPLE_RATE * decayMs) / 1000;
  let phase = 0;
  for (let index = start; index < samples.length; index += 1) {
    const local = index - start;
    const progress = Math.min(1, local / (samples.length - start));
    const current = frequency + (endFrequency - frequency) * progress;
    phase += (2 * Math.PI * current) / SAMPLE_RATE;
    const rise = Math.min(1, local / attack);
    const envelope = rise * Math.exp(-local / decay);
    samples[index] += gain * envelope * Math.sin(phase);
  }
}

function addNoiseBurst(samples, { startMs, decayMs, gain, smoothing, seed }) {
  const next = createNoise(seed);
  const start = Math.round((SAMPLE_RATE * startMs) / 1000);
  const decay = (SAMPLE_RATE * decayMs) / 1000;
  let filtered = 0;
  for (let index = start; index < samples.length; index += 1) {
    const local = index - start;
    filtered += smoothing * (next() - filtered);
    samples[index] += gain * Math.exp(-local / decay) * filtered;
  }
}

function fadeEdges(samples, fadeInMs, fadeOutMs) {
  const fadeIn = Math.round((SAMPLE_RATE * fadeInMs) / 1000);
  const fadeOut = Math.round((SAMPLE_RATE * fadeOutMs) / 1000);
  for (let index = 0; index < fadeIn && index < samples.length; index += 1) {
    samples[index] *= index / fadeIn;
  }
  for (let index = 0; index < fadeOut && index < samples.length; index += 1) {
    samples[samples.length - 1 - index] *= index / fadeOut;
  }
}

function normalize(samples, peakDbfs) {
  const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const target = 10 ** (peakDbfs / 20);
  const scale = peak === 0 ? 0 : target / peak;
  return samples.map((value) => value * scale);
}

function encodeWav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, index) => {
    const clamped = Math.max(-1, Math.min(1, value));
    data.writeInt16LE(Math.round(clamped * 32767), index * 2);
  });
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function runTick() {
  const samples = buffer(70);
  addTone(samples, { frequency: 1650, attackMs: 1, decayMs: 12, gain: 1 });
  addTone(samples, { frequency: 2470, attackMs: 1, decayMs: 7, gain: 0.35 });
  addNoiseBurst(samples, { startMs: 0, decayMs: 2.5, gain: 0.5, smoothing: 0.45, seed: 11 });
  fadeEdges(samples, 0.5, 8);
  return normalize(samples, -16);
}

function boundaryKnock() {
  const samples = buffer(200);
  const knock = (startMs, gain) => {
    addTone(samples, { frequency: 440, endFrequency: 410, startMs, attackMs: 1.5, decayMs: 55, gain });
    addTone(samples, { frequency: 880, startMs, attackMs: 1.5, decayMs: 30, gain: gain * 0.45 });
    addTone(samples, { frequency: 1320, startMs, attackMs: 1, decayMs: 16, gain: gain * 0.25 });
    addNoiseBurst(samples, { startMs, decayMs: 3, gain: gain * 0.3, smoothing: 0.3, seed: 23 + Math.round(startMs) });
  };
  knock(0, 1);
  knock(85, 0.5);
  fadeEdges(samples, 0.5, 12);
  return normalize(samples, -13);
}

function wicketStump() {
  const samples = buffer(260);
  addTone(samples, { frequency: 150, endFrequency: 105, attackMs: 2, decayMs: 70, gain: 1 });
  addTone(samples, { frequency: 920, attackMs: 0.8, decayMs: 9, gain: 0.55 });
  [28, 52, 74].forEach((startMs, index) => {
    addNoiseBurst(samples, { startMs, decayMs: 9 - index * 2, gain: 0.45 - index * 0.1, smoothing: 0.22, seed: 41 + index });
    addTone(samples, { frequency: 1180 - index * 140, startMs, attackMs: 0.6, decayMs: 6, gain: 0.25 - index * 0.05 });
  });
  fadeEdges(samples, 0.5, 20);
  return normalize(samples, -12);
}

function resultChord() {
  const samples = buffer(300);
  [
    [523.25, 0],
    [659.25, 25],
    [783.99, 50],
  ].forEach(([frequency, startMs]) => {
    addTone(samples, { frequency, startMs, attackMs: 8, decayMs: 120, gain: 0.8 });
    addTone(samples, { frequency: frequency * 2, startMs, attackMs: 8, decayMs: 60, gain: 0.15 });
  });
  fadeEdges(samples, 1, 40);
  return normalize(samples, -12);
}

const SOUNDS = {
  'run.wav': runTick,
  'boundary.wav': boundaryKnock,
  'wicket.wav': wicketStump,
  'result.wav': resultChord,
};

mkdirSync(OUTPUT, { recursive: true });
for (const [name, build] of Object.entries(SOUNDS)) {
  const encoded = encodeWav(build());
  writeFileSync(join(OUTPUT, name), encoded);
  process.stdout.write(`${name}: ${encoded.length} bytes\n`);
}
