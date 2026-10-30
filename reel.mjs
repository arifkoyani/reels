// Pairs an MP3 in mp3/ with its transcription in transcriptionasJSON/, then hands
// the pair to the Remotion CLI as input props.
//   node reel.mjs studio [basename]
//   node reel.mjs render [basename]
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const AUDIO_DIR = "mp3";
const TRANSCRIPT_DIR = "transcriptionasJSON";
const OUTPUT_DIR = "finalVideos";
const STAGED_AUDIO_DIR = path.join("public", "audio");
const PROPS_FILE = ".reel-props.json";
const ENTRY = "src/index.jsx";
const COMPOSITION =
  process.argv.find((a) => a.startsWith("--comp="))?.split("=")[1] ?? "Scene";

const mode = process.argv[2];
if (mode !== "studio" && mode !== "render") {
  console.error("Usage: node reel.mjs <studio|render> [basename]");
  process.exit(1);
}

// Pick the requested clip, or the newest one — same rule groq-transcription.js uses.
function resolveBaseName() {
  const requested = process.argv.slice(3).find((a) => !a.startsWith("--"));
  if (requested) return path.parse(requested).name;

  if (!fs.existsSync(AUDIO_DIR)) {
    throw new Error(`Missing ${AUDIO_DIR}/ — run "npm run tts" first.`);
  }
  const mp3s = fs
    .readdirSync(AUDIO_DIR)
    .filter((f) => f.toLowerCase().endsWith(".mp3"))
    .map((f) => ({ f, mtime: fs.statSync(path.join(AUDIO_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (mp3s.length === 0) {
    throw new Error(`No .mp3 files in ${AUDIO_DIR}/ — run "npm run tts" first.`);
  }
  return path.parse(mp3s[0].f).name;
}

const baseName = resolveBaseName();
const audioPath = path.join(AUDIO_DIR, `${baseName}.mp3`);
const transcriptPath = path.join(TRANSCRIPT_DIR, `${baseName}.json`);

if (!fs.existsSync(audioPath)) {
  throw new Error(`Audio not found: ${audioPath}`);
}
if (!fs.existsSync(transcriptPath)) {
  throw new Error(
    `Transcription not found: ${transcriptPath}\nRun: npm run transcribe ${baseName}.mp3`,
  );
}

const transcription = JSON.parse(fs.readFileSync(transcriptPath, "utf8"));
const wordCount = transcription.words?.length ?? 0;
if (wordCount === 0) {
  console.warn(`Warning: ${transcriptPath} has no word timestamps; captions will be empty.`);
}

// Remotion only serves public/, so stage a copy of the chosen clip there.
// mp3/ stays the source of truth for the ElevenLabs and Groq scripts.
fs.mkdirSync(STAGED_AUDIO_DIR, { recursive: true });
fs.copyFileSync(audioPath, path.join(STAGED_AUDIO_DIR, `${baseName}.mp3`));

// staticFile() resolves against public/, so include the subfolder.
fs.writeFileSync(
  PROPS_FILE,
  JSON.stringify(
    { audioFile: `audio/${baseName}.mp3`, transcription, title: "" },
    null,
    2,
  ),
  "utf8",
);

console.log(`Clip:    ${baseName}`);
console.log(`Audio:   ${audioPath}`);
console.log(`Words:   ${wordCount}`);

const args =
  mode === "studio"
    ? ["remotion", "studio", ENTRY, `--props=${PROPS_FILE}`]
    : [
        "remotion",
        "render",
        ENTRY,
        COMPOSITION,
        path.join(OUTPUT_DIR, `${baseName}.mp4`),
        `--props=${PROPS_FILE}`,
      ];

if (mode === "render") {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`Output:  ${path.join(OUTPUT_DIR, `${baseName}.mp4`)}\n`);
}

const result = spawnSync("npx", args, { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
