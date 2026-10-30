// Find where a video's visuals change, by diffing consecutive sampled frames.
//   node tools/shot-detect.mjs <frames-dir> <fps> [threshold]
import fs from "fs";
import path from "path";
import { decodePNG } from "./png.mjs";

const dir = process.argv[2];
const fps = Number(process.argv[3] ?? 4);
const threshold = Number(process.argv[4] ?? 10);

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
if (files.length === 0) {
  console.error(`No frames in ${dir}`);
  process.exit(1);
}

const load = (f) => decodePNG(fs.readFileSync(path.join(dir, f)));

let prev = load(files[0]);
const diffs = [0];

for (let i = 1; i < files.length; i++) {
  const cur = load(files[i]);
  let sum = 0;
  const n = Math.min(prev.rgba.length, cur.rgba.length);
  for (let p = 0; p < n; p += 4) {
    sum +=
      Math.abs(prev.rgba[p] - cur.rgba[p]) +
      Math.abs(prev.rgba[p + 1] - cur.rgba[p + 1]) +
      Math.abs(prev.rgba[p + 2] - cur.rgba[p + 2]);
  }
  diffs.push(sum / (n / 4) / 3); // mean abs difference per channel, 0-255
  prev = cur;
}

// A shot boundary is a diff spike above threshold
const cuts = [0];
for (let i = 1; i < diffs.length; i++) {
  if (diffs[i] > threshold && i - cuts[cuts.length - 1] >= 2) cuts.push(i);
}

const shots = cuts.map((start, i) => {
  const end = i + 1 < cuts.length ? cuts[i + 1] : files.length;
  return {
    index: i + 1,
    startFrame: start,
    startSec: start / fps,
    endSec: end / fps,
    held: (end - start) / fps,
    // the frame to read for this shot: a little after the cut, so it has settled
    representative: files[Math.min(files.length - 1, start + 2)],
    peakDiff: diffs[start],
  };
});

console.log(`frames ${files.length} @ ${fps}fps  |  threshold ${threshold}`);
console.log(`detected ${shots.length} shots\n`);
console.log("  #   start     held   diff   frame");
for (const s of shots) {
  console.log(
    `  ${String(s.index).padStart(2)}  ${s.startSec.toFixed(2).padStart(6)}s  ${s.held.toFixed(2).padStart(5)}s  ${s.peakDiff.toFixed(1).padStart(5)}  ${s.representative}`,
  );
}

const holds = shots.map((s) => s.held);
console.log("");
console.log(`average hold : ${(holds.reduce((a, b) => a + b, 0) / holds.length).toFixed(2)}s`);
console.log(`shortest     : ${Math.min(...holds).toFixed(2)}s`);
console.log(`longest      : ${Math.max(...holds).toFixed(2)}s`);

fs.writeFileSync(path.join(dir, "..", "shots.json"), JSON.stringify(shots, null, 2));
