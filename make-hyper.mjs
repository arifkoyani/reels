// Generate a HyperFrames composition from a JSON spec, then check and render it.
//
//   node make-hyper.mjs video-specs/khanpdf-ref.json
//   node make-hyper.mjs video-specs/khanpdf-ref.json --force    (re-run TTS)
//   node make-hyper.mjs video-specs/khanpdf-ref.json --no-render (write HTML only)
//
// Reuses the same voice cache as make-video.mjs, so switching engines costs no
// API credits. Chain: script -> TTS -> transcription -> brand fixes -> cues ->
// HTML + GSAP timeline -> hyperframes check -> hyperframes render.
import { spawnSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import { createRequire } from "module";
import path from "path";

const require = createRequire(import.meta.url);

const COMP_DIR = "hyper-comp";
const ASSET_DIR = path.join(COMP_DIR, "assets");
const CACHE_DIR = path.join(".cache", "voice");
const OUT_DIR = "finalVideos";
const BRAND_TERMS = path.join("tools", "brand-terms.json");
const WORD_ICONS = path.join("tools", "word-icons.json");
const FPS = 30;

const specPath = process.argv[2];
const force = process.argv.includes("--force");
const noRender = process.argv.includes("--no-render");

if (!specPath) {
  console.error("Usage: node make-hyper.mjs <spec.json> [--force] [--no-render]");
  process.exit(1);
}

const step = (n, msg) => console.log(`\n[${n}] ${msg}`);
const fail = (msg) => {
  console.error(`\nFAILED: ${msg}`);
  process.exit(1);
};

const NPX = process.platform === "win32" ? "npx.cmd" : "npx";
const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: "utf8", ...opts });

const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const duration = spec.durationSeconds;
const speed = spec.speed ?? 1;

for (const d of [ASSET_DIR, CACHE_DIR, OUT_DIR]) fs.mkdirSync(d, { recursive: true });

// ---------------------------------------------------------------- 1. voice
const hash = crypto
  .createHash("sha1")
  .update(JSON.stringify({ script: spec.script, voice: spec.voice }))
  .digest("hex")
  .slice(0, 12);
const cachedAudio = path.join(CACHE_DIR, `${hash}.mp3`);
const cachedWords = path.join(CACHE_DIR, `${hash}.json`);

step(1, "Voiceover");
if (fs.existsSync(cachedAudio) && !force) {
  console.log(`    cached (${hash}) — no credits spent`);
} else {
  const body = { text: spec.script, model_id: spec.voice?.modelId ?? "eleven_v4" };
  if (spec.voice?.filterPreset) {
    body.audio_effects = { filter_preset_id: spec.voice.filterPreset };
  }
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
    { input: JSON.stringify(body), shell: true },
  );
  if (res.status !== 0 || !fs.existsSync(cachedAudio)) {
    fail(`ElevenLabs TTS failed (status ${res.status})\n${res.stderr || res.stdout || "no output"}`);
  }
  console.log(`    generated -> ${cachedAudio}`);
}

// ---------------------------------------------------------------- 2. words
step(2, "Transcription");
if (fs.existsSync(cachedWords) && !force) {
  console.log(`    cached (${hash})`);
} else {
  const res = run("node", ["groq-transcription.js", cachedAudio], { stdio: "pipe" });
  if (res.status !== 0) fail(`Groq transcription failed\n${res.stderr || res.stdout}`);
  const produced = path.join("transcriptionasJSON", `${hash}.json`);
  if (!fs.existsSync(produced)) fail(`Expected transcript at ${produced}`);
  fs.copyFileSync(produced, cachedWords);
  console.log(`    transcribed -> ${cachedWords}`);
}

const transcript = JSON.parse(fs.readFileSync(cachedWords, "utf8"));

// ---------------------------------------------------------------- 3. brand
step(3, "Brand-name corrections");
const { rules } = JSON.parse(fs.readFileSync(BRAND_TERMS, "utf8"));
let fixes = 0;
const applyRules = (text) => {
  let out = text;
  for (const r of rules) {
    const re = new RegExp(r.pattern, "ig");
    if (re.test(out)) {
      out = out.replace(new RegExp(r.pattern, "ig"), r.replace);
      fixes++;
    }
  }
  return out;
};
transcript.words = transcript.words.map((w) => ({ ...w, word: applyRules(w.word) }));
console.log(fixes ? `    applied ${fixes} fix(es)` : "    nothing to correct");

// speed-scaled word times (the audio plays at `speed`, so timestamps compress)
const words = transcript.words.map((w) => ({
  ...w,
  start: w.start / speed,
  end: w.end / speed,
}));
const lastEnd = words.at(-1)?.end ?? 0;
console.log(`    ${words.length} words, speech ends at ${lastEnd.toFixed(2)}s`);
if (lastEnd > duration) {
  console.log(`    WARNING: speech runs past the ${duration}s composition and will be cut`);
}

// ---------------------------------------------------------------- 4. cues
step(4, "Word cues");
const dict = JSON.parse(fs.readFileSync(WORD_ICONS, "utf8"));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9-]/g, "");
const cues = [];
for (let i = 0; i < words.length; i++) {
  const w = words[i];
  const next = words[i + 1];
  const pair = next ? `${norm(w.word)} ${norm(next.word)}` : null;
  const phraseHit = pair ? dict.phrases[pair] : null;
  const hit = phraseHit ?? dict.words[norm(w.word)];
  if (!hit) continue;
  cues.push({ start: w.start, end: phraseHit ? next.end : w.end, ...hit });
  if (phraseHit) i++;
}
console.log(`    ${cues.length} cue(s)`);

// ---------------------------------------------------------------- 5. assets
step(5, "Assets");
fs.copyFileSync(cachedAudio, path.join(ASSET_DIR, "vo.mp3"));
console.log(`    ${path.join(ASSET_DIR, "vo.mp3")}`);

// Ship GSAP locally. The CDN fails to resolve in the render sandbox, and a
// missing gsap leaves every beat visible at once.
const gsapSrc = require.resolve("gsap/dist/gsap.min.js", { paths: [process.cwd()] });
fs.copyFileSync(gsapSrc, path.join(ASSET_DIR, "gsap.min.js"));
console.log(`    ${path.join(ASSET_DIR, "gsap.min.js")}`);

// Lucide icon paths, inlined so the SVG needs no runtime library
const iconNodes = require("lucide-static/icon-nodes.json");
const iconSvg = (name, cls = "tile-icon") => {
  const nodes = iconNodes[name];
  if (!nodes) return "";
  const inner = nodes
    .map(([tag, attrs]) =>
      `<${tag} ${Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ")}></${tag}>`,
    )
    .join("");
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
};

// ---------------------------------------------------------------- 6. html
step(6, "Composition");

const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// {braces} mark the accent-coloured run
const accent = (text = "") =>
  esc(text).replace(/\{([^}]*)\}/g, '<span class="accent">$1</span>');

const beats = (spec.beats ?? []).map((b, i) => ({
  ...b,
  index: i,
  from: b.fromSeconds,
  to: b.toSeconds,
}));

const beatHtml = beats
  .map((b, i) => {
    const tiles = (b.tiles ?? b.cards ?? [])
      .map(
        (t) =>
          `<div class="tile-box">${iconSvg(t.icon)}<div class="tile-label">${esc(t.label ?? t.title)}</div></div>`,
      )
      .join("");

    const widget =
      b.widget === "url"
        ? `<div class="url-bar"><span class="url-text" id="url-${i}"></span><span class="caret">|</span></div>`
        : b.widget === "progress"
          ? `<div class="bar-track"><div class="bar-fill" id="bar-${i}"></div></div>`
          : (b.widget === "tiles" || b.widget === "cards") && tiles
            ? `<div class="tiles-row">${tiles}</div>`
            : b.widget === "brand"
              ? `<div class="brand">Khan<span class="accent">PDF</span></div><div class="brand-url">khanpdf.com</div>`
              : "";

    return `    <div class="beat" id="beat-${i}">
      ${b.step ? `<div class="badge-step">STEP ${b.step}</div>` : ""}
      <div class="card-title">${accent(b.stamp ?? b.title ?? "")}</div>
      ${b.sub ? `<div class="card-sub">${esc(b.sub)}</div>` : ""}
      ${widget}
    </div>`;
  })
  .join("\n");

// Captions page in groups — rendering all words at once overflows the frame.
const pages = [];
{
  let cur = [];
  for (const w of words) {
    if (cur.length) {
      const prev = cur.at(-1);
      const sentenceEnded = /[.!?]$/.test(prev.word);
      if (sentenceEnded || cur.length >= 4 || w.start - prev.end > 0.45) {
        pages.push(cur);
        cur = [];
      }
    }
    cur.push(w);
  }
  if (cur.length) pages.push(cur);
}

let wordIndex = 0;
const pageMeta = pages.map((p, pi) => {
  const ids = p.map(() => `w${wordIndex++}`);
  return { page: p, ids, index: pi, start: p[0].start, end: p.at(-1).end };
});

const captionHtml = pageMeta
  .map(
    (pm) =>
      `<div class="caption-page" id="page-${pm.index}">${pm.page
        .map((w, i) => `<span class="caption-word" id="${pm.ids[i]}">${esc(w.word)}</span>`)
        .join("")}</div>`,
  )
  .join("\n      ");

const cueHtml = cues
  .map(
    (c, i) =>
      `<div class="cue cue-${c.tone}" id="cue-${i}">${iconSvg(c.icon, "cue-icon")}<span>${esc(c.label)}</span></div>`,
  )
  .join("\n      ");

// --- GSAP timeline -----------------------------------------------------------
const tl = [];
beats.forEach((b, i) => {
  tl.push(`    tl.set("#beat-${i}", { autoAlpha: 0 }, 0);`);
  tl.push(
    `    tl.to("#beat-${i}", { duration: 0.35, autoAlpha: 1, y: 0, ease: "power3.out" }, ${b.from});`,
  );
  tl.push(
    `    tl.to("#beat-${i}", { duration: 0.3, autoAlpha: 0, ease: "power2.in" }, ${Math.max(b.from, b.to - 0.3)});`,
  );
  // only when the beat actually has tiles, or GSAP warns on a dead selector
  if ((b.tiles ?? b.cards ?? []).length > 0) {
    tl.push(
      `    tl.from("#beat-${i} .tile-box", { duration: 0.4, y: 40, autoAlpha: 0, scale: 0.9, stagger: 0.12, ease: "back.out(1.4)" }, ${b.from + 0.25});`,
    );
  }
  if (b.widget === "progress") {
    tl.push(`    tl.set("#bar-${i}", { width: "0%" }, 0);`);
    tl.push(
      `    tl.to("#bar-${i}", { duration: ${(b.to - b.from - 0.6).toFixed(2)}, width: "100%", ease: "power1.inOut" }, ${b.from + 0.3});`,
    );
  }
  if (b.widget === "url" && b.url) {
    // typewriter: step the text content, which GSAP drives via an object proxy
    tl.push(`    typeUrl(tl, "#url-${i}", ${JSON.stringify(b.url)}, ${b.from + 0.3}, ${(Math.min(1.6, b.to - b.from - 0.5)).toFixed(2)});`);
  }
});

// caption pages: one visible at a time, words popping inside it
pageMeta.forEach((pm, pi) => {
  const next = pageMeta[pi + 1];
  const hideAt = next ? next.start - 0.08 : Math.min(duration, pm.end + 0.6);
  tl.push(`    tl.set("#page-${pi}", { autoAlpha: 0 }, 0);`);
  tl.push(
    `    tl.to("#page-${pi}", { duration: 0.12, autoAlpha: 1, ease: "power2.out" }, ${Math.max(0, pm.start - 0.1).toFixed(2)});`,
  );
  tl.push(
    `    tl.to("#page-${pi}", { duration: 0.12, autoAlpha: 0, ease: "power2.in" }, ${hideAt.toFixed(2)});`,
  );

  pm.page.forEach((w, wi) => {
    const id = pm.ids[wi];
    tl.push(
      `    tl.to("#${id}", { duration: 0.14, opacity: 1, scale: 1.15, color: "#FF550D", ease: "power2.out" }, ${w.start.toFixed(2)});`,
    );
    tl.push(
      `    tl.to("#${id}", { duration: 0.2, scale: 1, color: "#FFFFFF", ease: "power2.in" }, ${(w.end + 0.02).toFixed(2)});`,
    );
  });
});

// cues: never let one still be fading while the next arrives, or they overlap
cues.forEach((c, i) => {
  const next = cues[i + 1];
  const hold = Math.min(c.end + 0.7, next ? next.start - 0.1 : duration);
  tl.push(
    `    tl.fromTo("#cue-${i}", { autoAlpha: 0, y: 24, scale: 0.85 }, { duration: 0.22, autoAlpha: 1, y: 0, scale: 1, ease: "back.out(2)" }, ${c.start.toFixed(2)});`,
  );
  tl.push(
    `    tl.to("#cue-${i}", { duration: 0.2, autoAlpha: 0, ease: "power2.in" }, ${Math.max(c.start + 0.3, hold).toFixed(2)});`,
  );
});

// nod: pitch the head while a sentence is being spoken
const spans = [];
for (const w of words) {
  const last = spans.at(-1);
  if (last && w.start - last.end <= 0.35) last.end = w.end;
  else spans.push({ start: w.start, end: w.end });
}
spans.forEach((s) => {
  const cycles = Math.max(1, Math.round((s.end - s.start) * 2));
  for (let c = 0; c < cycles; c++) {
    const t = s.start + c * 0.5;
    if (t + 0.5 > duration) break;
    tl.push(`    tl.to("#botHead", { duration: 0.25, rotateX: 5, ease: "sine.inOut" }, ${t.toFixed(2)});`);
    tl.push(`    tl.to("#botHead", { duration: 0.25, rotateX: -5, ease: "sine.inOut" }, ${(t + 0.25).toFixed(2)});`);
  }
  tl.push(`    tl.to("#botHead", { duration: 0.2, rotateX: 0, ease: "sine.out" }, ${s.end.toFixed(2)});`);
});

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(spec.id)} — HyperFrames</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0B0F19;
    display: flex; justify-content: center; align-items: center;
    min-height: 100vh; overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  [data-composition-id="reel-main"] {
    width: 1080px; height: 1920px; position: relative;
    background: #131C2D; overflow: hidden;
  }
  .glow-left, .glow-right {
    position: absolute; width: 500px; height: 500px; pointer-events: none;
    background: radial-gradient(circle, rgba(255,85,13,0.18) 0%, rgba(19,28,45,0) 70%);
  }
  .glow-left  { top: 35%; left: -100px; }
  .glow-right { top: 40%; right: -100px; }

  .card-panel {
    position: absolute; top: 130px; left: 75px;
    width: 930px; height: 910px;
    border-radius: 44px; background: #FFFFFF;
    box-shadow: 0 34px 80px rgba(0,0,0,0.5);
    overflow: hidden; z-index: 10; color: #131C2D;
  }
  /* one beat fills the card; only one is visible at a time.
     hidden by default so a JS failure can't stack all of them */
  .beat {
    position: absolute; inset: 0; opacity: 0;
    padding: 60px;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    text-align: center;
  }
  .badge-step {
    font-size: 28px; font-weight: 800; letter-spacing: 3px;
    color: #FF550D; margin-bottom: 20px;
  }
  .card-title {
    font-size: 76px; font-weight: 900; line-height: 1.15;
    letter-spacing: -1.5px; margin-bottom: 18px;
  }
  .card-title .accent, .brand .accent { color: #FF550D; }
  .card-sub { font-size: 36px; color: #5A6678; font-weight: 600; line-height: 1.3; }

  .tiles-row { display: flex; gap: 24px; width: 100%; margin-top: 40px; }
  .tile-box {
    flex: 1; padding: 30px 18px; border-radius: 24px;
    background: #FBFCFE; border: 3px solid #E3E7EE;
    display: flex; flex-direction: column; align-items: center; gap: 16px;
  }
  .tile-icon { width: 64px; height: 64px; color: #FF550D; }
  .tile-label { font-size: 32px; font-weight: 800; color: #131C2D; }

  .url-bar {
    margin-top: 38px; width: 100%; padding: 26px 30px;
    border-radius: 20px; background: #F7F9FC; border: 3px solid #E3E7EE;
    font-family: "JetBrains Mono", Consolas, monospace; font-size: 32px;
    color: #131C2D; text-align: left; white-space: nowrap; overflow: hidden;
  }
  .caret { color: #FF550D; }

  .bar-track {
    margin-top: 44px; width: 100%; height: 22px; border-radius: 999px;
    background: #E3E7EE; overflow: hidden;
  }
  .bar-fill { width: 0%; height: 100%; background: #FF550D; }

  .brand { margin-top: 30px; font-size: 92px; font-weight: 900; letter-spacing: -3px; }
  .brand-url { margin-top: 8px; font-size: 44px; font-weight: 700; color: #FF550D; }

  .bot-wrapper {
    position: absolute; top: 1120px; left: 88px; width: 310px;
    z-index: 20; perspective: 900px;
    filter: drop-shadow(0 22px 40px rgba(0,0,0,0.6));
  }
  .bot-head { transform-origin: 50% 55%; position: relative; }
  .bot-head img { width: 100%; height: auto; display: block; }

  .cue-rail {
    position: absolute; top: 1180px; left: 440px; right: 60px;
    display: flex; flex-direction: column; align-items: flex-start;
    gap: 14px; z-index: 25;
  }
  .cue {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 24px; border-radius: 999px;
    background: rgba(10,16,28,0.92); color: #fff;
    font-size: 32px; font-weight: 800; white-space: nowrap;
    opacity: 0; position: absolute;
  }
  .cue-icon { width: 44px; height: 44px; }
  .cue-good    { border: 3px solid #FF550D; }
  .cue-good .cue-icon    { color: #FF550D; }
  .cue-danger  { border: 3px solid #FF4D4D; }
  .cue-danger .cue-icon  { color: #FF4D4D; }
  .cue-danger span { text-decoration: line-through; }
  .cue-neutral { border: 3px solid #FFFFFF; }
  .cue-neutral .cue-icon { color: #FFFFFF; }

  .caption-container {
    position: absolute; top: 1540px; left: 60px; right: 60px;
    height: 240px; z-index: 30;
  }
  /* pages stack in the same box; one is visible at a time */
  .caption-page {
    position: absolute; inset: 0; opacity: 0;
    display: flex; flex-wrap: wrap;
    justify-content: center; align-content: flex-start;
    gap: 10px 20px;
  }
  .caption-word {
    display: inline-block;
    font-family: "Arial Black", -apple-system, sans-serif;
    font-size: 82px; font-weight: 900; letter-spacing: -2px;
    text-transform: uppercase; color: #FFFFFF; opacity: 0.25;
    transform-origin: 50% 50%;
    text-shadow: 0 4px 12px rgba(0,0,0,0.7);
  }
</style>
</head>
<body>

<div data-composition-id="reel-main" data-width="1080" data-height="1920" data-fps="${FPS}" data-duration="${duration}">
  <div class="glow-left"></div>
  <div class="glow-right"></div>

  <!-- id is required: the renderer discovers media by id, and without it the
       render is silent (hyperframes lint: media_missing_id). -->
  <audio id="vo" src="assets/vo.mp3" data-start="0" data-has-audio="true" data-volume="1"></audio>

  <div class="card-panel">
${beatHtml}
  </div>

  <div class="bot-wrapper">
    <div class="bot-head" id="botHead">
      <img src="assets/bot_large.png" alt="">
    </div>
  </div>

  <div class="cue-rail">
      ${cueHtml}
  </div>

  <div class="caption-container">
      ${captionHtml}
  </div>
</div>

<script src="assets/gsap.min.js"></script>
<script>
  window.__timelines = window.__timelines || {};
  const tl = gsap.timeline({ paused: true });

  // Typewriter: GSAP tweens a counter, we write the substring each update.
  function typeUrl(tl, sel, text, at, dur) {
    const el = document.querySelector(sel);
    const state = { n: 0 };
    tl.to(state, {
      duration: dur,
      n: text.length,
      ease: "none",
      onUpdate: () => { el.textContent = text.slice(0, Math.round(state.n)); }
    }, at);
  }

${tl.join("\n")}

  window.__timelines["reel-main"] = tl;
</script>
</body>
</html>
`;

const htmlPath = path.join(COMP_DIR, "index.html");
fs.writeFileSync(htmlPath, html);
console.log(`    ${htmlPath}`);
console.log(`    ${beats.length} beats, ${words.length} caption words, ${cues.length} cues`);

// ---------------------------------------------------------------- 7. check
step(7, "Check");
const check = run(NPX, ["hyperframes", "check", COMP_DIR], { shell: true });
const checkOut = `${check.stdout || ""}${check.stderr || ""}`;
for (const line of checkOut.split("\n")) {
  if (/^(Lint|Runtime|Layout|Motion|Contrast|Craft|Audio)/.test(line.trim()) ||
      /◇|✗|error|warning|audio_none/i.test(line)) {
    if (line.trim() && !line.includes("[hyperframes] check:")) console.log(`    ${line.trim()}`);
  }
}
if (check.status !== 0) fail("hyperframes check failed");

if (noRender) {
  console.log("\nHTML written; skipping render (--no-render).");
  process.exit(0);
}

// ---------------------------------------------------------------- 8. render
step(8, "Render");
const outPath = path.join(OUT_DIR, `${spec.id}.mp4`);
const render = run(NPX, ["hyperframes", "render", COMP_DIR, "-o", outPath], {
  stdio: "inherit",
  shell: true,
});
if (render.status !== 0 || !fs.existsSync(outPath)) fail("hyperframes render failed");

console.log(`\nDONE  ${outPath}`);
