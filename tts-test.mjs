import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createWriteStream } from "fs";
import { mkdir, readdir, stat } from "fs/promises";
import { join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

// The client reads ELEVENLABS_API_KEY from the environment.
// Run with: npm run tts  (which passes --env-file=.env.local)
const client = new ElevenLabsClient();

const VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // George (male, narrative)
const AUDIO_DIR = "mp3"; // all generated audio is stored and read from here

// Turn the spoken text into a short, filesystem-safe filename stem.
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "clip";
}

// npm run tts -- --list  → show what's already stored
async function listClips() {
  const files = (await readdir(AUDIO_DIR)).filter((f) => f.endsWith(".mp3"));
  if (files.length === 0) {
    console.log(`No clips in ${AUDIO_DIR}/ yet.`);
    return;
  }
  for (const file of files.sort()) {
    const { size } = await stat(join(AUDIO_DIR, file));
    console.log(`${file}  ${(size / 1024).toFixed(1)} KB`);
  }
}

const args = process.argv.slice(2);

await mkdir(AUDIO_DIR, { recursive: true });

if (args[0] === "--list") {
  await listClips();
} else {
  const text = args.join(" ") || "Hello, welcome to ElevenLabs!";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = join(AUDIO_DIR, `${stamp}_${slugify(text)}.mp3`);

  const audio = await client.textToSpeech.convert(VOICE_ID, {
    text,
    modelId: "eleven_v4",
  });

  // convert() returns a web ReadableStream — bridge it to a Node stream to write to disk.
  // pipeline() waits for the write to finish and throws if it fails.
  await pipeline(Readable.fromWeb(audio), createWriteStream(outPath));

  console.log(`Wrote ${outPath}`);
}
