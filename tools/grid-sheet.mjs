// Tile frames into a labelled grid for review.
//   node tools/grid-sheet.mjs <out.png> <cols> <frame.png ...>
import fs from "fs";
import { decodePNG, encodePNG } from "./png.mjs";

const out = process.argv[2];
const cols = Number(process.argv[3]);
const files = process.argv.slice(4);

const imgs = files.map((f) => decodePNG(fs.readFileSync(f)));
const tw = Math.max(...imgs.map((i) => i.width));
const th = Math.max(...imgs.map((i) => i.height));
const gap = 6;
const rows = Math.ceil(imgs.length / cols);

const W = cols * tw + (cols + 1) * gap;
const H = rows * th + (rows + 1) * gap;
const buf = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
  buf[i * 4] = 24;
  buf[i * 4 + 1] = 24;
  buf[i * 4 + 2] = 28;
  buf[i * 4 + 3] = 255;
}

imgs.forEach((img, n) => {
  const cx = (n % cols) * tw + ((n % cols) + 1) * gap;
  const cy = Math.floor(n / cols) * th + (Math.floor(n / cols) + 1) * gap;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const s = (y * img.width + x) * 4;
      const d = ((y + cy) * W + x + cx) * 4;
      buf[d] = img.rgba[s];
      buf[d + 1] = img.rgba[s + 1];
      buf[d + 2] = img.rgba[s + 2];
      buf[d + 3] = 255;
    }
  }
});

fs.writeFileSync(out, encodePNG({ width: W, height: H, rgba: buf }));
console.log(`${W}x${H}  (${imgs.length} frames, ${cols} cols)`);
