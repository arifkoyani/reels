// Generate the reel sound library with ElevenLabs.
//
//   node scripts/generate-sfx.mjs                 generate everything missing
//   node scripts/generate-sfx.mjs whoosh pop      only these
//   node scripts/generate-sfx.mjs --force         regenerate all
//
// Effects are listed in tools/sfx-list.json and written to public/sfx/<name>.mp3.
// Anything already on disk is skipped, so re-running costs no credits.
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

dotenv.config({ path: ".env.local" });

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error("Error: ELEVENLABS_API_KEY is not defined in .env.local");
  process.exit(1);
}

const client = new ElevenLabsClient({ apiKey });
const OUT_DIR = path.join(process.cwd(), "public", "sfx");
const LIST = path.join(process.cwd(), "tools", "sfx-list.json");

export async function generateOne({ name, prompt, duration = 1, promptInfluence = 0.5 }) {
  const outPath = path.join(OUT_DIR, `${name}.mp3`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const audioStream = await client.textToSoundEffects.convert({
    text: prompt,
    durationSeconds: duration,
    promptInfluence,
  });

  await pipeline(Readable.fromWeb(audioStream), fs.createWriteStream(outPath));
  return outPath;
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = args.filter((a) => !a.startsWith("--"));

  const { effects } = JSON.parse(fs.readFileSync(LIST, "utf8"));
  const wanted = only.length ? effects.filter((e) => only.includes(e.name)) : effects;

  if (only.length) {
    const unknown = only.filter((n) => !effects.some((e) => e.name === n));
    if (unknown.length) {
      console.error(`Unknown effect(s): ${unknown.join(", ")}`);
      console.error(`Available: ${effects.map((e) => e.name).join(", ")}`);
      process.exit(1);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let made = 0;
  let skipped = 0;

  // one at a time, so a failure is obvious and the API is not hammered
  for (const fx of wanted) {
    const outPath = path.join(OUT_DIR, `${fx.name}.mp3`);
    if (fs.existsSync(outPath) && !force) {
      console.log(`  skip      ${fx.name}  (already exists)`);
      skipped++;
      continue;
    }
    process.stdout.write(`  generate  ${fx.name} ... `);
    try {
      await generateOne(fx);
      const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
      console.log(`ok (${kb} KB)`);
      made++;
    } catch (err) {
      console.log(`FAILED — ${err.message}`);
    }
  }

  console.log(`\n${made} generated, ${skipped} skipped, ${wanted.length} total`);
  const have = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".mp3"));
  console.log(`library: ${have.map((f) => f.replace(".mp3", "")).join(", ")}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Execution failed:", err.message);
    process.exit(1);
  });
}
