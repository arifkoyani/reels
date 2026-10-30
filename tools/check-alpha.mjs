import fs from "fs";
import path from "path";
import { decodePNG } from "./png.mjs";

const dir = path.join("public", "assets", "parts");
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".png"))) {
  const { width, height, rgba } = decodePNG(fs.readFileSync(path.join(dir, f)));
  let clear = 0;
  let solid = 0;
  let partial = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] === 0) clear++;
    else if (rgba[i] === 255) solid++;
    else partial++;
  }
  const total = width * height;
  const corner = rgba[3]; // top-left alpha
  console.log(
    `${f.padEnd(22)} transparent=${((clear / total) * 100).toFixed(1).padStart(5)}%  solid=${((solid / total) * 100).toFixed(1).padStart(5)}%  feathered=${((partial / total) * 100).toFixed(1).padStart(4)}%  corner_alpha=${corner}`,
  );
}
