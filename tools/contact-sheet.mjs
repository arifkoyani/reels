// Lays the exported parts on magenta so any leftover grey matte is obvious.
import fs from "fs";
import path from "path";
import { decodePNG, encodePNG } from "./png.mjs";

const dir = path.join("public", "assets", "parts");
const scratch = process.argv[2];

const rows = [
  ["man-head-1", "man-head-2", "man-head-3", "man-head-4", "man-head-5", "man-head-6"],
  ["bot-face-1", "bot-face-2", "bot-face-3", "bot-face-4", "bot-face-5", "bot-face-6", "bot-face-7"],
];

const images = rows.map((row) =>
  row.map((n) => decodePNG(fs.readFileSync(path.join(dir, `${n}.png`)))),
);

const width = Math.max(...images.map((row) => row.reduce((w, i) => w + i.width, 0)));
const height = images.reduce((h, row) => h + Math.max(...row.map((i) => i.height)), 0);

const out = Buffer.alloc(width * height * 4);
for (let i = 0; i < width * height; i++) {
  out[i * 4] = 255;
  out[i * 4 + 1] = 0;
  out[i * 4 + 2] = 255;
  out[i * 4 + 3] = 255;
}

let offsetY = 0;
for (const row of images) {
  let offsetX = 0;
  for (const img of row) {
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const s = (y * img.width + x) * 4;
        const a = img.rgba[s + 3] / 255;
        if (a === 0) continue;
        const d = ((y + offsetY) * width + (x + offsetX)) * 4;
        for (let c = 0; c < 3; c++) {
          out[d + c] = Math.round(img.rgba[s + c] * a + out[d + c] * (1 - a));
        }
      }
    }
    offsetX += img.width;
  }
  offsetY += Math.max(...row.map((i) => i.height));
}

fs.writeFileSync(scratch, encodePNG({ width, height, rgba: out }));
console.log(`contact sheet: ${width}x${height} -> ${scratch}`);
