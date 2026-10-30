// Compare the acoustic character of two voices: pitch, pitch variability and
// spectral shape. Enough to tell a natural human read from a synthetic/robotic one.
//   node tools/voice-analyze.mjs a.wav b.wav
import fs from "fs";

const readWav = (file) => {
  const buf = fs.readFileSync(file);
  // walk RIFF chunks to find fmt and data
  let pos = 12;
  let channels = 1;
  let rate = 16000;
  let bits = 16;
  let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("latin1", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(pos + 10);
      rate = buf.readUInt32LE(pos + 12);
      bits = buf.readUInt16LE(pos + 22);
    } else if (id === "data") {
      data = buf.subarray(pos + 8, pos + 8 + size);
      break;
    }
    pos += 8 + size + (size % 2);
  }
  if (!data || bits !== 16) throw new Error(`Unsupported wav: ${file}`);

  const n = Math.floor(data.length / 2 / channels);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = data.readInt16LE(i * channels * 2) / 32768;
  return { samples: out, rate };
};

// Iterative radix-2 FFT (in place, real + imag arrays)
const fft = (re, im) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
};

const analyze = (file) => {
  const { samples, rate } = readWav(file);
  const win = 512;
  const hop = 256;

  const minLag = Math.floor(rate / 400); // 400 Hz ceiling
  const maxLag = Math.floor(rate / 60); // 60 Hz floor

  const f0s = [];
  const periodicity = [];
  const centroids = [];
  const flatness = [];
  let voiced = 0;
  let frames = 0;
  let rmsSum = 0;

  for (let start = 0; start + maxLag + win < samples.length; start += hop) {
    const seg = samples.subarray(start, start + win);
    let rms = 0;
    for (let i = 0; i < win; i++) rms += seg[i] * seg[i];
    rms = Math.sqrt(rms / win);
    rmsSum += rms;
    frames++;
    if (rms < 0.01) continue; // silence

    // --- autocorrelation pitch ---
    let best = 0;
    let bestLag = 0;
    let energy0 = 0;
    for (let i = 0; i < win; i++) energy0 += samples[start + i] * samples[start + i];
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s = 0;
      for (let i = 0; i < win; i++) s += samples[start + i] * samples[start + i + lag];
      if (s > best) {
        best = s;
        bestLag = lag;
      }
    }
    const norm = energy0 > 0 ? best / energy0 : 0;
    if (norm > 0.3 && bestLag > 0) {
      f0s.push(rate / bestLag);
      periodicity.push(norm);
      voiced++;
    }

    // --- spectrum ---
    const re = new Float64Array(win);
    const im = new Float64Array(win);
    for (let i = 0; i < win; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1)); // hann
      re[i] = seg[i] * w;
    }
    fft(re, im);
    let num = 0;
    let den = 0;
    let logSum = 0;
    let linSum = 0;
    let bins = 0;
    for (let k = 1; k < win / 2; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]) + 1e-12;
      const freq = (k * rate) / win;
      num += freq * mag;
      den += mag;
      logSum += Math.log(mag);
      linSum += mag;
      bins++;
    }
    if (den > 0) centroids.push(num / den);
    if (bins > 0) flatness.push(Math.exp(logSum / bins) / (linSum / bins));
  }

  const median = (a) => {
    if (a.length === 0) return 0;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  };
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

  // Pitch variability in semitones is the clearest human-vs-robot signal
  const medF0 = median(f0s);
  const semis = f0s.filter((f) => f > 0).map((f) => 12 * Math.log2(f / medF0));
  const sd = Math.sqrt(mean(semis.map((s) => s * s)));

  return {
    file: file.split(/[\\/]/).pop(),
    voicedPct: frames ? (voiced / frames) * 100 : 0,
    medianF0: medF0,
    f0SpreadSemitones: sd,
    periodicity: mean(periodicity),
    centroidHz: mean(centroids),
    flatness: mean(flatness),
  };
};

for (const f of process.argv.slice(2)) {
  const r = analyze(f);
  console.log(`\n=== ${r.file} ===`);
  console.log(`voiced frames      : ${r.voicedPct.toFixed(1)}%`);
  console.log(`median pitch (F0)  : ${r.medianF0.toFixed(1)} Hz`);
  console.log(`pitch spread       : ${r.f0SpreadSemitones.toFixed(2)} semitones  <-- monotone if low`);
  console.log(`periodicity        : ${r.periodicity.toFixed(3)}  <-- 1.0 = perfectly periodic/buzzy`);
  console.log(`spectral centroid  : ${r.centroidHz.toFixed(0)} Hz  <-- brightness`);
  console.log(`spectral flatness  : ${r.flatness.toFixed(4)}  <-- higher = noisier/more metallic`);
}
