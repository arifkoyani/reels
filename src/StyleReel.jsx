import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Underline } from "@remotion/rough-notation";
import { REF, REF_LAYOUT as L, SANS, SERIF, DISPLAY, MONO } from "./theme-ref.js";
import { Icon } from "./Icon.jsx";

// ---------------------------------------------------------------- texture
// Paper grain. feTurbulence is cheap and static, unlike per-pixel noise.
const Grain = () => (
  <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "multiply", opacity: 0.33 }}>
    <svg width="100%" height="100%">
      <filter id="paper-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#paper-grain)" opacity="0.45" />
    </svg>
  </AbsoluteFill>
);

// ---------------------------------------------------------------- caption
// The spoken line sits at the TOP. Words that earned an icon cue are also the
// emphasis words, drawn in italic serif red — one dictionary drives both.
const Caption = ({ page, cues, time }) => {
  if (!page) return null;

  const isKey = (word) =>
    cues.some((c) => Math.abs(c.start - word.start) < 0.06);

  return (
    <div
      style={{
        position: "absolute",
        top: L.captionTop,
        left: L.margin,
        right: L.margin,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        gap: "4px 18px",
        lineHeight: 1.16,
      }}
    >
      {page.words.map((word, i) => {
        const key = isKey(word);
        const spoken = time >= word.start;
        return (
          <span
            key={i}
            style={{
              fontFamily: key ? SERIF : SANS,
              fontStyle: key ? "italic" : "normal",
              fontWeight: key ? 700 : 800,
              fontSize: key ? 86 : 78,
              letterSpacing: key ? 0 : "-2px",
              color: key ? REF.accent : REF.ink,
              opacity: spoken ? 1 : 0.22,
            }}
          >
            {word.word}
          </span>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------- pieces
const MonoLabel = ({ children, style }) => (
  <div
    style={{
      fontFamily: MONO,
      fontSize: 30,
      letterSpacing: 2,
      color: REF.muted,
      ...style,
    }}
  >
    {children}
  </div>
);

// Black rounded square numeral with progress pips, as in the reference
const StepBadge = ({ step, total = 5 }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
    <div
      style={{
        width: 92,
        height: 92,
        borderRadius: 22,
        backgroundColor: REF.ink,
        color: "#fff",
        fontFamily: DISPLAY,
        fontSize: 62,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 6,
      }}
    >
      {step}
    </div>
    <div style={{ display: "flex", gap: 6 }}>
      {new Array(total).fill(0).map((_, i) => (
        <div
          key={i}
          style={{
            width: 9,
            height: 9,
            borderRadius: 999,
            backgroundColor: i < step ? REF.accent : REF.line,
          }}
        />
      ))}
    </div>
  </div>
);

// Display headline in a stamped box, two-tone on {braces}
const Stamp = ({ text, frame }) => {
  const { fps } = useVideoConfig();
  const e = spring({ frame: frame - 4, fps, config: { damping: 12, stiffness: 170 }, durationInFrames: 14 });
  const parts = text.split(/(\{[^}]*\})/g).filter(Boolean);

  return (
    <div
      style={{
        display: "inline-block",
        border: `5px solid ${REF.accent}`,
        borderRadius: 8,
        padding: "12px 28px 6px",
        transform: `rotate(-1.6deg) scale(${interpolate(e, [0, 1], [0.86, 1])})`,
        opacity: e,
      }}
    >
      <div style={{ fontFamily: DISPLAY, fontSize: 96, letterSpacing: 1, lineHeight: 1 }}>
        {parts.map((p, i) =>
          p.startsWith("{") ? (
            <span key={i} style={{ color: REF.accent }}>
              {p.slice(1, -1)}
            </span>
          ) : (
            <span key={i} style={{ color: REF.ink }}>
              {p}
            </span>
          ),
        )}
      </div>
    </div>
  );
};

const Card = ({ icon, title, note, e }) => (
  <div
    style={{
      flex: 1,
      minWidth: 0,
      backgroundColor: REF.card,
      border: `3px solid ${REF.line}`,
      borderRadius: 28,
      padding: "34px 32px",
      display: "flex",
      alignItems: "center",
      gap: 26,
      boxShadow: "0 10px 26px rgba(12,10,8,0.08)",
      transform: `translateY(${interpolate(e, [0, 1], [30, 0])}px)`,
      opacity: e,
    }}
  >
    <div
      style={{
        width: 92,
        height: 92,
        borderRadius: 20,
        backgroundColor: REF.ink,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon name={icon} size={52} color="#fff" strokeWidth={2.4} />
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 50, color: REF.ink }}>{title}</div>
      {note ? <MonoLabel style={{ marginTop: 4 }}>{`// ${note}`}</MonoLabel> : null}
    </div>
  </div>
);

// ---------------------------------------------------------------- stage
const Stage = ({ beat, length }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, 6, length - 8, length], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const typed = interpolate(frame, [18, 48], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fill = interpolate(frame, [14, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const markProgress = interpolate(frame, [26, 46], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: L.stageTop,
        left: L.margin,
        right: L.margin,
        height: L.stageHeight,
        opacity,
      }}
    >
      {/* step badge, top right of the stage */}
      {beat.step ? (
        <div style={{ position: "absolute", top: 0, right: 0 }}>
          <StepBadge step={beat.step} />
        </div>
      ) : null}

      {beat.kicker ? <MonoLabel>{`// ${beat.kicker}`}</MonoLabel> : null}

      <div style={{ marginTop: 14 }}>
        <Stamp text={beat.stamp ?? beat.title ?? ""} frame={frame} />
      </div>

      {/* widgets */}
      {beat.widget === "url" ? (
        <div
          style={{
            marginTop: 46,
            padding: "26px 30px",
            borderRadius: 20,
            backgroundColor: REF.card,
            border: `3px solid ${REF.line}`,
            fontFamily: MONO,
            fontSize: 38,
            color: REF.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {beat.url.slice(0, Math.round(typed * beat.url.length))}
          <span style={{ color: REF.accent }}>{typed < 1 ? "|" : ""}</span>
        </div>
      ) : null}

      {beat.widget === "progress" ? (
        <div style={{ marginTop: 52 }}>
          <div
            style={{
              width: "100%",
              height: 24,
              borderRadius: 999,
              backgroundColor: REF.line,
              overflow: "hidden",
            }}
          >
            <div style={{ width: `${fill * 100}%`, height: "100%", backgroundColor: REF.accent }} />
          </div>
          <MonoLabel style={{ marginTop: 14 }}>{`// ${Math.round(fill * 100)}% rendered`}</MonoLabel>
        </div>
      ) : null}

      {beat.widget === "cards" ? (
        <div style={{ marginTop: 54, display: "flex", flexDirection: "column", gap: 24 }}>
          {(beat.cards ?? []).map((c, i) => (
            <Card
              key={c.title}
              {...c}
              e={spring({
                frame: frame - (10 + i * 12),
                fps,
                config: { damping: 14, stiffness: 180 },
                durationInFrames: 16,
              })}
            />
          ))}
        </div>
      ) : null}

      {beat.widget === "brand" ? (
        <div style={{ marginTop: 64 }}>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 96, color: REF.ink, letterSpacing: -3 }}>
            Khan<span style={{ color: REF.accent }}>PDF</span>
          </div>
          <div style={{ marginTop: 10, display: "inline-block" }}>
            <Underline progress={markProgress} color={REF.accent} strokeWidth={5} padding={6}>
              <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 52, color: REF.ink }}>
                khanpdf.com
              </span>
            </Underline>
          </div>
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------- bot
const Bot = ({ speaking, nodAmount, frame }) => {
  const t = frame / 30;
  const nod = 5 * nodAmount * Math.sin(t * 2 * Math.PI * 2);
  return (
    <div
      style={{
        position: "absolute",
        right: L.botRight,
        bottom: L.botBottom,
        width: L.botWidth,
        perspective: "900px",
        perspectiveOrigin: "50% 55%",
        zIndex: 5,
      }}
    >
      <div style={{ transformOrigin: "50% 55%", transform: `rotateX(${nod}deg)` }}>
        <Img
          src={staticFile("assets/sprites/bot_large.png")}
          style={{ width: "100%", height: "auto", display: "block" }}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- helpers
const buildPages = (words, { maxWords = 5, maxGap = 0.45, maxDuration = 2.6 } = {}) => {
  const pages = [];
  let cur = [];
  const flush = () => {
    if (cur.length) {
      pages.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
      cur = [];
    }
  };
  for (const w of words) {
    if (cur.length) {
      const prev = cur[cur.length - 1];
      if (cur.length >= maxWords || w.start - prev.end > maxGap || w.end - cur[0].start > maxDuration) {
        flush();
      }
    }
    cur.push(w);
  }
  flush();
  return pages;
};

const speechSpans = (words, gap = 0.35) => {
  const spans = [];
  for (const w of words) {
    const last = spans[spans.length - 1];
    if (last && w.start - last.end <= gap) last.end = w.end;
    else spans.push({ start: w.start, end: w.end });
  }
  return spans;
};

const envelopeAt = (spans, t, ramp = 0.25) => {
  for (const s of spans) {
    if (t < s.start - ramp || t > s.end + ramp) continue;
    const r = Math.max(0, Math.min(1, (t - (s.start - ramp)) / ramp, (s.end + ramp - t) / ramp));
    return r * r * (3 - 2 * r);
  }
  return 0;
};

// ---------------------------------------------------------------- reel
export const StyleReel = ({
  audioFile,
  transcription,
  beats = [],
  cues = [],
  speed = 1,
  sectionLabel = "khanpdf",
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const time = frame / fps;

  const words = (transcription?.words ?? []).map((w) => ({
    ...w,
    start: w.start / speed,
    end: w.end / speed,
  }));
  const scaledCues = cues.map((c) => ({ ...c, start: c.start / speed, end: c.end / speed }));

  const pages = buildPages(words);
  const page =
    pages.find((p) => time >= p.start && time <= p.end) ??
    [...pages].reverse().find((p) => p.end < time) ??
    pages[0];

  const nodAmount = envelopeAt(speechSpans(words), time);
  const speaking = words.some((w) => time >= w.start && time <= w.end);

  const activeBeat = beats.find((b) => frame >= b.from && frame < b.to) ?? beats[0];
  const beatIndex = beats.indexOf(activeBeat) + 1;

  return (
    <AbsoluteFill style={{ backgroundColor: REF.bg }}>
      {audioFile ? <Audio src={staticFile(audioFile)} playbackRate={speed} /> : null}

      <MonoLabel style={{ position: "absolute", top: L.labelTop, left: L.margin }}>
        {`// ${String(beatIndex).padStart(2, "0")} · ${activeBeat?.kicker ?? sectionLabel}`}
      </MonoLabel>

      <Caption page={page} cues={scaledCues} time={time} />

      {beats.map((b, i) => (
        <Sequence key={i} from={b.from} durationInFrames={b.to - b.from}>
          <Stage beat={b} length={b.to - b.from} />
        </Sequence>
      ))}

      <Bot speaking={speaking} nodAmount={nodAmount} frame={frame} />

      <Grain />
    </AbsoluteFill>
  );
};
