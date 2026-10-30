// One command from a JSON spec to a verified MP4.
//
//   node make-video.mjs video-specs/khanpdf-10s.json
//   node make-video.mjs video-specs/khanpdf-10s.json --force   (ignore cache)
//
// Chain: script -> ElevenLabs TTS -> Groq transcription -> brand-name fixes ->
// stage audio + captions -> Remotion render -> ffprobe verify.
// TTS and transcription are cached on a hash of the script and voice settings,
// so re-running after a layout tweak costs no API credits.
import { spawnSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import { createRequire } from "module";
import path from "path";

// ESM has no require(), but we need it to locate Remotion's CLI entry
const require = createRequire(import.meta.url);

const AUDIO_DIR = path.join("public", "audio");
const CAPTION_DIR = path.join("src", "captions");
const CACHE_DIR = path.join(".cache", "voice");
const OUT_DIR = "finalVideos";
const ENTRY = "src/index.jsx";
const BRAND_TERMS = path.join("tools", "brand-terms.json");

const specPath = process.argv[2];
const force = process.argv.includes("--force");

if (!specPath) {
  console.error("Usage: node make-video.mjs <spec.json> [--force]");
  process.exit(1);
}

const step = (n, msg) => console.log(`\n[${n}] ${msg}`);
const fail = (msg) => {
  console.error(`\nFAILED: ${msg}`);
  process.exit(1);
};

// Node refuses to spawn .cmd/.bat without a shell (the CVE-2024-27980 fix), so
// npx.cmd can't be called directly. Resolve Remotion's JS entry and run it with
// node instead: no shell, no unescaped-arg warning, no .cmd restriction.
const REMOTION_CLI = (() => {
  const pkg = require.resolve("@remotion/cli/package.json", { paths: [process.cwd()] });
  return path.join(path.dirname(pkg), "remotion-cli.js");
})();

// ElevenLabs ships a native binary fetched by npx, so that one still goes
// through a shell. Its args carry no spec text — the JSON travels on stdin.
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { stdio: ["pipe", "pipe", "pipe"], encoding: "utf8", ...opts });

const runRemotion = (args, opts = {}) => spawnSync("node", [REMOTION_CLI, ...args], opts);

const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const fps = 30;
const durationInFrames = Math.round(spec.durationSeconds * fps);

for (const dir of [AUDIO_DIR, CAPTION_DIR, CACHE_DIR, OUT_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

// Cache key covers everything that changes the audio
const voiceKey = JSON.stringify({ script: spec.script, voice: spec.voice });
const hash = crypto.createHash("sha1").update(voiceKey).digest("hex").slice(0, 12);
const cachedAudio = path.join(CACHE_DIR, `${hash}.mp3`);
const cachedWords = path.join(CACHE_DIR, `${hash}.json`);

// ---------------------------------------------------------------- 1. voice
step(1, "Voiceover");
if (fs.existsSync(cachedAudio) && !force) {
  console.log(`    cached (${hash}) — no credits spent`);
} else {
  const body = {
    text: spec.script,
    model_id: spec.voice?.modelId ?? "eleven_v4",
  };
  if (spec.voice?.filterPreset) {
    body.audio_effects = { filter_preset_id: spec.voice.filterPreset };
  }

  // JSON goes in on stdin so no shell quoting can mangle it
  const res = run(
    NPX,
    [
      "-y",
      "@elevenlabs/cli@latest",
      "text-to-speech",
      "convert",
      "--voice-id",
      spec.voice?.voiceId ?? "JBFqnCBsd6RMkjVDRZzb",
      "--json",
      "-",
      "-o",
      cachedAudio,
    ],
    // npx is a .cmd on Windows, which Node will not spawn without a shell.
    // Safe here: the args carry no spec text — the JSON travels on stdin.
    { input: JSON.stringify(body), shell: true },
  );
  if (res.status !== 0 || !fs.existsSync(cachedAudio)) {
    fail(
      `ElevenLabs TTS failed (status ${res.status})\n${res.stderr || res.stdout || res.error?.message || "no output"}`,
    );
  }
  console.log(`    generated -> ${cachedAudio}`);
}

// ---------------------------------------------------------------- 2. words
step(2, "Transcription");
if (fs.existsSync(cachedWords) && !force) {
  console.log(`    cached (${hash})`);
} else {
  const res = run("node", ["groq-transcription.js", cachedAudio]);
  if (res.status !== 0) fail(`Groq transcription failed\n${res.stderr || res.stdout}`);

  // groq-transcription.js writes to transcriptionasJSON/<basename>.json
  const produced = path.join("transcriptionasJSON", `${hash}.json`);
  if (!fs.existsSync(produced)) fail(`Expected transcript at ${produced}`);
  fs.copyFileSync(produced, cachedWords);
  console.log(`    transcribed -> ${cachedWords}`);
}

// ---------------------------------------------------------------- 3. brand
step(3, "Brand-name corrections");
const transcript = JSON.parse(fs.readFileSync(cachedWords, "utf8"));
const { rules } = JSON.parse(fs.readFileSync(BRAND_TERMS, "utf8"));

let fixes = 0;
const applyRules = (text) => {
  let out = text;
  for (const rule of rules) {
    const re = new RegExp(rule.pattern, "ig");
    if (re.test(out)) {
      out = out.replace(new RegExp(rule.pattern, "ig"), rule.replace);
      fixes++;
    }
  }
  return out;
};

transcript.words = transcript.words.map((w) => ({ ...w, word: applyRules(w.word) }));
transcript.text = applyRules(transcript.text ?? "");
console.log(fixes > 0 ? `    applied ${fixes} fix(es)` : "    nothing to correct");

const lastEnd = transcript.words.at(-1)?.end ?? 0;
console.log(`    ${transcript.words.length} words, speech ends at ${lastEnd.toFixed(2)}s`);

const speechSeconds = lastEnd / (spec.speed ?? 1);
if (speechSeconds > spec.durationSeconds) {
  console.log(
    `    WARNING: speech runs ${speechSeconds.toFixed(2)}s but the video is ${spec.durationSeconds}s — it will be cut`,
  );
}

// ------------------------------------------------------- 3b. word-level cues
step("3b", "Word cues");
const WORD_ICONS = path.join("tools", "word-icons.json");
const dict = JSON.parse(fs.readFileSync(WORD_ICONS, "utf8"));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9-]/g, "");

const cues = [];
for (let i = 0; i < transcript.words.length; i += 1) {
  const w = transcript.words[i];
  const next = transcript.words[i + 1];

  // two-word phrases win over single words ("go dead" over "dead")
  const pair = next ? `${norm(w.word)} ${norm(next.word)}` : null;
  const phraseHit = pair ? dict.phrases[pair] : null;
  const hit = phraseHit ?? dict.words[norm(w.word)];
  if (!hit) continue;

  const end = phraseHit ? next.end : w.end;
  cues.push({
    start: w.start,
    end,
    // hold briefly after the word so it is readable
    until: end + 0.7,
    ...hit,
  });
  if (phraseHit) i += 1; // the pair consumed the next word too
}

console.log(`    ${cues.length} cue(s) from ${transcript.words.length} words`);
for (const c of cues) {
  console.log(`      ${c.start.toFixed(2)}s  ${c.icon.padEnd(16)} ${c.tone.padEnd(7)} ${c.label}`);
}

// ---------------------------------------------------------------- 4. stage
step(4, "Staging");
const audioName = `${spec.id}.mp3`;
fs.copyFileSync(cachedAudio, path.join(AUDIO_DIR, audioName));
const captionPath = path.join(CAPTION_DIR, `${spec.id}.json`);
fs.writeFileSync(captionPath, JSON.stringify(transcript, null, 2));
console.log(`    ${path.join(AUDIO_DIR, audioName)}`);
console.log(`    ${captionPath}`);

// ---------------------------------------------------------------- 5. render
step(5, "Render");
const beats = (spec.beats ?? []).map((b) => ({
  ...b,
  from: Math.round(b.fromSeconds * fps),
  to: Math.round(b.toSeconds * fps),
}));

const props = {
  audioFile: `audio/${audioName}`,
  transcription: transcript,
  beats,
  cues,
  speed: spec.speed ?? 1,
  durationInFrames,
  captionStyle: spec.captionStyle ?? "pop",
  ...(spec.speechEndSeconds
    ? { speechEnd: Math.round((spec.speechEndSeconds / (spec.speed ?? 1)) * fps) }
    : {}),
};

const propsPath = path.join(CACHE_DIR, `${spec.id}.props.json`);
fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));

const outPath = path.join(OUT_DIR, `${spec.id}.mp4`);
const render = runRemotion(
  ["render", ENTRY, spec.composition ?? "BotReel", outPath, `--props=${propsPath}`],
  { stdio: "inherit" },
);
if (render.status !== 0 || !fs.existsSync(outPath)) fail("Remotion render failed");

// ---------------------------------------------------------------- 6. verify
step(6, "Verify");
const probe = runRemotion(["ffprobe", outPath], {
  stdio: ["pipe", "pipe", "pipe"],
  encoding: "utf8",
});
const info = `${probe.stdout || ""}${probe.stderr || ""}`;

const duration = info.match(/Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/)?.[1];
const video = info.match(/Video: ([^\n]+)/)?.[1];
const audio = info.match(/Audio: ([^\n]+)/)?.[1];

console.log(`    duration : ${duration ?? "unknown"}`);
console.log(`    video    : ${video ? video.split(",").slice(0, 3).join(",") : "unknown"}`);
console.log(`    audio    : ${audio ? audio.split(",").slice(0, 3).join(",") : "MISSING"}`);

const problems = [];
if (!audio) problems.push("no audio track");
if (!video?.includes("1080x1920")) problems.push("not 1080x1920");
const expected = spec.durationSeconds;
const actual = duration
  ? Number(duration.slice(3, 5)) * 60 + Number(duration.slice(6))
  : 0;
if (Math.abs(actual - expected) > 0.15) {
  problems.push(`duration ${actual}s != ${expected}s`);
}

console.log("");
if (problems.length > 0) {
  fail(`verification: ${problems.join("; ")}`);
}
console.log(`DONE  ${outPath}`);
