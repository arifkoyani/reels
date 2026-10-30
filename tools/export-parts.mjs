// Writes the sliced, transparent parts into public/assets/parts/
import fs from "fs";
import path from "path";
import { encodePNG } from "./png.mjs";
import { load, cut, OUT } from "./slice-assets.mjs";

fs.mkdirSync(OUT, { recursive: true });

const byX = (a, b) => a.minX - b.minX;
const written = [];

const write = (name, image) => {
  const file = path.join(OUT, `${name}.png`);
  fs.writeFileSync(file, encodePNG(image));
  written.push(`${name}.png  ${image.width}x${image.height}`);
};

// Put a set of parts on one shared canvas so swapping frames causes no jitter.
const writeSet = (img, mask, bg, parts, names, { lockY = false } = {}) => {
  const canvasWidth = Math.max(...parts.map((p) => p.width)) + 8;
  const minY = Math.min(...parts.map((p) => p.minY));
  const maxY = Math.max(...parts.map((p) => p.maxY));
  const canvasHeight = lockY ? maxY - minY + 1 : Math.max(...parts.map((p) => p.height)) + 8;

  parts.forEach((part, i) => {
    // lockY keeps every frame on the sheet's shared y-band, so the skull stays put
    const box = lockY
      ? { minX: part.minX, minY, width: part.width, height: maxY - minY + 1, bg }
      : { minX: part.minX, minY: part.minY, width: part.width, height: part.height, bg };
    write(names[i], cut(img, mask, box, { width: canvasWidth, height: canvasHeight, bg }));
  });
};

// ---- man.png -------------------------------------------------------------
{
  const { img, bg, parts, isBackground: mask } = load("man.png");
  const bodies = parts.filter((p) => p.minY < 300).sort(byX);
  const heads = parts.filter((p) => p.minY >= 300).sort(byX);

  bodies.forEach((p, i) =>
    write(
      ["man-body-front", "man-body-side", "man-body-back", "man-body-3q"][i],
      cut(img, mask, { ...p, bg }, null),
    ),
  );

  writeSet(img, mask, bg, heads, [
    "man-head-rest",
    "man-head-frown",
    "man-head-open-mid",
    "man-head-open-wide",
    "man-head-smile-closed",
    "man-head-smile-open",
  ], { lockY: true });
}

// ---- bot.png -------------------------------------------------------------
{
  const { img, bg, parts, isBackground: mask } = load("bot.png");
  const views = parts.filter((p) => p.minY < 320).sort(byX);
  const hero = parts.find((p) => p.minY >= 320 && p.width > 400);
  const faces = parts
    .filter((p) => p.minY >= 320 && p !== hero)
    .sort((a, b) => a.minY - b.minY || a.minX - b.minX);

  views.forEach((p, i) =>
    write(
      ["bot-view-front", "bot-view-3q", "bot-view-side", "bot-view-back"][i],
      cut(img, mask, { ...p, bg }, null),
    ),
  );

  write("bot-hero", cut(img, mask, { ...hero, bg }, null));

  writeSet(
    img,
    mask,
    bg,
    faces,
    [
      "bot-face-neutral",
      "bot-face-smug",
      "bot-face-surprised",
      "bot-face-idle",
      "bot-face-blink",
      "bot-face-happy",
      "bot-face-shock",
    ],
  );
}

console.log(`Wrote ${written.length} files to ${OUT}/\n`);
written.forEach((w) => console.log(`  ${w}`));
