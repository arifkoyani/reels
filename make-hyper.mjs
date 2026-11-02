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

// the sound library and generated plates travel with the composition
const copyDir = (from, to) => {
  if (!fs.existsSync(from)) return 0;
  fs.mkdirSync(to, { recursive: true });
  const files = fs.readdirSync(from).filter((f) => !f.startsWith("."));
  for (const f of files) fs.copyFileSync(path.join(from, f), path.join(to, f));
  return files.length;
};
const nSfx = copyDir(path.join("public", "sfx"), path.join(ASSET_DIR, "sfx"));
const nShots = copyDir(path.join("public", "shots"), path.join(ASSET_DIR, "shots"));
const nReels = copyDir(path.join("public", "reels"), path.join(ASSET_DIR, "reels"));

// public/images is browsed recursively and flattened into assets/img under
// slugged names, so a spec can say image:"feedback" and never carry a path
// with spaces or brackets into an html src.
const slug = (f) =>
  f
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const imageMap = new Map();
const walkImages = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { walkImages(full); continue; }
    const ext = path.extname(e.name).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".svg", ".webp"].includes(ext)) continue;
    const key = slug(e.name);
    const out = `${key}${ext}`;
    fs.copyFileSync(full, path.join(ASSET_DIR, "img", out));
    imageMap.set(key, `assets/img/${out}`);
  }
};
fs.mkdirSync(path.join(ASSET_DIR, "img"), { recursive: true });
walkImages(path.join("public", "images"));

const missingImages = new Set();
const imgSrc = (key) => {
  if (!key) return null;
  const hit = imageMap.get(slug(key));
  if (!hit) missingImages.add(key);
  return hit ?? null;
};
const img = (key, cls) => {
  const src = imgSrc(key);
  return src ? `<img class="${cls}" src="${src}" alt="">` : "";
};

console.log(
  `    vo.mp3, gsap.min.js, ${nSfx} sfx, ${nShots} shot(s), ${imageMap.size} image(s), ${nReels} reel(s)`,
);
console.log(`    images: ${[...imageMap.keys()].join(", ")}`);

// roughjs runs here at build time, so the page needs no runtime sketch library.
// Each annotation becomes a plain <path> that GSAP draws on via stroke-dashoffset.
const rough = (await import("roughjs/bundled/rough.esm.js")).default;
const roughGen = rough.generator();
const setsToPath = (sets) =>
  sets
    .filter((s) => s.type === "path")
    .map((s) =>
      s.ops
        .map((o) =>
          o.op === "move"
            ? `M${o.data.join(" ")}`
            : o.op === "bcurveTo"
              ? `C${o.data.join(" ")}`
              : `L${o.data.join(" ")}`,
        )
        .join(" "),
    )
    .join(" ");
const sketchEllipse = (cx, cy, w, h, seed = 7) =>
  setsToPath(roughGen.ellipse(cx, cy, w, h, { roughness: 2.1, strokeWidth: 9, seed }).sets);
const sketchLine = (x1, y1, x2, y2, seed = 11) =>
  setsToPath(roughGen.line(x1, y1, x2, y2, { roughness: 2.4, strokeWidth: 9, seed }).sets);

// every sound effect placed on the timeline, emitted as <audio data-start>
const sfxHits = [];
const sfx = (name, at, volume = 0.45) => {
  if (at < 0 || at > duration) return;
  sfxHits.push({ name, at: Number(at.toFixed(2)), volume });
};

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

// A real asset always beats a line icon: if the item names one in public/images
// it is drawn large, and the lucide glyph is only the fallback.
const figure = (it, kind) => {
  const src = imgSrc(it.image);
  return src
    ? `<div class="fig ${kind}-fig"><img src="${src}" alt="">${
        it.mark ? `<span class="mark">${img(it.mark, "mark-img")}</span>` : ""
      }</div>`
    : icon(it.icon, `${kind}-icon`);
};

// the reel itself, scrubbed by the timeline — muted, so it adds no sound bed
// A data-start video with no id is FROZEN in renders, exactly like <audio>.
const reelVideo = (b, cls, id) => {
  const r = b.reel;
  if (!r) return "";
  return `<video id="${id}" class="${cls}" src="assets/reels/${esc(r.file ?? "reel.mp4")}" muted data-has-audio="false" data-start="${(
    b.from - (r.offset ?? 0)
  ).toFixed(2)}" preload="auto"></video>`;
};

const widgetHtml = (b, i) => {
  switch (b.widget) {
    case "statement":
      return `${b.lead ? `<div class="lead">${esc(b.lead)}</div>` : ""}`;
    case "list":
      return `<div class="list">${(b.items ?? [])
        .map(
          (it) =>
            `<div class="row">${figure(it, "row")}<span>${esc(it.label)}</span>${
              it.num ? img(`number-${it.num}`, "row-num") : ""
            }</div>`,
        )
        .join("")}</div>`;
    case "cards":
      return `<div class="cards">${(b.cards ?? [])
        .map(
          (c) =>
            `<div class="card ${c.tone === "danger" ? "bad" : ""}">${figure(c, "card")}<div class="card-t">${esc(c.title)}</div><div class="mono">// ${esc(c.note ?? "")}</div></div>`,
        )
        .join("")}</div>`;
    case "path":
      return `<div class="path">${
        imgSrc(b.image) ? `<img class="path-img" src="${imgSrc(b.image)}" alt="">` : icon("folder", "path-icon")
      }<span class="mono-lg">${esc(b.path)}</span></div>`;
    case "checklist":
      return `<div class="checks">${(b.items ?? [])
        .map(
          (it) =>
            `<div class="check"><div class="box">${
              img("done", "box-img") || icon("check", "check-icon")
            }</div>${
              imgSrc(it.image) ? `<div class="check-thumb"><img src="${imgSrc(it.image)}" alt=""></div>` : ""
            }<div><div class="check-t">${esc(it.label)}</div><div class="mono">// ${esc(it.note ?? "")}</div></div></div>`,
        )
        .join("")}</div>`;
    case "prompt":
      return `<div class="prompt"><span class="mono-lg" id="pr-${i}"></span><span class="caret">▌</span></div>`;
    case "cta":
      return `<div class="cta-row"><div class="cta-text"><div class="stat">${esc(b.stat ?? "")}</div><div class="mono-lg">${esc(
        b.statLabel ?? "",
      )}</div></div>${
        b.reel ? `<div class="phone big"><div class="phone-screen">${reelVideo(b, "reel-vid", `rv${i}`)}</div></div>` : ""
      }</div>`;
    case "board":
      // cork plate from Kie.ai; the polaroids are CSS so count and content stay ours
      return `<div class="board">${(b.pins ?? [])
        .map(
          (p, k) =>
            `<div class="polaroid" style="--rot:${p.rot ?? 0}deg"><div class="tape"></div><div class="shot-slot">${
              p.reel
                ? `<video id="pv${i}-${k}" class="slot-vid" src="assets/reels/${esc(p.reel.file ?? "reel.mp4")}" muted data-has-audio="false" data-start="${(
                    b.from - (p.reel.offset ?? 0)
                  ).toFixed(2)}" preload="auto"></video>`
                : imgSrc(p.image)
                  ? `<img src="${imgSrc(p.image)}" alt="">`
                  : icon(p.icon ?? "image", "slot-icon")
            }</div><div class="polaroid-cap">${esc(p.label ?? "")}</div></div>`,
        )
        .join("")}${b.note ? `<div class="sticky">${esc(b.note)}</div>` : ""}</div>`;
    case "shot":
      return `<div class="shot">${
        imgSrc(b.image) ? `<img src="${imgSrc(b.image)}" alt="">` : `<img src="assets/shots/${esc(b.image)}" alt="">`
      }
        <span class="br tl"></span><span class="br tr"></span><span class="br bl"></span><span class="br br2"></span></div>`;
    case "phone":
      return `<div class="phone"><div class="phone-screen">${
        b.reel ? reelVideo(b, "reel-vid", `rv${i}`) : `<img src="${imgSrc(b.image) ?? `assets/shots/${esc(b.image)}`}" alt="">`
      }</div></div>`;
    case "vertical":
      return `<div class="vrow"><div class="vstack">${(b.lines ?? [])
        .map((l, k) => `<div class="vline${k === (b.hot ?? 1) ? " hot" : ""}">${esc(l)}</div>`)
        .join("")}</div></div>`;
    default:
      return "";
  }
};

// stage box the sketch paths are drawn against
const STAGE_W = 1080 - 2 * 120;
const STAGE_H = 1120; // must match REF_LAYOUT stageHeight or paths distort

const sketchFor = (b, i) => {
  if (!b.annotate) return "";
  const box = b.annotateBox ?? [STAGE_W / 2, STAGE_H * 0.64, STAGE_W * 0.96, STAGE_H * 0.52];
  const d =
    b.annotate === "underline"
      ? sketchLine(40, STAGE_H * 0.3, STAGE_W * 0.72, STAGE_H * 0.3, i + 3)
      : sketchEllipse(box[0], box[1], box[2], box[3], i + 3);
  return `<svg class="sketch" viewBox="0 0 ${STAGE_W} ${STAGE_H}" preserveAspectRatio="none"><path id="sk${i}" d="${d}"/></svg>`;
};

const beatHtml = beats
  .map(
    (b, i) => `    <div class="beat${b.surface === "cork" ? " on-cork" : ""}" id="b${i}">
      <div class="kicker mono">// ${String(i + 1).padStart(2, "0")} · ${esc(b.kicker ?? "")}</div>
      <div class="stamp-row">
        <div class="stamp">${accent(b.stamp ?? "")}</div>
        ${b.step ? `<div class="step">${img(`number-${b.step}`, "step-img") || b.step}</div>` : ""}
      </div>
      ${widgetHtml(b, i)}
      ${b.sub ? `<div class="sub">${esc(b.sub)}</div>` : ""}
      ${sketchFor(b, i)}
    </div>`,
  )
  .join("\n");

// full-bleed surfaces sit behind everything, one per beat that asks for one
const surfaceHtml = beats
  .map((b, i) => (b.surface === "cork" ? `  <div class="surface cork" id="sf${i}"></div>` : ""))
  .filter(Boolean)
  .join("\n");

// a word spoken over the cork surface needs light type, not ink
const corkWindows = beats.filter((b) => b.surface === "cork").map((b) => [b.from, b.to]);
const onDark = (w) => corkWindows.some(([a, z]) => w.start >= a && w.start < z);

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
        .map((w, k) => `<span class="cap ${isCue(w) ? "key" : ""}${onDark(w) ? " on-dark" : ""}" id="${pm.ids[k]}">${esc(w.word)}</span>`)
        .join("")}</div>`,
  )
  .join("\n      ");

const cueHtml = cues
  .map((c, i) => `<div class="cue ${c.tone}" id="cu${i}">${icon(c.icon, "cue-icon")}<span>${esc(c.label)}</span></div>`)
  .join("\n      ");

// --- timeline ---------------------------------------------------------------
// Pick n spoken-word moments inside a beat, spread across it, so n elements can
// each land on a different word rather than all arriving together.
const STOP = new Set(["the","a","an","to","it","its","and","of","your","you","my","is","in","on","with","for","that","this","every","all"]);

// Pick the moment each element should land. If the element's own label shares a
// word with the voiceover inside this beat, land on that word — so "Records the
// voiceover" appears exactly as "voiceover" is said. Otherwise spread evenly.
const wordSlots = (b, n, labels = []) => {
  const inBeat = words.filter((w) => w.start >= b.from + 0.2 && w.start < b.to - 0.15);
  if (inBeat.length === 0) {
    const span = Math.max(0.3, b.to - b.from - 0.6);
    return Array.from({ length: n }, (_, k) => b.from + 0.35 + (span * k) / Math.max(1, n));
  }

  const out = [];
  let cursor = -1; // keep matches moving forward through the sentence
  for (let k = 0; k < n; k++) {
    const keys = String(labels[k] ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOP.has(t));

    let hit = -1;
    for (let j = cursor + 1; j < inBeat.length && hit === -1; j++) {
      const w = norm(inBeat[j].word);
      if (keys.some((t) => w === t || w.startsWith(t) || t.startsWith(w))) hit = j;
    }
    if (hit === -1) hit = Math.min(inBeat.length - 1, Math.floor(((k + 0.5) / n) * inBeat.length));
    cursor = Math.max(cursor, hit);
    out.push(inBeat[hit].start);
  }

  out.sort((x, y) => x - y);
  // never let two elements share a moment
  for (let k = 1; k < out.length; k++) {
    if (out[k] - out[k - 1] < 0.18) out[k] = out[k - 1] + 0.18;
  }
  // and nothing may land so late it is gone before it can be read
  const last = b.to - 1.5; // a line needs ~0.5s + 0.3s a word before it leaves
  for (let k = out.length - 1; k >= 0; k--) {
    if (out[k] > last) out[k] = Math.max(b.from + 0.25, last - 0.18 * (out.length - 1 - k));
  }
  return out;
};

const tl = [];
beats.forEach((b, i) => {
  tl.push(`    tl.set("#b${i}", { autoAlpha: ${i === 0 ? 1 : 0} }, 0);`);
  if (i > 0) tl.push(`    tl.to("#b${i}", { duration: 0.3, autoAlpha: 1, ease: "power2.out" }, ${b.from});`);
  tl.push(`    tl.to("#b${i}", { duration: 0.25, autoAlpha: 0, ease: "power2.in" }, ${Math.max(b.from, b.to - 0.25)});`);
  if (i > 0) tl.push(`    tl.from("#b${i} .stamp", { duration: 0.3, scale: 0.86, autoAlpha: 0, ease: "back.out(2)" }, ${b.from + 0.1});`);

  // surface behind this beat
  if (b.surface === "cork") {
    tl.push(`    tl.set("#sf${i}", { autoAlpha: 0 }, 0);`);
    tl.push(`    tl.to("#sf${i}", { duration: 0.3, autoAlpha: 1 }, ${b.from});`);
    tl.push(`    tl.to("#sf${i}", { duration: 0.25, autoAlpha: 0 }, ${Math.max(b.from, b.to - 0.25)});`);
  }

  // scene cut + the stamp landing
  sfx("whoosh", b.from, 0.3);
  sfx("stamp", b.from + 0.1, 0.4);

  // Every element lands ON a spoken word, so nothing arrives at the same
  // moment and the graphic always tracks what is being said.
  const itemLabels = (b.items ?? []).map((x) => `${x.label ?? ""} ${x.note ?? ""}`);
  const groups = [
    [".row", b.widget === "list" ? (b.items ?? []).length : 0, "pop", itemLabels],
    [".card", (b.cards ?? []).length, "pop", (b.cards ?? []).map((c) => `${c.title ?? ""} ${c.note ?? ""}`)],
    [".check", b.widget === "checklist" ? (b.items ?? []).length : 0, "pop", itemLabels],
    [".polaroid", b.widget === "board" ? (b.pins ?? []).length : 0, "paper-pin", (b.pins ?? []).map((p) => p.label ?? "")],
    [".vline", b.widget === "vertical" ? (b.lines ?? []).length : 0, "swipe", b.lines ?? []],
  ];
  for (const [sel, count, hit, labels] of groups) {
    if (count <= 0) continue;
    const times = wordSlots(b, count, labels);
    for (let k = 0; k < count; k++) {
      // nth-of-type is 1-based
      const one = `#b${i} ${sel}:nth-of-type(${k + 1})`;
      const dir = k % 2 ? 1 : -1;
      // the first element of the first beat is already on screen at t=0, so
      // frame 0 is a real thumbnail instead of bare background
      if (i === 0 && k === 0) { sfx(hit, 0.05, 0.32); continue; }
      tl.push(
        `    tl.set("${one}", { autoAlpha: 0, y: 70, x: ${dir * 40}, scale: 0.78, rotate: ${dir * 4} }, 0);`,
      );
      tl.push(
        `    tl.to("${one}", { duration: 0.46, autoAlpha: 1, y: 0, x: 0, scale: 1, rotate: 0, ease: "back.out(2.6)" }, ${times[k].toFixed(2)});`,
      );
      // the supporting graphic gets its own kick a beat after its card lands
      const art = `${one} .fig, ${one} .row-icon, ${one} .card-icon, ${one} .box, ${one} .check-thumb, ${one} .row-num, ${one} .shot-slot`;
      tl.push(`    tl.set("${art}", { scale: 0, rotate: -35, transformOrigin: "50% 50%" }, 0);`);
      tl.push(
        `    tl.to("${art}", { duration: 0.5, scale: 1, rotate: 0, ease: "elastic.out(1, 0.62)" }, ${(times[k] + 0.08).toFixed(2)});`,
      );
      sfx(hit, times[k], 0.32);
    }
  }

  // the step number stamps itself in with the beat
  if (b.step) {
    tl.push(`    tl.set("#b${i} .step", { scale: 0, rotate: -28, transformOrigin: "50% 50%" }, 0);`);
    tl.push(
      `    tl.to("#b${i} .step", { duration: 0.55, scale: 1, rotate: 0, ease: "elastic.out(1, 0.6)" }, ${(b.from + 0.26).toFixed(2)});`,
    );
    sfx("pop", b.from + 0.26, 0.3);
  }

  // single-element widgets
  if (b.widget === "shot" || b.widget === "phone") {
    const sel = b.widget === "shot" ? ".shot" : ".phone";
    tl.push(
      `    tl.from("#b${i} ${sel}", { duration: 0.45, y: 40, autoAlpha: 0, scale: 0.92, ease: "back.out(1.6)" }, ${b.from + 0.3});`,
    );
    sfx("ui-click", b.from + 0.35, 0.4);
  }

  // the marker annotation draws itself on
  if (b.annotate) {
    tl.push(`    drawOn(tl, "#sk${i}", ${(b.from + 0.55).toFixed(2)}, 0.5);`);
    sfx("swipe", b.from + 0.55, 0.28);
  }
  if (b.widget === "prompt" && b.prompt) {
    const dur = Math.min(2.2, b.to - b.from - 0.7);
    const at = b.from + 0.35;
    tl.push(`    typeText(tl, "#pr-${i}", ${JSON.stringify(b.prompt)}, ${at}, ${dur.toFixed(2)});`);
    // the caret blinks while typing, then holds steady on the finished line
    tl.push(
      `    tl.to("#b${i} .caret", { duration: 0.22, opacity: 0, repeat: ${Math.round(dur / 0.44)}, yoyo: true, ease: "none" }, ${at});`,
    );
    tl.push(`    tl.set("#b${i} .caret", { opacity: 1 }, ${(at + dur).toFixed(2)});`);
    // keystrokes under the typing, not one click
    for (let t = 0; t < dur; t += 0.4) sfx("type", at + t, 0.3);
  }
  if (b.widget === "cta") {
    tl.push(`    tl.from("#b${i} .stat", { duration: 0.5, scale: 0.7, autoAlpha: 0, ease: "back.out(2)" }, ${b.from + 0.4});`);
    sfx("ding", b.from + 0.45, 0.5);
  }

  // a reel playing in its frame slides up as the beat opens
  if (b.reel || (b.pins ?? []).some((p) => p.reel)) {
    const sel = b.reel ? `#b${i} .phone` : `#b${i} .slot-vid`;
    tl.push(
      `    tl.from("${sel}", { duration: 0.55, y: 70, autoAlpha: 0, scale: 0.9, ease: "back.out(1.7)" }, ${(b.from + 0.3).toFixed(2)});`,
    );
    sfx("swipe", b.from + 0.3, 0.3);
  }
});

pageMeta.forEach((pm, pi) => {
  const next = pageMeta[pi + 1];
  const hide = next ? next.start - 0.06 : Math.min(duration, pm.end + 0.5);
  tl.push(`    tl.set("#cp${pi}", { autoAlpha: 0 }, 0);`);
  tl.push(`    tl.to("#cp${pi}", { duration: 0.1, autoAlpha: 1 }, ${Math.max(0, pm.start - 0.08).toFixed(2)});`);
  tl.push(`    tl.to("#cp${pi}", { duration: 0.1, autoAlpha: 0 }, ${hide.toFixed(2)});`);
  pm.page.forEach((w, k) => {
    const lit = isCue(w) ? "#F15430" : onDark(w) ? "#FFFFFF" : "#0C0A08";
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
    --paper:#ECEAE5; --ink:#0C0A08; --hot:#F83820; --muted:#8A8478;
    --card:#FBFAF7; --line:#DCD9D2;
  }
  [data-composition-id="reel-main"] {
    width:1080px; height:1920px; position:relative; overflow:hidden;
    background-color:#FFFFFF;
    background-image:
      linear-gradient(to right, rgba(16,20,28,0.17) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(16,20,28,0.17) 1px, transparent 1px);
    background-size:90px 90px;
    font-family:Inter, sans-serif; color:var(--ink);
  }

  /* four type roles */
  .mono { font-family:"JetBrains Mono",monospace; font-size:28px; letter-spacing:2px; color:var(--muted); }
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
  .cap.on-dark { color:#9A938A; }
  .cap.key { font-family:"Playfair Display",serif; font-style:italic; font-weight:700; font-size:84px; color:#A9604E; letter-spacing:0; }

  /* the stage */
  .beat {
    position:absolute; top:560px; left:120px; right:120px; height:900px;
    opacity:0; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; gap:28px;
  }
  .kicker { margin-bottom:-10px; }
  .stamp-row { display:flex; align-items:flex-end; gap:28px; }
  /* the number comes from public/images/numbering icons, not a filled square */
  .step {
    width:104px; height:104px; display:flex; align-items:center; justify-content:center;
    font-family:"League Gothic","Archivo Black",sans-serif; font-size:72px; color:var(--hot);
  }
  .step-img { width:104px; height:104px; object-fit:contain; }
  .lead { font-size:62px; font-weight:800; line-height:1.14; letter-spacing:-1px; }
  .sub { font-size:36px; color:#5A6678; font-weight:600; line-height:1.3; }

  /* a real asset from public/images, framed; the line icon is the fallback */
  .fig {
    position:relative; flex:0 0 auto; border-radius:18px; overflow:visible;
    display:flex; align-items:center; justify-content:center;
  }
  .fig img { display:block; width:100%; height:100%; object-fit:contain; }
  .mark { position:absolute; right:-18px; bottom:-18px; width:72px; height:72px; }
  .mark-img { width:100%; height:100%; object-fit:contain; }

  .list { display:flex; flex-direction:column; gap:18px; width:100%; }
  .row {
    display:flex; align-items:center; gap:28px; width:100%;
    background:var(--card); border:3px solid var(--line); border-radius:24px; padding:22px 30px;
    font-size:44px; font-weight:800;
  }
  .row-icon { width:84px; height:84px; color:var(--hot); flex:0 0 auto; }
  .row-fig { width:92px; height:92px; }
  .row-num { width:68px; height:68px; margin-left:auto; object-fit:contain; }

  .cards { display:flex; gap:26px; width:100%; }
  .card {
    flex:1; background:var(--card); border:3px solid var(--line); border-radius:28px;
    padding:28px 26px; display:flex; flex-direction:column; gap:14px; align-items:flex-start;
  }
  .card.bad { border-color:#E5B4AC; }
  .card-icon { width:112px; height:112px; color:var(--hot); }
  .card.bad .card-icon { color:#C0392B; }
  .card-fig {
    width:100%; height:230px; background:#fff; border:2px solid var(--line);
    border-radius:16px; overflow:hidden;
  }
  .card-fig img { object-fit:cover; }
  .card-t { font-size:46px; font-weight:800; line-height:1.1; }

  .path {
    display:flex; align-items:center; gap:26px; width:100%;
    background:var(--card); border:3px solid var(--line); border-radius:22px; padding:26px 32px;
  }
  .path-icon { width:88px; height:88px; color:var(--hot); }
  .path-img { width:120px; height:120px; object-fit:contain; flex:0 0 auto; }

  .checks { display:flex; flex-direction:column; gap:18px; width:100%; }
  .check { display:flex; align-items:center; gap:24px; }
  .box { width:76px; height:76px; display:flex; align-items:center; justify-content:center; flex:0 0 auto; }
  .box-img { width:76px; height:76px; object-fit:contain; }
  .check-icon { width:60px; height:60px; color:var(--hot); }
  .check-thumb {
    width:120px; height:84px; border:2px solid var(--line); border-radius:12px;
    overflow:hidden; background:#fff; flex:0 0 auto;
  }
  .check-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
  .check-t { font-size:42px; font-weight:800; }

  /* the prompt wraps instead of running off the stage, so the typing stays read-able */
  .prompt {
    display:block; width:100%;
    background:var(--card); border:3px solid var(--line); border-radius:22px;
    padding:30px 34px; min-height:200px;
  }
  .prompt .mono-lg {
    font-size:46px; line-height:1.34; white-space:pre-wrap; word-break:break-word;
  }
  .caret { color:var(--hot); font-family:"JetBrains Mono",monospace; font-size:46px; line-height:1.34; }

  .cta-row { display:flex; align-items:center; gap:40px; width:100%; }
  .cta-text { display:flex; flex-direction:column; }
  .stat { font-family:"League Gothic","Archivo Black",sans-serif; font-size:220px; line-height:0.9; color:var(--hot); }

  /* cork surface: the plate is generated art, the pinned cards are ours */
  .surface { position:absolute; inset:0; opacity:0; background-size:cover; background-position:center; }
  .surface.cork { background-image:url("assets/shots/cork-plate.png"); }
  .surface.cork::after { content:""; position:absolute; inset:0; background:rgba(12,10,8,0.58); }
  .on-cork .kicker, .on-cork .sub { color:#D9D5CC; }
  .on-cork .lead, .on-cork .check-t { color:#fff; }

  .board { display:grid; grid-template-columns:repeat(3,1fr); gap:26px; width:100%; }
  .polaroid {
    background:#FFFDF8; padding:14px 14px 46px; border-radius:4px;
    box-shadow:0 16px 30px rgba(0,0,0,0.45); transform:rotate(var(--rot));
    position:relative;
  }
  /* a strip of tape, not a pin head — nothing round and dark on the page */
  .tape {
    position:absolute; top:-16px; left:50%; width:96px; height:34px; margin-left:-48px;
    background:rgba(248,56,32,0.22); border:2px solid rgba(248,56,32,0.45);
    transform:rotate(-3deg);
  }
  .shot-slot {
    aspect-ratio:3/4; background:#F2F0EB; border-radius:2px; overflow:hidden;
    display:flex; align-items:center; justify-content:center;
  }
  .shot-slot img, .slot-vid { width:100%; height:100%; object-fit:cover; display:block; }
  .slot-icon { width:104px; height:104px; color:var(--hot); }
  .polaroid-cap {
    position:absolute; bottom:12px; left:0; right:0; text-align:center;
    font-family:"Playfair Display",serif; font-style:italic; font-size:30px; color:#2A2724;
  }
  .sticky {
    grid-column:2; align-self:center; justify-self:center;
    background:#F6E27A; padding:34px 28px; border-radius:3px;
    box-shadow:0 12px 24px rgba(0,0,0,0.4); transform:rotate(-2deg);
    font-family:"Playfair Display",serif; font-style:italic; font-size:56px; color:#2A2724;
  }

  /* a real screenshot with camera crop marks */
  .shot { position:relative; width:100%; }
  .shot img { width:100%; border-radius:10px; display:block; box-shadow:0 20px 40px rgba(0,0,0,0.3); }
  .br { position:absolute; width:46px; height:46px; border:6px solid var(--hot); }
  .br.tl { top:-12px; left:-12px; border-right:0; border-bottom:0; }
  .br.tr { top:-12px; right:-12px; border-left:0; border-bottom:0; }
  .br.bl { bottom:-12px; left:-12px; border-right:0; border-top:0; }
  .br.br2 { bottom:-12px; right:-12px; border-left:0; border-top:0; }

  .phone {
    width:420px; border:12px solid #1C1F26; border-radius:48px; flex:0 0 auto;
    box-shadow:0 26px 50px rgba(0,0,0,0.28); overflow:hidden; background:#1C1F26;
  }
  .phone.big { width:360px; border-width:12px; border-radius:44px; }
  .phone-screen { aspect-ratio:9/16; overflow:hidden; background:#000; }
  .phone-screen img, .reel-vid { width:100%; height:100%; object-fit:cover; display:block; }

  /* display caps stacked beside the subject */
  .vrow { display:flex; justify-content:flex-end; width:100%; }
  .vstack { display:flex; flex-direction:column; align-items:flex-start; line-height:0.88; }
  .vline { font-family:"League Gothic","Archivo Black",sans-serif; font-size:130px; color:var(--ink); }
  .vline.hot { color:var(--hot); }
  .on-cork .vline { color:#fff; }

  /* hand-drawn marker layer, paths generated by roughjs at build time */
  .sketch { position:absolute; inset:0; pointer-events:none; overflow:visible; z-index:40; }
  .sketch path { fill:none; stroke:#15130F; stroke-width:8; stroke-linecap:round; }
  .on-cork .sketch path { stroke:#FFFDF8; }

  /* cue chips, bottom strip */
  .cue-strip { position:absolute; top:1500px; left:120px; right:120px; height:200px; z-index:25;
    display:flex; align-items:center; }
  .cue {
    position:absolute; opacity:0; display:flex; align-items:center; gap:20px;
    background:#FFFFFF; color:var(--ink); border:4px solid var(--hot); border-radius:20px;
    padding:18px 34px; font-size:44px; font-weight:800; white-space:nowrap;
    box-shadow:0 10px 24px rgba(16,20,28,0.12);
  }
  .cue-icon { width:72px; height:72px; }
  .cue.good .cue-icon { color:var(--hot); }
  .cue.danger { border-color:#B3271A; }
  .cue.danger .cue-icon { color:#B3271A; }
  .cue.danger span { text-decoration:line-through; }
  .cue.neutral { border-color:#2E3440; }
  .cue.neutral .cue-icon { color:#2E3440; }

  /* paper grain over everything */
  .grain { display:none; }
</style>
</head>
<body>

<div data-composition-id="reel-main" data-width="1080" data-height="1920" data-fps="${FPS}" data-duration="${duration}">

  <audio id="vo" src="assets/vo.mp3" data-start="0" data-has-audio="true" data-volume="1"></audio>
${sfxHits
  .map(
    (h, k) =>
      `  <audio id="fx${k}" src="assets/sfx/${h.name}.mp3" data-start="${h.at}" data-has-audio="true" data-volume="${h.volume}"></audio>`,
  )
  .join("\n")}

${surfaceHtml}

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

  // draw a roughjs path on by running its dash offset to zero
  function drawOn(tl, sel, at, dur) {
    const el = document.querySelector(sel);
    if (!el) return;
    const len = el.getTotalLength();
    el.style.strokeDasharray = len;
    el.style.strokeDashoffset = len;
    tl.to(el, { duration: dur, strokeDashoffset: 0, ease: "power2.inOut" }, at);
  }

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
