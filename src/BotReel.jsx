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

const BG = "#131C2D";
const PANEL_BG = "#FFFFFF";
const PANEL_TEXT = "#131C2D"; // explainer copy sits on the light panel
const PANEL_MUTED = "#5A6678";
const PANEL_LINE = "#E3E7EE";
const ACCENT = "#FF550D";
const TEXT_LIGHT = "#FFFFFF";
const TEXT_DIM = "rgba(255,255,255,0.40)";
// The bot's own screen glow, matching the eyes painted into the sprite.
const SCREEN_GLOW = "#FAD06C";
const SCREEN = "rgb(22, 26, 36)";

const SERIF_FONT = 'Georgia, Cambria, "Times New Roman", Times, serif';
const UI_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

// Zones: explainer panel on top, bot floating just above the captions.
const PANEL_TOP = 150;
const PANEL_HEIGHT = 880;
const BOT_TOP = 1165;
const BOT_W = 400;
const CAPTION_BOTTOM = 150;

// Beats, taken from the voiceover's word timestamps.
//   B1 0-67    "Need a page saved forever?"
//   B2 67-176  "KhanPDF turns any link into a clean PDF."
//   B3 176-230 "Download it, email it."
//   B4 230-300 "Free, no sign up."
const BEATS = [
  { from: 0, to: 67 },
  { from: 67, to: 176 },
  { from: 176, to: 230 },
  { from: 230, to: 300 },
];

const buildPages = (words, { maxWords = 3, maxGap = 0.45, maxDuration = 2.2 } = {}) => {
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
          backgroundColor: SCREEN,
          borderRadius: "50%",
          boxShadow: `0 0 18px 14px ${SCREEN}`,
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
          const wobble = 0.5 + 0.5 * Math.sin(frame / 2.0 + i * 1.45);
          const height = speaking ? Math.max(10, taper * wobble * 96) : 10;
          return (
            <div
              key={i}
              style={{
                width: `${100 / (bars * 2.1)}%`,
                height: `${height}%`,
                borderRadius: 999,
                backgroundColor: SCREEN_GLOW,
                boxShadow: `0 0 10px ${SCREEN_GLOW}`,
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
  const floatY = Math.sin(frame / 13) * 14;
  const tilt = Math.sin(frame / 19) * 2.2;

  return (
    <div
      style={{
        position: "absolute",
        top: BOT_TOP,
        left: (1080 - BOT_W) / 2,
        width: BOT_W,
        transform: `translateY(${floatY + interpolate(enter, [0, 1], [60, 0])}px) rotate(${tilt}deg) scale(${interpolate(enter, [0, 1], [0.86, 1])})`,
        opacity: enter,
        filter: "drop-shadow(0 26px 44px rgba(0,0,0,0.6))",
      }}
    >
      <Img
        src={staticFile("assets/sprites/bot_large.png")}
        style={{ width: "100%", height: "auto", display: "block" }}
      />
      <BotMouth speaking={speaking} frame={frame} />
    </div>
  );
};

// ---------------------------------------------------------------- panel
const Panel = ({ children }) => (
  <div
    style={{
      position: "absolute",
      top: PANEL_TOP,
      left: 70,
      right: 70,
      height: PANEL_HEIGHT,
      borderRadius: 40,
      backgroundColor: PANEL_BG,
      boxShadow: "0 30px 70px rgba(0,0,0,0.45)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 70px",
      fontFamily: UI_FONT,
      color: PANEL_TEXT,
      textAlign: "center",
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

// Fade a beat's contents in and out inside the panel
const Beat = ({ length, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 7, length - 9, length], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rise = interpolate(frame, [0, 14], [26, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        padding: "0 70px",
        opacity,
        transform: `translateY(${rise}px)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const Headline = ({ children, size = 92 }) => (
  <div style={{ fontSize: size, fontWeight: 800, letterSpacing: -2, lineHeight: 1.1, color: PANEL_TEXT }}>
    {children}
  </div>
);

const Chip = ({ label, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame: frame - delay, fps, config: { damping: 13, stiffness: 180 }, durationInFrames: 16 });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "20px 34px",
        borderRadius: 999,
        border: `3px solid ${ACCENT}`,
        backgroundColor: "#FFF4EE",
        fontSize: 46,
        fontWeight: 700,
        color: PANEL_TEXT,
        whiteSpace: "nowrap",
        transform: `translateY(${interpolate(e, [0, 1], [30, 0])}px) scale(${interpolate(e, [0, 1], [0.9, 1])})`,
        opacity: e,
      }}
    >
      <span style={{ color: ACCENT }}>&#10003;</span>
      {label}
    </div>
  );
};

const PdfCard = ({ progress }) => (
  <div
    style={{
      width: 420,
      padding: 34,
      borderRadius: 28,
      border: `3px solid ${PANEL_LINE}`,
      backgroundColor: "#FBFCFE",
      opacity: progress,
      transform: `translateY(${interpolate(progress, [0, 1], [40, 0])}px) scale(${interpolate(progress, [0, 1], [0.9, 1])})`,
    }}
  >
    <div
      style={{
        display: "inline-block",
        padding: "10px 24px",
        borderRadius: 12,
        backgroundColor: ACCENT,
        color: "#fff",
        fontSize: 32,
        fontWeight: 900,
        letterSpacing: 1,
      }}
    >
      PDF
    </div>
    {[1, 0.88, 0.95, 0.5].map((w, i) => (
      <div
        key={i}
        style={{
          marginTop: i === 0 ? 24 : 14,
          height: 14,
          width: `${w * 100}%`,
          borderRadius: 999,
          backgroundColor: PANEL_LINE,
        }}
      />
    ))}
  </div>
);

// ---------------------------------------------------------------- beats
const BeatHook = ({ length }) => (
  <Beat length={length}>
    <Headline size={98}>
      Pages change.
      <br />
      Links <span style={{ color: ACCENT }}>break.</span>
    </Headline>
    <div style={{ marginTop: 34, fontSize: 48, color: PANEL_MUTED, fontWeight: 600 }}>
      Save it before it&rsquo;s gone
    </div>
  </Beat>
);

const BeatConvert = ({ length }) => {
  const frame = useCurrentFrame();
  const url = "https://example.com/article";
  const typed = interpolate(frame, [14, 56], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const arrow = interpolate(frame, [58, 72], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const card = interpolate(frame, [74, 92], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Beat length={length}>
      <Headline size={82}>
        Any link, <span style={{ color: ACCENT }}>one PDF</span>
      </Headline>

      <div
        style={{
          marginTop: 40,
          width: "100%",
          padding: "26px 30px",
          borderRadius: 20,
          border: `3px solid ${PANEL_LINE}`,
          backgroundColor: "#F7F9FC",
          fontFamily: "monospace",
          fontSize: 34,
          color: PANEL_TEXT,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textAlign: "left",
        }}
      >
        {url.slice(0, Math.round(typed * url.length))}
        <span style={{ color: ACCENT }}>{typed < 1 ? "|" : ""}</span>
      </div>

      <div style={{ marginTop: 20, fontSize: 60, color: ACCENT, opacity: arrow, lineHeight: 1 }}>
        &#8595;
      </div>

      <div style={{ marginTop: 20 }}>
        <PdfCard progress={card} />
      </div>
    </Beat>
  );
};

const BeatUse = ({ length }) => (
  <Beat length={length}>
    <Headline size={88}>
      Keep it. <span style={{ color: ACCENT }}>Send it.</span>
    </Headline>
    <div style={{ marginTop: 46, display: "flex", flexDirection: "column", gap: 24 }}>
      <Chip label="Download offline" delay={4} />
      <Chip label="Email to anyone" delay={20} />
    </div>
  </Beat>
);

const BeatFree = ({ length }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = spring({ frame: frame - 30, fps, config: { damping: 18 }, durationInFrames: 24 });

  return (
    <Beat length={length}>
      <Headline size={98}>
        Free. <span style={{ color: ACCENT }}>Forever.</span>
      </Headline>
      <div style={{ marginTop: 30, fontSize: 46, color: PANEL_MUTED, fontWeight: 600 }}>
        No signup &middot; No watermark
      </div>
      <div
        style={{
          marginTop: 54,
          fontSize: 84,
          fontWeight: 800,
          letterSpacing: -2,
          color: PANEL_TEXT,
          opacity: brand,
          transform: `scale(${interpolate(brand, [0, 1], [0.9, 1])})`,
        }}
      >
        Khan<span style={{ color: ACCENT }}>PDF</span>
      </div>
      <div style={{ marginTop: 10, fontSize: 44, fontWeight: 700, color: ACCENT, opacity: brand }}>
        khanpdf.com
      </div>
    </Beat>
  );
};

// ---------------------------------------------------------------- 300 frames
export const BotReel = ({ audioFile, transcription }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;

  const words = transcription?.words ?? [];
  const pages = buildPages(words);
  const speaking = words.some((w) => time >= w.start && time <= w.end);

  let activePageIndex = pages.findIndex((p) => time >= p.start && time <= p.end);
  if (activePageIndex === -1) {
    const passed = pages.filter((p) => p.end < time);
    activePageIndex = passed.length > 0 ? pages.indexOf(passed[passed.length - 1]) : 0;
  }
  const activePage = pages[activePageIndex];

  const beatComponents = [BeatHook, BeatConvert, BeatUse, BeatFree];

  return (
    <AbsoluteFill style={{ backgroundColor: BG, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, rgba(255,85,13,0.10) 0%, rgba(19,28,45,0) 62%)",
        }}
      />

      {audioFile ? <Audio src={staticFile(audioFile)} /> : null}

      {/* soft marker on each beat change */}
      {BEATS.slice(1).map((b) => (
        <Sequence key={b.from} from={b.from - 3} durationInFrames={24}>
          <Audio src={staticFile("sfx/whoosh.mp3")} volume={0.22} />
        </Sequence>
      ))}

      <Panel>
        {BEATS.map((b, i) => {
          const Component = beatComponents[i];
          return (
            <Sequence key={b.from} from={b.from} durationInFrames={b.to - b.from}>
              <Component length={b.to - b.from} />
            </Sequence>
          );
        })}
      </Panel>

      <Bot speaking={speaking} frame={frame} />

      {/* captions */}
      <div
        style={{
          position: "absolute",
          bottom: CAPTION_BOTTOM,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          padding: "0 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: "12px 20px",
            fontFamily: SERIF_FONT,
            textAlign: "center",
          }}
        >
          {activePage?.words.map((word, index) => {
            const isSpoken = time >= word.start;
            const isActive = time >= word.start && time <= word.end;
            const enter = spring({
              frame: frame - Math.round(word.start * fps),
              fps,
              config: { damping: 14, stiffness: 220 },
              durationInFrames: 8,
            });
            const scale = isActive ? interpolate(enter, [0, 1], [0.88, 1.08]) : 1;

            return (
              <span
                key={`${word.word}-${index}`}
                style={{
                  fontSize: 82,
                  fontWeight: 900,
                  color: isActive ? ACCENT : isSpoken ? TEXT_LIGHT : TEXT_DIM,
                  transform: `scale(${scale})`,
                  textShadow: "0 6px 18px rgba(0,0,0,0.8)",
                }}
              >
                {word.word}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
