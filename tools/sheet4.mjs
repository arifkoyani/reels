// Downscale several stills and lay them side by side for review.
import fs from "fs";
import { decodePNG, encodePNG } from "./png.mjs";

const scale = 4;
const files = process.argv.slice(3);
const imgs = files.map((f) => decodePNG(fs.readFileSync(f)));

const tw = Math.floor(imgs[0].width / scale);
const th = Math.floor(imgs[0].height / scale);
const gap = 10;
const W = tw * imgs.length + gap * (imgs.length - 1);
const out = Buffer.alloc(W * th * 4, 0);
for (let i = 0; i < W * th; i++) {
  out[i * 4] = 210;
  out[i * 4 + 1] = 210;
  out[i * 4 + 2] = 210;
  out[i * 4 + 3] = 255;
}

imgs.forEach((img, n) => {
  const ox = n * (tw + gap);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const s = ((y * scale) * img.width + x * scale) * 4;
      const d = (y * W + (x + ox)) * 4;
      out[d] = img.rgba[s];
      out[d + 1] = img.rgba[s + 1];
      out[d + 2] = img.rgba[s + 2];
      out[d + 3] = 255;
    }
  }
});

fs.writeFileSync(process.argv[2], encodePNG({ width: W, height: th, rgba: out }));
console.log(`sheet ${W}x${th}`);
