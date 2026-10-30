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

const Bot = ({ speaking, frame }) => {
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 110 }, durationInFrames: 22 });

  // ── Nod animation ──────────────────────────────────────────────────────────
  // Starts still for 1 s, nods for 3 s (~2 nods/s, ±5 °), settles still.
  // Implemented as a pitch rotation (rotateX) in perspective so the face
  // screen tilts with the head while position stays fixed.
  const NOD_START  = fps * 1;          // frame 30  (1 s)
  const NOD_END    = fps * 4;          // frame 120 (4 s)
  const NOD_HZ     = 2;                // cycles per second
  const NOD_DEG    = 5;                // peak degrees each way

  let nodAngle = 0;
  if (frame >= NOD_START && frame <= NOD_END) {
    const t          = (frame - NOD_START) / fps;          // seconds into nod phase
    const duration   = (NOD_END - NOD_START) / fps;        // 3 s total
    const progress   = t / duration;                        // 0 → 1

    // Smooth amplitude envelope: ease-in first 20 %, ease-out last 20 %
    const envelope =
      progress < 0.2  ? progress / 0.2 :
      progress > 0.8  ? (1 - progress) / 0.2 :
      1;

    nodAngle = NOD_DEG * envelope * Math.sin(t * NOD_HZ * Math.PI * 2);
  }
  // ──────────────────────────────────────────────────────────────────────────

  const enterScale = interpolate(enter, [0, 1], [0.86, 1]);
  const enterY     = interpolate(enter, [0, 1], [50, 0]);

  return (
    <div
      style={{
        position: "absolute",
        top: LAYOUT.botTop,
        left: LAYOUT.botLeft,
        width: LAYOUT.botWidth,
        zIndex: 20,
        // perspective gives the rotateX depth; transformOrigin at the
        // horizontal mid-line of the side pods (~55 % down the sprite)
        perspective: "900px",
        perspectiveOrigin: "50% 55%",
        opacity: enter,
        filter: "drop-shadow(0 22px 40px rgba(0,0,0,0.6))",
        transform: `translateY(${enterY}px) scale(${enterScale})`,
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

      <Bot speaking={speaking} frame={frame} />

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
