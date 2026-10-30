/**
 * KineticCaption.jsx
 * Word-level animated captions with 4 kinetic styles.
 *
 * Usage:
 *   <KineticCaption
 *     words={transcription.words}
 *     time={time}
 *     frame={frame}
 *     style="slam"          // "slam" | "pop" | "wave" | "blast"
 *     speed={1}
 *   />
 *
 * Style reference:
 *   slam  — each word smashes in from above, heavy weight, uppercase
 *   pop   — word balloons up past 1× then snaps back with a rubber-band
 *   wave  — all words float on a sine ripple; active word glows
 *   blast — active word explodes in accent color with a radial glow pulse
 */

import { interpolate, spring, useVideoConfig } from "remotion";
import { COLORS, FONTS, LAYOUT } from "./theme.js";

// ─────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────

/** Group words into pages: max words, max silence gap, max duration. */
const buildPages = (words, { maxWords = 4, maxGap = 0.45, maxDuration = 2.4 } = {}) => {
  const pages = [];
  let current = [];
  const flush = () => {
    if (current.length > 0) {
      pages.push({
        words: current,
        start: current[0].start,
        end: current[current.length - 1].end,
      });
      current = [];
    }
  };
  for (const word of words) {
    if (current.length > 0) {
      const prev = current[current.length - 1];
      if (
        current.length >= maxWords ||
        word.start - prev.end > maxGap ||
        word.end - current[0].start > maxDuration
      ) {
        flush();
      }
    }
    current.push(word);
  }
  flush();
  return pages;
};

/** Return the active page; hold the last one between pages so screen never flashes empty. */
const activePage = (pages, time) => {
  const idx = pages.findIndex((p) => time >= p.start && time <= p.end);
  if (idx !== -1) return pages[idx];
  const passed = pages.filter((p) => p.end < time);
  return passed.length > 0 ? passed[passed.length - 1] : pages[0] ?? null;
};

// ─────────────────────────────────────────────────
// per-style word renderers
// ─────────────────────────────────────────────────

/**
 * SLAM — crashes in from above on the frame it starts.
 * Heavy black uppercase sans-serif. Ideal for hype / action topics.
 */
const SlamWord = ({ word, index, time, frame, fps }) => {
  const isSpoken = time >= word.start;
  const isActive = time >= word.start && time <= word.end;

  const enter = spring({
    frame: frame - Math.round(word.start * fps),
    fps,
    config: { damping: 10, stiffness: 280, mass: 0.7 },
    durationInFrames: 10,
  });

  const y   = isSpoken ? interpolate(enter, [0, 1], [-55, 0]) : -55;
  const scl = isSpoken ? interpolate(enter, [0, 1], [1.5, 1])  : 0;
  const op  = isSpoken ? 1 : 0;

  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: `"Arial Black", "Impact", ${FONTS.ui}`,
        fontSize: 110,
        fontWeight: 900,
        textTransform: "uppercase",
        letterSpacing: "-2px",
        lineHeight: 1,
        color: isActive ? COLORS.accent : COLORS.textLight,
        textShadow: isActive
          ? `0 0 40px ${COLORS.accent}, 0 6px 0 rgba(0,0,0,0.6)`
          : "0 4px 0 rgba(0,0,0,0.55)",
        transform: `translateY(${y}px) scale(${scl})`,
        opacity: op,
        transformOrigin: "50% 100%",
        transition: "color 0.06s",
      }}
    >
      {word.word}
    </span>
  );
};

/**
 * POP — word scales from 0 to 1.18× then springs back to 1×.
 * Smooth and playful. Good for lifestyle / tutorial topics.
 */
const PopWord = ({ word, index, time, frame, fps }) => {
  const isSpoken = time >= word.start;
  const isActive = time >= word.start && time <= word.end;

  // Rubber-band: overshoot spring
  const enter = spring({
    frame: frame - Math.round(word.start * fps),
    fps,
    config: { damping: 9, stiffness: 320, mass: 0.5 },
    durationInFrames: 12,
  });

  const scl = isSpoken ? interpolate(enter, [0, 0.6, 1], [0, 1.22, 1]) : 0;
  const op  = isSpoken ? Math.min(1, enter * 2) : 0;

  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: FONTS.ui,
        fontSize: 98,
        fontWeight: 800,
        letterSpacing: "-1.5px",
        lineHeight: 1.05,
        color: isActive ? "#FFE066" : COLORS.textLight,
        textShadow: isActive
          ? "0 0 32px rgba(255,224,102,0.7), 0 5px 20px rgba(0,0,0,0.8)"
          : "0 5px 20px rgba(0,0,0,0.8)",
        transform: `scale(${scl})`,
        opacity: op,
        transformOrigin: "50% 50%",
        transition: "color 0.08s",
      }}
    >
      {word.word}
    </span>
  );
};

/**
 * WAVE — all words ripple on a sine wave. Active word glows + scales up.
 * Calm & rhythmic. Perfect for voiceover-heavy explainer topics.
 */
const WaveWord = ({ word, index, time, frame, fps }) => {
  const isSpoken = time >= word.start;
  const isActive = time >= word.start && time <= word.end;

  const wave = Math.sin(frame / 9 + index * 1.1) * 10;
  const scl  = isActive ? 1.12 : 1;
  const op   = isSpoken ? 1 : 0.28;

  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: FONTS.serif,
        fontSize: 105,
        fontWeight: 900,
        letterSpacing: "-1px",
        lineHeight: 1.05,
        color: isActive ? COLORS.screenGlow : COLORS.textLight,
        textShadow: isActive
          ? `0 0 50px ${COLORS.screenGlow}, 0 0 20px ${COLORS.screenGlow}`
          : "0 6px 18px rgba(0,0,0,0.8)",
        transform: `translateY(${wave}px) scale(${scl})`,
        opacity: op,
        transition: "color 0.1s, opacity 0.15s, transform 0.05s",
      }}
    >
      {word.word}
    </span>
  );
};

/**
 * BLAST — active word explodes with a radial glow pulse, then fades to white.
 * High energy. Best for announcement / product reveal topics.
 */
const BlastWord = ({ word, index, time, frame, fps }) => {
  const isSpoken = time >= word.start;
  const isActive = time >= word.start && time <= word.end;

  const enter = spring({
    frame: frame - Math.round(word.start * fps),
    fps,
    config: { damping: 12, stiffness: 260 },
    durationInFrames: 10,
  });

  // Pulse ring: starts big on first frame, shrinks as spring settles
  const pulse = isActive ? interpolate(enter, [0, 1], [1.4, 1.0]) : 1;
  const scl   = isSpoken ? interpolate(enter, [0, 1], [0.6, 1])   : 0;
  const op    = isSpoken ? 1 : 0.2;

  const glow = isActive
    ? `0 0 60px ${COLORS.accent}, 0 0 120px rgba(255,85,13,0.5), 0 6px 24px rgba(0,0,0,0.9)`
    : "0 6px 24px rgba(0,0,0,0.9)";

  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: `"Arial Black", ${FONTS.ui}`,
        fontSize: 102,
        fontWeight: 900,
        letterSpacing: "-1.5px",
        textTransform: "uppercase",
        lineHeight: 1.05,
        color: isActive ? COLORS.accent : isSpoken ? COLORS.textLight : COLORS.textDim,
        textShadow: glow,
        transform: `scale(${scl * (isActive ? pulse : 1)})`,
        opacity: op,
        transformOrigin: "50% 50%",
        transition: "color 0.06s",
      }}
    >
      {word.word}
    </span>
  );
};

// ─────────────────────────────────────────────────
// style → component map
// ─────────────────────────────────────────────────
const WORD_COMPONENTS = {
  slam:  SlamWord,
  pop:   PopWord,
  wave:  WaveWord,
  blast: BlastWord,
};

// ─────────────────────────────────────────────────
// KineticCaption
// ─────────────────────────────────────────────────
export const KineticCaption = ({
  words = [],
  time,
  frame,
  style = "pop",
  speed = 1,
  top = LAYOUT.titleTop,
}) => {
  const { fps } = useVideoConfig();

  // Scale word timestamps by playback speed
  const scaledWords = words.map((w) => ({
    ...w,
    start: w.start / speed,
    end:   w.end   / speed,
  }));

  const pages = buildPages(scaledWords);
  const page  = activePage(pages, time);
  const Word  = WORD_COMPONENTS[style] ?? PopWord;

  if (!page) return null;

  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 60,
        right: 60,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        gap: "8px 20px",
        zIndex: 30,
      }}
    >
      {page.words.map((word, i) => (
        <Word
          key={`${word.word}-${i}`}
          word={word}
          index={i}
          time={time}
          frame={frame}
          fps={fps}
        />
      ))}
    </div>
  );
};

