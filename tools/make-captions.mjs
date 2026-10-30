// Convert a Groq verbose_json transcription into the @remotion/captions Caption[]
// shape, which is what the remotion-captions skill expects.
//   node tools/make-captions.mjs <transcript.json> <out.json>
import fs from "fs";

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error("Usage: node tools/make-captions.mjs <transcript.json> <out.json>");
  process.exit(1);
}

const transcript = JSON.parse(fs.readFileSync(input, "utf8"));
const words = transcript.words ?? [];

if (words.length === 0) {
  console.error(`No word timestamps in ${input}`);
  process.exit(1);
}

// Captions are whitespace sensitive: every word but the first carries a leading space.
const captions = words.map((w, i) => ({
  text: (i === 0 ? "" : " ") + w.word,
  startMs: Math.round(w.start * 1000),
  endMs: Math.round(w.end * 1000),
  timestampMs: Math.round(((w.start + w.end) / 2) * 1000),
  confidence: null,
}));

fs.writeFileSync(output, JSON.stringify(captions, null, 2), "utf8");

const lastMs = captions[captions.length - 1].endMs;
console.log(`${captions.length} captions -> ${output}`);
console.log(`ends at ${(lastMs / 1000).toFixed(2)}s (frame ${Math.round((lastMs / 1000) * 30)} @30fps)`);
