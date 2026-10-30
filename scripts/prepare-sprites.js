import sharp from "sharp";
import fs from "fs";
import path from "path";

const SPRITES_DIR = path.join("public", "assets", "sprites");
fs.mkdirSync(SPRITES_DIR, { recursive: true });

async function removeBackgroundAndSave(inputPath, crop, outputPath, bgThreshold = 28) {
  const image = sharp(inputPath).extract(crop);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;

  const bgR = data[0];
  const bgG = data[1];
  const bgB = data[2];

  const outData = Buffer.alloc(info.width * info.height * 4);

  for (let i = 0; i < info.width * info.height; i++) {
    const srcIdx = i * channels;
    const destIdx = i * 4;

    const r = data[srcIdx];
    const g = data[srcIdx + 1];
    const b = data[srcIdx + 2];

    const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);

    if (dist < bgThreshold) {
      outData[destIdx] = 0;
      outData[destIdx + 1] = 0;
      outData[destIdx + 2] = 0;
      outData[destIdx + 3] = 0;
    } else if (dist < bgThreshold + 14) {
      const alpha = Math.min(255, Math.max(0, Math.round(255 * ((dist - bgThreshold) / 14))));
      outData[destIdx] = r;
      outData[destIdx + 1] = g;
      outData[destIdx + 2] = b;
      outData[destIdx + 3] = alpha;
    } else {
      outData[destIdx] = r;
      outData[destIdx + 1] = g;
      outData[destIdx + 2] = b;
      outData[destIdx + 3] = 255;
    }
  }

  await sharp(outData, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toFile(outputPath);

  console.log(`Generated: ${outputPath} (${info.width}x${info.height})`);
}

async function run() {
  console.log("Extracting and cutting out sprites with exact bounds...");

  // --- MAN ASSETS ---
  // 1. Man 3/4 perspective body
  await removeBackgroundAndSave(
    "public/assets/man.png",
    { left: 945, top: 30, width: 195, height: 560 },
    path.join(SPRITES_DIR, "man_body_34.png")
  );

  // 2. Man Front body
  await removeBackgroundAndSave(
    "public/assets/man.png",
    { left: 59, top: 30, width: 275, height: 560 },
    path.join(SPRITES_DIR, "man_body_front.png")
  );

  // 2b. Man 3/4 body WITHOUT the head, cut at the neck (measured: the neck
  // narrows to 43px at row 120 of the body crop, shoulders widen from row 130).
  // Overlaying a head sprite on the full body gave the character two heads.
  await removeBackgroundAndSave(
    "public/assets/man.png",
    { left: 945, top: 148, width: 195, height: 442 },
    path.join(SPRITES_DIR, "man_body_34_headless.png")
  );

  // 3. Man Head: Neutral Closed
  await removeBackgroundAndSave(
    "public/assets/man.png",
    { left: 57, top: 640, width: 156, height: 220 },
    path.join(SPRITES_DIR, "man_head_closed.png")
  );

  // 4. Man Head: Talking Open
  await removeBackgroundAndSave(
    "public/assets/man.png",
    { left: 444, top: 640, width: 156, height: 220 },
    path.join(SPRITES_DIR, "man_head_talk.png")
  );

  // 5. Man Head: Wide Open / Emphatic
  await removeBackgroundAndSave(
    "public/assets/man.png",
    { left: 628, top: 640, width: 156, height: 220 },
    path.join(SPRITES_DIR, "man_head_wide.png")
  );

  // 6. Man Head: 3/4 angle talking
  await removeBackgroundAndSave(
    "public/assets/man.png",
    { left: 999, top: 640, width: 164, height: 220 },
    path.join(SPRITES_DIR, "man_head_angle.png")
  );

  // --- BOT ASSETS ---
  // 7. Bot large front 3/4
  await removeBackgroundAndSave(
    "public/assets/bot.png",
    { left: 30, top: 375, width: 535, height: 510 },
    path.join(SPRITES_DIR, "bot_large.png")
  );

  // 8. Bot angle facing left (toward man)
  await removeBackgroundAndSave(
    "public/assets/bot.png",
    { left: 265, top: 40, width: 260, height: 310 },
    path.join(SPRITES_DIR, "bot_angle_facing_man.png")
  );

  // 9. Bot Face screen: wavy idle
  // Coordinates corrected: the previous crop (535,405) fell in the empty gap
  // between the hero render and the face-tile grid, so it produced garbage.
  await removeBackgroundAndSave(
    "public/assets/bot.png",
    { left: 645, top: 358, width: 229, height: 155 },
    path.join(SPRITES_DIR, "bot_face_idle.png")
  );

  // 10. Bot Face screen: talking (open "O" mouth tile)
  await removeBackgroundAndSave(
    "public/assets/bot.png",
    { left: 645, top: 531, width: 229, height: 155 },
    path.join(SPRITES_DIR, "bot_face_talking.png")
  );

  console.log("All sprites prepared successfully!");
}

run().catch(console.error);
