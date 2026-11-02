// Generate a HyperFrames composition from a JSON spec, then check and render.
//
//   node make-hyper.mjs video-specs/tutorial-61s.json
//   node make-hyper.mjs <spec> --no-render        write HTML only
//   node make-hyper.mjs <spec> --force            re-run TTS even if cached
//
// A spec either supplies its own audio + transcript:
//     "audioFile": "mp3/audio.mp3", "transcriptFile": "transcriptionasJSON/audio.json"
// or a script to synthesise, which is cached on a hash of script + voice.
//
// Visual system follows report.txt: warm paper, one accent, caption at the top
// in two tones, a stamped display line, monospace micro-labels, grain over all.
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
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", ...opts });

const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const duration = spec.durationSeconds;
const speed = spec.speed ?? 1;
for (const d of [ASSET_DIR, CACHE_DIR, OUT_DIR]) fs.mkdirSync(d, { recursive: true });

// ---------------------------------------------------------------- 1. audio
step(1, "Audio");
let sourceAudio;
let sourceWords;

if (spec.audioFile && spec.transcriptFile) {
  sourceAudio = spec.audioFile;
  sourceWords = spec.transcriptFile;
  if (!fs.existsSync(sourceAudio)) fail(`Missing audio: ${sourceAudio}`);
  if (!fs.existsSync(sourceWords)) fail(`Missing transcript: ${sourceWords}`);
  console.log(`    supplied  ${sourceAudio}`);
  console.log(`    supplied  ${sourceWords}`);
} else {
  const hash = crypto
    .createHash("sha1")
    .update(JSON.stringify({ script: spec.script, voice: spec.voice }))
    .digest("hex")
    .slice(0, 12);
  sourceAudio = path.join(CACHE_DIR, `${hash}.mp3`);
  sourceWords = path.join(CACHE_DIR, `${hash}.json`);

  if (fs.existsSync(sourceAudio) && !force) {
    console.log(`    cached (${hash}) — no credits spent`);
  } else {
    const body = { text: spec.script, model_id: spec.voice?.modelId ?? "eleven_v4" };
    if (spec.voice?.filterPreset) body.audio_effects = { filter_preset_id: spec.voice.filterPreset };
    const res = run(
      NPX,
      ["-y", "@elevenlabs/cli@latest", "text-to-speech", "convert", "--voice-id",
       spec.voice?.voiceId ?? "JBFqnCBsd6RMkjVDRZzb", "--json", "-", "-o", sourceAudio],
      { input: JSON.stringify(body), shell: true },
    );
    if (res.status !== 0 || !fs.existsSync(sourceAudio)) {
      fail(`TTS failed (status ${res.status})\n${res.stderr || res.stdout || "no output"}`);
    }
    console.log(`    generated -> ${sourceAudio}`);
  }
  if (!fs.existsSync(sourceWords) || force) {
    const res = run("node", ["groq-transcription.js", sourceAudio], { stdio: "pipe" });
    if (res.status !== 0) fail(`Transcription failed\n${res.stderr || res.stdout}`);
    const produced = path.join("transcriptionasJSON", `${path.parse(sourceAudio).name}.json`);
    if (!fs.existsSync(produced)) fail(`Expected transcript at ${produced}`);
    fs.copyFileSync(produced, sourceWords);
  }
}

// ---------------------------------------------------------------- 2. words
step(2, "Transcript");
const transcript = JSON.parse(fs.readFileSync(sourceWords, "utf8"));
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
const words = transcript.words.map((w) => ({
  word: applyRules(w.word),
  start: w.start / speed,
  end: w.end / speed,
}));
console.log(`    ${words.length} words, ends at ${words.at(-1).end.toFixed(2)}s${fixes ? ` (${fixes} brand fix)` : ""}`);
if (words.at(-1).end > duration) console.log(`    WARNING: speech runs past ${duration}s`);

// ---------------------------------------------------------------- 3. cues
step(3, "Word cues");
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
  // keep them from crowding: at least 1.2s apart
  if (cues.length && w.start - cues.at(-1).start < 1.2) continue;
  cues.push({ start: w.start, end: phraseHit ? next.end : w.end, ...hit });
  if (phraseHit) i++;
}
console.log(`    ${cues.length} cue(s)`);

// ---------------------------------------------------------------- 4. assets
step(4, "Assets");
fs.copyFileSync(sourceAudio, path.join(ASSET_DIR, "vo.mp3"));
const gsapSrc = require.resolve("gsap/dist/gsap.min.js", { paths: [process.cwd()] });
fs.copyFileSync(gsapSrc, path.join(ASSET_DIR, "gsap.min.js"));
console.log(`    vo.mp3, gsap.min.js`);

const iconNodes = require("lucide-static/icon-nodes.json");
const icon = (name, cls) => {
  const nodes = iconNodes[name];
  if (!nodes) return "";
  const inner = nodes
    .map(([t, a]) => `<${t} ${Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(" ")}></${t}>`)
    .join("");
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
};

// ---------------------------------------------------------------- 5. html
step(5, "Composition");
const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const accent = (t = "") => esc(t).replace(/\{([^}]*)\}/g, '<span class="hot">$1</span>');

const beats = (spec.beats ?? []).map((b, i) => ({ ...b, i, from: b.fromSeconds, to: b.toSeconds }));

const widgetHtml = (b, i) => {
  switch (b.widget) {
    case "statement":
      return `${b.lead ? `<div class="lead">${esc(b.lead)}</div>` : ""}`;
    case "list":
      return `<div class="list">${(b.items ?? [])
        .map((it) => `<div class="row">${icon(it.icon, "row-icon")}<span>${esc(it.label)}</span></div>`)
        .join("")}</div>`;
    case "cards":
      return `<div class="cards">${(b.cards ?? [])
        .map(
          (c) =>
            `<div class="card ${c.tone === "danger" ? "bad" : ""}">${icon(c.icon, "card-icon")}<div class="card-t">${esc(c.title)}</div><div class="mono">// ${esc(c.note ?? "")}</div></div>`,
        )
        .join("")}</div>`;
    case "path":
      return `<div class="path">${icon("folder", "path-icon")}<span class="mono-lg">${esc(b.path)}</span></div>`;
    case "checklist":
      return `<div class="checks">${(b.items ?? [])
        .map(
          (it) =>
            `<div class="check"><div class="box">${icon("check", "check-icon")}</div><div><div class="check-t">${esc(it.label)}</div><div class="mono">// ${esc(it.note ?? "")}</div></div></div>`,
        )
        .join("")}</div>`;
    case "prompt":
      return `<div class="prompt"><span class="mono-lg" id="pr-${i}"></span><span class="caret">|</span></div>`;
    case "cta":
      return `<div class="stat">${esc(b.stat ?? "")}</div><div class="mono-lg">${esc(b.statLabel ?? "")}</div>`;
    default:
      return "";
  }
};

const beatHtml = beats
  .map(
    (b, i) => `    <div class="beat" id="b${i}">
      <div class="kicker mono">// ${String(i + 1).padStart(2, "0")} · ${esc(b.kicker ?? "")}</div>
      <div class="stamp-row">
        <div class="stamp">${accent(b.stamp ?? "")}</div>
        ${b.step ? `<div class="step">${b.step}</div>` : ""}
      </div>
      ${widgetHtml(b, i)}
      ${b.sub ? `<div class="sub">${esc(b.sub)}</div>` : ""}
    </div>`,
  )
  .join("\n");

// caption pages
const isCue = (w) => cues.some((c) => Math.abs(c.start - w.start) < 0.06);
const pages = [];
{
  let cur = [];
  for (const w of words) {
    if (cur.length) {
      const prev = cur.at(-1);
      // break on sentence end only — commas produced one-word pages that
      // flashed by under the 0.40s readability floor
      if (/[.!?]$/.test(prev.word) || cur.length >= 4 || w.start - prev.end > 0.5) {
        pages.push(cur);
        cur = [];
      }
    }
    cur.push(w);
  }
  if (cur.length) pages.push(cur);

  // merge any page too brief to read into the one after it
  const MIN = 0.55;
  for (let i = 0; i < pages.length - 1; ) {
    const span = pages[i].at(-1).end - pages[i][0].start;
    if (span < MIN && pages[i].length + pages[i + 1].length <= 6) {
      pages[i] = pages[i].concat(pages[i + 1]);
      pages.splice(i + 1, 1);
    } else i++;
  }
}
let wi = 0;
const pageMeta = pages.map((p, pi) => ({
  page: p,
  ids: p.map(() => `w${wi++}`),
  index: pi,
  start: p[0].start,
  end: p.at(-1).end,
}));

const captionHtml = pageMeta
  .map(
    (pm) =>
      `<div class="cap-page" id="cp${pm.index}">${pm.page
        .map((w, k) => `<span class="cap ${isCue(w) ? "key" : ""}" id="${pm.ids[k]}">${esc(w.word)}</span>`)
        .join("")}</div>`,
  )
  .join("\n      ");

const cueHtml = cues
  .map((c, i) => `<div class="cue ${c.tone}" id="cu${i}">${icon(c.icon, "cue-icon")}<span>${esc(c.label)}</span></div>`)
  .join("\n      ");

// --- timeline ---------------------------------------------------------------
const tl = [];
beats.forEach((b, i) => {
  tl.push(`    tl.set("#b${i}", { autoAlpha: 0 }, 0);`);
  tl.push(`    tl.to("#b${i}", { duration: 0.3, autoAlpha: 1, ease: "power2.out" }, ${b.from});`);
  tl.push(`    tl.to("#b${i}", { duration: 0.25, autoAlpha: 0, ease: "power2.in" }, ${Math.max(b.from, b.to - 0.25)});`);
  tl.push(`    tl.from("#b${i} .stamp", { duration: 0.3, scale: 0.86, autoAlpha: 0, ease: "back.out(2)" }, ${b.from + 0.1});`);

  const groups = [[".row", 0.1], [".card", 0.12], [".check", 0.1]];
  for (const [sel, stag] of groups) {
    const count =
      sel === ".row" ? (b.items ?? []).length && b.widget === "list" ? b.items.length : 0
      : sel === ".card" ? (b.cards ?? []).length
      : b.widget === "checklist" ? (b.items ?? []).length : 0;
    if (count > 0) {
      tl.push(
        `    tl.from("#b${i} ${sel}", { duration: 0.34, y: 30, autoAlpha: 0, scale: 0.94, stagger: ${stag}, ease: "back.out(1.5)" }, ${b.from + 0.3});`,
      );
    }
  }
  if (b.widget === "prompt" && b.prompt) {
    tl.push(`    typeText(tl, "#pr-${i}", ${JSON.stringify(b.prompt)}, ${b.from + 0.35}, ${Math.min(2.2, b.to - b.from - 0.7).toFixed(2)});`);
  }
  if (b.widget === "cta") {
    tl.push(`    tl.from("#b${i} .stat", { duration: 0.5, scale: 0.7, autoAlpha: 0, ease: "back.out(2)" }, ${b.from + 0.4});`);
  }
});

pageMeta.forEach((pm, pi) => {
  const next = pageMeta[pi + 1];
  const hide = next ? next.start - 0.06 : Math.min(duration, pm.end + 0.5);
  tl.push(`    tl.set("#cp${pi}", { autoAlpha: 0 }, 0);`);
  tl.push(`    tl.to("#cp${pi}", { duration: 0.1, autoAlpha: 1 }, ${Math.max(0, pm.start - 0.08).toFixed(2)});`);
  tl.push(`    tl.to("#cp${pi}", { duration: 0.1, autoAlpha: 0 }, ${hide.toFixed(2)});`);
  pm.page.forEach((w, k) => {
    const lit = isCue(w) ? "#F83820" : "#0C0A08";
    tl.push(`    tl.to("#${pm.ids[k]}", { duration: 0.12, color: "${lit}", ease: "power2.out" }, ${w.start.toFixed(2)});`);
  });
});

cues.forEach((c, i) => {
  const next = cues[i + 1];
  const hold = Math.min(c.end + 0.9, next ? next.start - 0.15 : duration);
  tl.push(`    tl.fromTo("#cu${i}", { autoAlpha: 0, y: 18, scale: 0.9 }, { duration: 0.2, autoAlpha: 1, y: 0, scale: 1, ease: "back.out(2)" }, ${c.start.toFixed(2)});`);
  tl.push(`    tl.to("#cu${i}", { duration: 0.18, autoAlpha: 0 }, ${Math.max(c.start + 0.4, hold).toFixed(2)});`);
});

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(spec.id)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background:#111; display:flex; justify-content:center; align-items:center; min-height:100vh; overflow:hidden; }

  /* report.txt palette */
  :root {
    --paper:#ECEAE5; --ink:#0C0A08; --hot:#F83820; --muted:#AEACA6;
    --card:#FBFAF7; --line:#DCD9D2;
  }
  [data-composition-id="reel-main"] {
    width:1080px; height:1920px; position:relative;
    background:var(--paper); overflow:hidden;
    font-family:Inter, sans-serif; color:var(--ink);
  }

  /* four type roles */
  .mono { font-family:"JetBrains Mono",monospace; font-size:26px; letter-spacing:2px; color:var(--muted); }
  .mono-lg { font-family:"JetBrains Mono",monospace; font-size:40px; color:var(--ink); }
  .stamp {
    font-family:"League Gothic","Archivo Black",sans-serif; font-size:92px; line-height:1;
    letter-spacing:1px; text-transform:uppercase;
    border:5px solid var(--hot); border-radius:8px; padding:14px 26px 8px;
    transform:rotate(-1.4deg); display:inline-block;
  }
  .hot { color:var(--hot); }

  /* caption at the TOP, two tones */
  .cap-box { position:absolute; top:230px; left:120px; right:120px; height:260px; z-index:30; }
  .cap-page { position:absolute; inset:0; opacity:0; display:flex; flex-wrap:wrap; align-content:flex-start; gap:10px 26px; }
  .cap { font-size:76px; font-weight:800; letter-spacing:-2px; color:#6E6A63; }
  .cap.key { font-family:"Playfair Display",serif; font-style:italic; font-weight:700; font-size:84px; color:#D9A99F; letter-spacing:0; }

  /* the stage */
  .beat {
    position:absolute; top:560px; left:120px; right:120px; height:900px;
    opacity:0; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; gap:28px;
  }
  .kicker { margin-bottom:-10px; }
  .stamp-row { display:flex; align-items:flex-end; gap:28px; }
  .step {
    width:86px; height:86px; border-radius:20px; background:var(--ink); color:#fff;
    font-family:"League Gothic","Archivo Black",sans-serif; font-size:56px;
    display:flex; align-items:center; justify-content:center; padding-top:6px;
  }
  .lead { font-size:62px; font-weight:800; line-height:1.14; letter-spacing:-1px; }
  .sub { font-size:36px; color:#5A6678; font-weight:600; line-height:1.3; }

  .list { display:flex; flex-direction:column; gap:16px; width:100%; }
  .row {
    display:flex; align-items:center; gap:22px; width:100%;
    background:var(--card); border:3px solid var(--line); border-radius:22px; padding:20px 26px;
    font-size:40px; font-weight:800;
  }
  .row-icon { width:52px; height:52px; color:var(--hot); flex:0 0 auto; }

  .cards { display:flex; gap:24px; width:100%; }
  .card {
    flex:1; background:var(--card); border:3px solid var(--line); border-radius:28px;
    padding:30px 26px; display:flex; flex-direction:column; gap:12px;
  }
  .card.bad { border-color:#E5B4AC; }
  .card-icon { width:64px; height:64px; color:var(--hot); }
  .card.bad .card-icon { color:#C0392B; }
  .card-t { font-size:44px; font-weight:800; }

  .path {
    display:flex; align-items:center; gap:20px; width:100%;
    background:var(--card); border:3px solid var(--line); border-radius:22px; padding:26px 30px;
  }
  .path-icon { width:56px; height:56px; color:var(--hot); }

  .checks { display:flex; flex-direction:column; gap:14px; width:100%; }
  .check { display:flex; align-items:center; gap:20px; }
  .box {
    width:62px; height:62px; border-radius:14px; background:var(--ink);
    display:flex; align-items:center; justify-content:center; flex:0 0 auto;
  }
  .check-icon { width:38px; height:38px; color:#fff; }
  .check-t { font-size:40px; font-weight:800; }

  .prompt {
    display:flex; align-items:center; width:100%;
    background:var(--card); border:3px solid var(--line); border-radius:22px;
    padding:28px 30px; white-space:nowrap; overflow:hidden;
  }
  .caret { color:var(--hot); font-family:"JetBrains Mono",monospace; font-size:40px; }

  .stat { font-family:"League Gothic","Archivo Black",sans-serif; font-size:220px; line-height:0.9; color:var(--hot); }

  /* cue chips, bottom strip */
  .cue-strip { position:absolute; top:1500px; left:120px; right:120px; height:200px; z-index:25;
    display:flex; align-items:center; }
  .cue {
    position:absolute; opacity:0; display:flex; align-items:center; gap:16px;
    background:var(--ink); color:#fff; border-radius:999px; padding:18px 32px;
    font-size:40px; font-weight:800; white-space:nowrap;
  }
  .cue-icon { width:52px; height:52px; }
  .cue.good .cue-icon { color:var(--hot); }
  .cue.danger .cue-icon { color:#FF6B5A; }
  .cue.danger span { text-decoration:line-through; }
  .cue.neutral .cue-icon { color:#fff; }

  /* paper grain over everything */
  .grain { position:absolute; inset:0; pointer-events:none; mix-blend-mode:multiply; opacity:0.30; }
</style>
</head>
<body>

<div data-composition-id="reel-main" data-width="1080" data-height="1920" data-fps="${FPS}" data-duration="${duration}">

  <audio id="vo" src="assets/vo.mp3" data-start="0" data-has-audio="true" data-volume="1"></audio>

  <div class="cap-box">
      ${captionHtml}
  </div>

${beatHtml}

  <div class="cue-strip">
      ${cueHtml}
  </div>

  <svg class="grain">
    <filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
    <rect width="100%" height="100%" filter="url(#g)" opacity="0.5"/>
  </svg>
</div>

<script src="assets/gsap.min.js"></script>
<script>
  window.__timelines = window.__timelines || {};
  const tl = gsap.timeline({ paused: true });

  function typeText(tl, sel, text, at, dur) {
    const el = document.querySelector(sel);
    const s = { n: 0 };
    tl.to(s, { duration: dur, n: text.length, ease: "none",
      onUpdate: () => { el.textContent = text.slice(0, Math.round(s.n)); } }, at);
  }

${tl.join("\n")}

  window.__timelines["reel-main"] = tl;
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(COMP_DIR, "index.html"), html);
console.log(`    ${beats.length} beats, ${pageMeta.length} caption pages, ${cues.length} cues`);

// ---------------------------------------------------------------- 6. check
step(6, "Check");
const check = run(NPX, ["hyperframes", "check", COMP_DIR], { shell: true });
const out = `${check.stdout || ""}${check.stderr || ""}`;
for (const line of out.split("\n")) {
  const t = line.trim();
  if (!t || t.includes("[hyperframes] check:")) continue;
  if (/^(Lint|Runtime|Layout|Motion|Contrast|Craft|Audio|Snapshots)$/.test(t) || /◇|✗|⚠|error\(s\)/.test(t)) {
    console.log(`    ${t}`);
  }
}
if (check.status !== 0) fail("hyperframes check failed");

if (noRender) {
  console.log("\nHTML written; skipping render (--no-render).");
  process.exit(0);
}

// ---------------------------------------------------------------- 7. render
step(7, "Render");
const outPath = path.join(OUT_DIR, `${spec.id}.mp4`);
const render = run(NPX, ["hyperframes", "render", COMP_DIR, "-o", outPath], {
  stdio: "inherit",
  shell: true,
});
if (render.status !== 0 || !fs.existsSync(outPath)) fail("hyperframes render failed");
console.log(`\nDONE  ${outPath}`);
