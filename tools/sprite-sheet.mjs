// Lay sprites on magenta at a common scale so mis-crops are obvious.
import fs from "fs";
import path from "path";
import { decodePNG, encodePNG } from "./png.mjs";

const dir = path.join("public", "assets", "sprites");
const names = process.argv.slice(3);
const imgs = names.map((n) => decodePNG(fs.readFileSync(path.join(dir, n + ".png"))));

const scale = 2;
const tw = Math.max(...imgs.map((i) => Math.ceil(i.width / scale)));
const th = Math.max(...imgs.map((i) => Math.ceil(i.height / scale)));
const gap = 8;
const W = (tw + gap) * imgs.length;

const out = Buffer.alloc(W * th * 4);
for (let i = 0; i < W * th; i++) {
  out[i * 4] = 255;
  out[i * 4 + 2] = 255;
  out[i * 4 + 3] = 255;
}

imgs.forEach((img, n) => {
  const ox = n * (tw + gap);
  for (let y = 0; y < Math.ceil(img.height / scale); y++) {
    for (let x = 0; x < Math.ceil(img.width / scale); x++) {
      const s = (y * scale * img.width + x * scale) * 4;
      const a = img.rgba[s + 3] / 255;
      if (a < 0.05) continue;
      const d = (y * W + x + ox) * 4;
      for (let c = 0; c < 3; c++) out[d + c] = Math.round(img.rgba[s + c] * a + out[d + c] * (1 - a));
    }
  }
});

fs.writeFileSync(process.argv[2], encodePNG({ width: W, height: th, rgba: out }));
console.log(`${W}x${th}`);
