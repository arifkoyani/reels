// Cuts the turnaround sheets in public/assets into transparent per-part PNGs.
//   node tools/slice-assets.mjs --report   (just print what it finds)
//   node tools/slice-assets.mjs            (write the parts)
import fs from "fs";
import path from "path";
import { decodePNG, encodePNG } from "./png.mjs";

const ASSETS = path.join("public", "assets");
const OUT = path.join("public", "assets", "parts");

const BG_TOLERANCE = 45; // how far from the sheet's grey still counts as background
const FEATHER = 40; // extra softness band for anti-aliased edges
const MIN_AREA = 3000; // ignore specks

const diff = (rgba, i, bg) =>
  Math.max(
    Math.abs(rgba[i] - bg[0]),
    Math.abs(rgba[i + 1] - bg[1]),
    Math.abs(rgba[i + 2] - bg[2]),
  );

// Background is whatever the border grey is; flood fill inward from the edges so
// light pixels INSIDE the character (skin, paper) are never mistaken for background.
const buildMasks = (img) => {
  const { width, height, rgba } = img;
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  const bg = [0, 1, 2].map((c) =>
    Math.round(corners.reduce((sum, [x, y]) => sum + rgba[(y * width + x) * 4 + c], 0) / 4),
  );

  const isBackground = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (isBackground[p]) return;
    if (diff(rgba, p * 4, bg) > BG_TOLERANCE) return;
    isBackground[p] = 1;
    stack.push(p);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length > 0) {
    const p = stack.pop();
    const x = p % width;
    const y = (p - x) / width;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  return { bg, isBackground };
};

// 8-connected components over the foreground, so each body/head/tile comes out separately.
const findParts = (img, isBackground) => {
  const { width, height } = img;
  const seen = new Uint8Array(width * height);
  const parts = [];

  for (let start = 0; start < width * height; start++) {
    if (seen[start] || isBackground[start]) continue;

    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    let area = 0;

    seen[start] = 1;
    const stack = [start];
    while (stack.length > 0) {
      const p = stack.pop();
      const x = p % width;
      const y = (p - x) / width;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const np = ny * width + nx;
          if (seen[np] || isBackground[np]) continue;
          seen[np] = 1;
          stack.push(np);
        }
      }
    }

    if (area >= MIN_AREA) {
      parts.push({ minX, maxX, minY, maxY, area, width: maxX - minX + 1, height: maxY - minY + 1 });
    }
  }

  return parts;
};

// Crop a box out. Alpha comes from the flood-fill mask, never from colour distance —
// the man's skin sits close to the sheet's grey and would otherwise go see-through.
const cut = (img, mask, box, canvas) => {
  const { width: sw, rgba: src } = img;
  const outW = canvas?.width ?? box.width;
  const outH = canvas?.height ?? box.height;
  const offsetX = canvas ? Math.round((outW - box.width) / 2) : 0;
  const offsetY = canvas ? canvas.offsetY ?? 0 : 0;

  const out = Buffer.alloc(outW * outH * 4);
  const solid = new Uint8Array(outW * outH);

  for (let y = 0; y < box.height; y++) {
    for (let x = 0; x < box.width; x++) {
      const dx = x + offsetX;
      const dy = y + offsetY;
      if (dx < 0 || dy < 0 || dx >= outW || dy >= outH) continue;
      const sx = box.minX + x;
      const sy = box.minY + y;
      if (sx < 0 || sy < 0 || sx >= sw) continue;

      const s = (sy * sw + sx) * 4;
      const d = (dy * outW + dx) * 4;
      out[d] = src[s];
      out[d + 1] = src[s + 1];
      out[d + 2] = src[s + 2];
      if (!mask[sy * sw + sx]) solid[dy * outW + dx] = 1;
    }
  }

  // The sheet's anti-aliased rim is a grey/subject blend. Keeping it opaque leaves
  // a halo, so erode one pixel and derive the edge alpha from the ERODED mask:
  // interior stays solid, the rim fades out carrying less of the grey.
  const eroded = new Uint8Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const p = y * outW + x;
      if (!solid[p]) continue;
      let all = true;
      for (let dy = -1; dy <= 1 && all; dy++) {
        for (let dx = -1; dx <= 1 && all; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= outW || ny >= outH) continue;
          if (!solid[ny * outW + nx]) all = false;
        }
      }
      eroded[p] = all ? 1 : 0;
    }
  }

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const p = y * outW + x;
      if (!solid[p]) {
        out[p * 4 + 3] = 0;
        continue;
      }
      let count = 0;
      let total = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= outW || ny >= outH) continue;
          total++;
          if (eroded[ny * outW + nx]) count++;
        }
      }
      out[p * 4 + 3] = Math.round((count / total) * 255);
    }
  }

  return { width: outW, height: outH, rgba: out };
};

const load = (name) => {
  const img = decodePNG(fs.readFileSync(path.join(ASSETS, name)));
  const { bg, isBackground } = buildMasks(img);
  const parts = findParts(img, isBackground);
  const bgPixels = isBackground.reduce((n, v) => n + v, 0);
  return { img, bg, parts, isBackground, bgShare: bgPixels / (img.width * img.height) };
};

const report = (name) => {
  const { img, bg, parts, bgShare } = load(name);
  console.log(`\n${name}  ${img.width}x${img.height}  grey=rgb(${bg})  background=${(bgShare * 100).toFixed(1)}%`);
  parts
    .sort((a, b) => a.minY - b.minY || a.minX - b.minX)
    .forEach((p, i) =>
      console.log(
        `  [${String(i).padStart(2)}] x=${String(p.minX).padStart(4)} y=${String(p.minY).padStart(4)}  ${String(p.width).padStart(4)}x${String(p.height).padStart(4)}  area=${p.area}`,
      ),
    );
  return { img, bg, parts };
};

export { load, report, cut, OUT };

if (process.argv.includes("--report")) {
  for (const f of ["man.png", "bot.png"]) report(f);
}
