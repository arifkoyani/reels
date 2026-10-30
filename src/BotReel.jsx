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
import { COLORS, FONTS, LAYOUT, SUBTITLE_LINES } from "./theme.js";
import { Beat } from "./Beat.jsx";
import { Icon } from "./Icon.jsx";
import { KineticCaption } from "./KineticCaption.jsx";

// Pages hold up to 5 words so they split as 2 / 2 / 1 across stacked lines.
const buildPages = (words, { maxWords = 5, maxGap = 0.45, maxDuration = 2.6 } = {}) => {
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
      const previous = current[current.length - 1];
      const gap = word.start - previous.end;
      const pageLength = word.end - current[0].start;
      if (current.length >= maxWords || gap > maxGap || pageLength > maxDuration) {
        flush();
      }
    }
    current.push(word);
  }
  flush();

  return pages;
};

// Merge words into continuous speech spans, so the nod runs through a sentence
// instead of restarting on every inter-word gap.
const speechSpans = (words, mergeGap = 0.35) => {
  const spans = [];
  for (const w of words) {
    const last = spans[spans.length - 1];
    if (last && w.start - last.end <= mergeGap) last.end = w.end;
    else spans.push({ start: w.start, end: w.end });
  }
  return spans;
};

// 0 outside speech, 1 during it, with a smooth ramp either side so the head
// eases into the nod and settles still rather than snapping.
const nodEnvelopeAt = (spans, t, ramp = 0.25) => {
  for (const s of spans) {
    if (t < s.start - ramp || t > s.end + ramp) continue;
    const up = (t - (s.start - ramp)) / ramp;
    const down = (s.end + ramp - t) / ramp;
    const raw = Math.max(0, Math.min(1, up, down));
    return raw * raw * (3 - 2 * raw); // smoothstep
  }
  return 0;
};

// ---------------------------------------------------------------- bot
const BotMouth = ({ speaking, frame }) => {
  const bars = 9;
  return (
    <div
      style={{
        position: "absolute",
        left: "39%",
        top: "62%",
        width: "30%",
        height: "12%",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: COLORS.screen,
          borderRadius: "50%",
          boxShadow: `0 0 18px 14px ${COLORS.screen}`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {new Array(bars).fill(0).map((_, i) => {
          // Taper the ends so it reads as a mouth, not an equaliser
          const taper = Math.sin((Math.PI * (i + 0.5)) / bars);
          const wobble = 0.5 + 0.5 * Math.sin(frame / 1.9 + i * 1.45);
          const height = speaking ? Math.max(10, taper * wobble * 96) : 10;
          return (
            <div
              key={i}
              style={{
                width: `${100 / (bars * 2.1)}%`,
                height: `${height}%`,
                borderRadius: 999,
                backgroundColor: COLORS.screenGlow,
                boxShadow: `0 0 10px ${COLORS.screenGlow}`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

const NOD_HZ = 2; // nods per second
const NOD_DEG = 5; // peak degrees each way

const Bot = ({ nodAmount, speaking, frame }) => {
  const { fps } = useVideoConfig();
  const t = frame / fps;

  // Pitch rotation about the horizontal axis through the side pods. The sine is
  // already ease-in/ease-out, and nodAmount ramps it in and out so it starts and
  // settles still. Nothing translates or scales — the head only rotates in place.
  const nodAngle = NOD_DEG * nodAmount * Math.sin(t * NOD_HZ * Math.PI * 2);

  // Fade only: no entrance slide or scale, which would read as the head
  // sliding up and the camera zooming.
  const enter = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: LAYOUT.botTop,
        left: LAYOUT.botLeft,
        width: LAYOUT.botWidth,
        zIndex: 20,
        // perspective gives the rotateX depth; origin on the pod mid-line
        perspective: "900px",
        perspectiveOrigin: "50% 55%",
        opacity: enter,
        filter: "drop-shadow(0 22px 40px rgba(0,0,0,0.6))",
      }}
    >
      {/* Head + face — rotates on the pitch axis */}
      <div
        style={{
          transformOrigin: "50% 55%",
          transform: `rotateX(${nodAngle}deg)`,
        }}
      >
        <Img
          src={staticFile("assets/sprites/bot_large.png")}
          style={{ width: "100%", height: "auto", display: "block" }}
        />
        <BotMouth speaking={speaking} frame={frame} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- word cues
// A small icon chip fired on the word being spoken: "links" shows a link,
// "go dead" shows a broken one. Lives in the open band beside the bot.
const CUE_TONES = {
  good: COLORS.accent,
  danger: "#FF4D4D",
  neutral: "#FFFFFF",
};

const CueChip = ({ cue, time, frame, fps }) => {
  const enter = spring({
    frame: frame - Math.round(cue.start * fps),
    fps,
    config: { damping: 13, stiffness: 190 },
    durationInFrames: 12,
  });
  // fade out over the last 0.3s of its hold
  const out = interpolate(time, [cue.until - 0.3, cue.until], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tone = CUE_TONES[cue.tone] ?? CUE_TONES.neutral;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "16px 26px",
        borderRadius: 999,
        backgroundColor: "rgba(10,16,28,0.92)",
        border: `3px solid ${tone}`,
        boxShadow: `0 10px 30px rgba(0,0,0,0.5)`,
        whiteSpace: "nowrap",
        opacity: enter * out,
        transform: `translateY(${interpolate(enter, [0, 1], [26, 0])}px) scale(${interpolate(enter, [0, 1], [0.8, 1])})`,
      }}
    >
      <Icon name={cue.icon} size={52} color={tone} strokeWidth={2.2} />
      <span
        style={{
          fontFamily: FONTS.ui,
          fontSize: 36,
          fontWeight: 800,
          color: COLORS.textLight,
          // a struck-through label reads as "this is the broken one"
          textDecoration: cue.tone === "danger" ? "line-through" : "none",
          textDecorationColor: tone,
        }}
      >
        {cue.label}
      </span>
    </div>
  );
};

const WordCues = ({ cues = [], time, frame, fps }) => {
  const active = cues.filter((c) => time >= c.start && time <= c.until).slice(-2);
  if (active.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: LAYOUT.botTop + 20,
        left: LAYOUT.botLeft + LAYOUT.botWidth + 30,
        right: 60,
        height: 240,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        gap: 16,
        zIndex: 25,
      }}
    >
      {active.map((cue) => (
        <CueChip key={`${cue.icon}-${cue.start}`} cue={cue} time={time} frame={frame} fps={fps} />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------- caption
const chunkWords = (words, size = 2) => {
  const out = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size));
  return out;
};

const CaptionBlock = ({ page, time, frame, fps }) => {
  if (!page) return null;
  const lines = chunkWords(page.words, 2);

  return (
    <div
      style={{
        position: "absolute",
        top: LAYOUT.titleTop,
        left: 60,
        right: 60,
        display: "flex",
        justifyContent: "center",
        zIndex: 30,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        {lines.map((line, li) => {
          const style = SUBTITLE_LINES[li % SUBTITLE_LINES.length];
          return (
            <div
              key={li}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 18,
                marginLeft: li * 46,
                marginTop: li === 0 ? 0 : -6,
                textTransform: "lowercase",
                lineHeight: 1.02,
                ...style,
              }}
            >
              {line.map((word, wi) => {
                const isSpoken = time >= word.start;
                const isActive = time >= word.start && time <= word.end;
                const enter = spring({
                  frame: frame - Math.round(word.start * fps),
                  fps,
                  config: { damping: 14, stiffness: 220 },
                  durationInFrames: 8,
                });
                const scale = isActive ? interpolate(enter, [0, 1], [0.92, 1.05]) : 1;

                return (
                  <span
                    key={`${word.word}-${wi}`}
                    style={{
                      display: "inline-block",
                      transform: `scale(${scale})`,
                      opacity: isSpoken ? 1 : 0.3,
                      textShadow: "0 6px 22px rgba(0,0,0,0.85)",
                    }}
                  >
                    {word.word}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- reel
export const BotReel = ({
  audioFile,
  transcription,
  beats = [],
  cues = [],
  speed = 1,
  speechEnd,
  captionStyle = "pop",
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const time = frame / fps;

  // Playing the voice faster compresses every timestamp by the same factor, so
  // captions and the mouth have to be rescaled or they drift out of sync.
  const words = (transcription?.words ?? []).map((w) => ({
    ...w,
    start: w.start / speed,
    end: w.end / speed,
  }));
  const pages = buildPages(words);
  const speaking = words.some((w) => time >= w.start && time <= w.end);

  // Only pages that finish inside the audible range, so no caption shows words
  // the viewer never hears.
  const audioStop = speechEnd ?? durationInFrames;
  const audibleEnd = audioStop / fps;
  const shownPages = pages.filter((p) => p.end <= audibleEnd);

  let activePageIndex = shownPages.findIndex((p) => time >= p.start && time <= p.end);
  if (activePageIndex === -1) {
    const passed = shownPages.filter((p) => p.end < time);
    activePageIndex = passed.length > 0 ? shownPages.indexOf(passed[passed.length - 1]) : 0;
  }
  const activePage = shownPages[activePageIndex];

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, overflow: "hidden" }}>
      {/* warm glows either side */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 8% 42%, rgba(255,85,13,0.16) 0%, rgba(19,28,45,0) 34%), radial-gradient(circle at 93% 46%, rgba(255,85,13,0.16) 0%, rgba(19,28,45,0) 34%)",
        }}
      />

      {/* voiceover only — no background sound effects */}
      {audioFile ? (
        <Sequence from={0} durationInFrames={audioStop}>
          <Audio src={staticFile(audioFile)} playbackRate={speed} />
        </Sequence>
      ) : null}

      {/* explainer window */}
      <div
        style={{
          position: "absolute",
          top: LAYOUT.panelTop,
          left: LAYOUT.panelLeft,
          width: LAYOUT.panelWidth,
          height: LAYOUT.panelHeight,
          borderRadius: 44,
          backgroundColor: COLORS.panelBg,
          boxShadow: "0 34px 80px rgba(0,0,0,0.5)",
          overflow: "hidden",
          zIndex: 10,
        }}
      >
        {beats.map((beat, i) => (
          <Sequence key={i} from={beat.from} durationInFrames={beat.to - beat.from}>
            <Beat beat={beat} length={beat.to - beat.from} />
          </Sequence>
        ))}
      </div>

      <Bot
        nodAmount={nodEnvelopeAt(speechSpans(words), time)}
        speaking={speaking}
        frame={frame}
      />

      {/* cues arrive in audio time, so they scale with playbackRate like the words do */}
      <WordCues
        cues={cues.map((c) => ({
          ...c,
          start: c.start / speed,
          end: c.end / speed,
          until: c.until / speed,
        }))}
        time={time}
        frame={frame}
        fps={fps}
      />

      <KineticCaption
        words={transcription?.words ?? []}
        time={time}
        frame={frame}
        style={captionStyle}
        speed={speed}
      />
    </AbsoluteFill>
  );
};
