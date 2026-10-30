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
const PANEL_TEXT = "#131C2D";
const PANEL_MUTED = "#5A6678";
const PANEL_LINE = "#E3E7EE";
const ACCENT = "#FF550D";
const ACCENT_SOFT = "#FFF1EA";
const TEXT_LIGHT = "#FFFFFF";
const TEXT_DIM = "rgba(255,255,255,0.40)";
const SCREEN_GLOW = "#FAD06C";
const SCREEN = "rgb(22, 26, 36)";

const SERIF_FONT = 'Georgia, Cambria, "Times New Roman", Times, serif';
const UI_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

// Layout taken from the reference frame: explainer window up top, bot pinned to
// its lower-left corner, title directly beneath the window.
const PANEL_LEFT = 75;
const PANEL_WIDTH = 930;
const PANEL_TOP = 130;
const PANEL_HEIGHT = 910;
const PANEL_BOTTOM = PANEL_TOP + PANEL_HEIGHT;

const BOT_W = 310;
const BOT_LEFT = 88;
const BOT_TOP = 838; // overlaps the window's bottom-left corner

const TITLE_TOP = 1270;

// Beats, cut on the phone-voice word timestamps.
//   0-65    "Need a page saved forever?"
//   65-120  "Khan PDF turns any link..."      -> step 1
//   120-175 "...into a clean PDF."            -> step 2
//   175-250 "Download it. Email it."          -> step 3
//   250-300 "Free. No sign-up."               -> payoff
const BEATS = [
  { from: 0, to: 65, step: 0 },
  { from: 65, to: 120, step: 1 },
  { from: 120, to: 175, step: 2 },
  { from: 175, to: 250, step: 3 },
  { from: 250, to: 300, step: 0 },
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

// ---------------------------------------------------------------- icons
const Icon = ({ name, size = 84, color = ACCENT }) => {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  if (name === "link")
    return (
      <svg {...common}>
        <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" />
      </svg>
    );
  if (name === "doc")
    return (
      <svg {...common}>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6M9 17h4" />
      </svg>
    );
  if (name === "download")
    return (
      <svg {...common}>
        <path d="M12 3v12" />
        <path d="M7 11l5 5 5-5" />
        <path d="M4 20h16" />
      </svg>
    );
  if (name === "mail")
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="M3.5 7l8.5 6 8.5-6" />
      </svg>
    );
  return null;
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

  // Calm hover when idle; a faster vertical shake (~26px peak-to-peak) while
  // speaking, so the bot visibly drives the voice.
  const hover = Math.sin(frame / 13) * 10;
  const shake = speaking ? Math.sin(frame / 1.55) * 13 : 0;

  return (
    <div
      style={{
        position: "absolute",
        top: BOT_TOP,
        left: BOT_LEFT,
        width: BOT_W,
        zIndex: 20,
        transform: `translateY(${hover + shake + interpolate(enter, [0, 1], [50, 0])}px) scale(${interpolate(enter, [0, 1], [0.86, 1])})`,
        opacity: enter,
        filter: "drop-shadow(0 22px 40px rgba(0,0,0,0.6))",
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

// ---------------------------------------------------------------- window
const StepDots = ({ active }) => (
  <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
    {[1, 2, 3].map((n) => {
      const on = n === active;
      const done = active > n;
      return (
        <div
          key={n}
          style={{
            width: on ? 56 : 18,
            height: 18,
            borderRadius: 999,
            backgroundColor: on ? ACCENT : done ? "#FFC2A6" : PANEL_LINE,
            transition: "none",
          }}
        />
      );
    })}
  </div>
);

const Window = ({ children }) => (
  <div
    style={{
      position: "absolute",
      top: PANEL_TOP,
      left: PANEL_LEFT,
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
      borderRadius: 44,
      backgroundColor: PANEL_BG,
      boxShadow: "0 34px 80px rgba(0,0,0,0.5)",
      overflow: "hidden",
      fontFamily: UI_FONT,
      color: PANEL_TEXT,
      zIndex: 10,
    }}
  >
    {children}
  </div>
);

const Beat = ({ length, step, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 7, length - 9, length], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Each step slides in from the right, like pages stepping through a window
  const slide = interpolate(frame, [0, 16], [70, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `translateX(${slide}px)`,
        padding: "64px 60px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      {step > 0 ? (
        <div style={{ position: "absolute", top: 52, left: 0, right: 0 }}>
          <StepDots active={step} />
          <div
            style={{
              marginTop: 18,
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: 3,
              color: ACCENT,
            }}
          >
            STEP {step}
          </div>
        </div>
      ) : null}
      {children}
    </AbsoluteFill>
  );
};

const IconBubble = ({ name }) => (
  <div
    style={{
      width: 168,
      height: 168,
      borderRadius: 999,
      backgroundColor: ACCENT_SOFT,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: `3px solid #FFD9C6`,
    }}
  >
    <Icon name={name} size={86} />
  </div>
);

const Headline = ({ children, size = 76 }) => (
  <div style={{ fontSize: size, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.12 }}>
    {children}
  </div>
);

const Sub = ({ children }) => (
  <div style={{ marginTop: 16, fontSize: 40, color: PANEL_MUTED, fontWeight: 600 }}>{children}</div>
);

// ---------------------------------------------------------------- beats
const BeatHook = ({ length }) => (
  <Beat length={length} step={0}>
    <Headline size={92}>
      Pages change.
      <br />
      Links <span style={{ color: ACCENT }}>break.</span>
    </Headline>
    <Sub>Save it before it&rsquo;s gone</Sub>
  </Beat>
);

const BeatLink = ({ length }) => {
  const frame = useCurrentFrame();
  const url = "https://example.com/article";
  const typed = interpolate(frame, [14, 44], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <Beat length={length} step={1}>
      <IconBubble name="link" />
      <div style={{ marginTop: 28 }}>
        <Headline>Paste any link</Headline>
      </div>
      <div
        style={{
          marginTop: 26,
          width: "100%",
          padding: "22px 26px",
          borderRadius: 18,
          border: `3px solid ${PANEL_LINE}`,
          backgroundColor: "#F7F9FC",
          fontFamily: "monospace",
          fontSize: 30,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textAlign: "left",
        }}
      >
        {url.slice(0, Math.round(typed * url.length))}
        <span style={{ color: ACCENT }}>{typed < 1 ? "|" : ""}</span>
      </div>
    </Beat>
  );
};

const BeatPdf = ({ length }) => {
  const frame = useCurrentFrame();
  const fill = interpolate(frame, [10, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <Beat length={length} step={2}>
      <IconBubble name="doc" />
      <div style={{ marginTop: 28 }}>
        <Headline>Get a clean PDF</Headline>
      </div>
      <Sub>No ads, no sidebars</Sub>
      <div
        style={{
          marginTop: 30,
          width: 460,
          height: 14,
          borderRadius: 999,
          backgroundColor: PANEL_LINE,
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${fill * 100}%`, height: "100%", backgroundColor: ACCENT }} />
      </div>
    </Beat>
  );
};

const BeatShare = ({ length }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame: frame - 8, fps, config: { damping: 14, stiffness: 170 }, durationInFrames: 16 });
  const b = spring({ frame: frame - 34, fps, config: { damping: 14, stiffness: 170 }, durationInFrames: 16 });

  const Tile = ({ name, label, e }) => (
    <div
      style={{
        flex: 1,
        padding: "34px 20px",
        borderRadius: 28,
        border: `3px solid ${PANEL_LINE}`,
        backgroundColor: "#FBFCFE",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        transform: `translateY(${interpolate(e, [0, 1], [34, 0])}px) scale(${interpolate(e, [0, 1], [0.9, 1])})`,
        opacity: e,
      }}
    >
      <Icon name={name} size={72} />
      <div style={{ fontSize: 38, fontWeight: 800 }}>{label}</div>
    </div>
  );

  return (
    <Beat length={length} step={3}>
      <div style={{ marginTop: 20 }}>
        <Headline>Keep it or send it</Headline>
      </div>
      <div style={{ marginTop: 40, display: "flex", gap: 26, width: "100%" }}>
        <Tile name="download" label="Download" e={a} />
        <Tile name="mail" label="Email" e={b} />
      </div>
    </Beat>
  );
};

const BeatFree = ({ length }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = spring({ frame: frame - 18, fps, config: { damping: 18 }, durationInFrames: 22 });
  return (
    <Beat length={length} step={0}>
      <Headline size={92}>
        Free. <span style={{ color: ACCENT }}>Forever.</span>
      </Headline>
      <Sub>No signup &middot; No watermark</Sub>
      <div
        style={{
          marginTop: 48,
          fontSize: 80,
          fontWeight: 800,
          letterSpacing: -2,
          opacity: brand,
          transform: `scale(${interpolate(brand, [0, 1], [0.9, 1])})`,
        }}
      >
        Khan<span style={{ color: ACCENT }}>PDF</span>
      </div>
      <div style={{ marginTop: 8, fontSize: 42, fontWeight: 700, color: ACCENT, opacity: brand }}>
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

  const beatComponents = [BeatHook, BeatLink, BeatPdf, BeatShare, BeatFree];

  return (
    <AbsoluteFill style={{ backgroundColor: BG, overflow: "hidden" }}>
      {/* warm glows either side, as in the reference frame */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 8% 42%, rgba(255,85,13,0.16) 0%, rgba(19,28,45,0) 34%), radial-gradient(circle at 93% 46%, rgba(255,85,13,0.16) 0%, rgba(19,28,45,0) 34%)",
        }}
      />

      {/* voiceover only — no background sound effects */}
      {audioFile ? <Audio src={staticFile(audioFile)} /> : null}

      <Window>
        {BEATS.map((b, i) => {
          const Component = beatComponents[i];
          return (
            <Sequence key={b.from} from={b.from} durationInFrames={b.to - b.from}>
              <Component length={b.to - b.from} />
            </Sequence>
          );
        })}
      </Window>

      <Bot speaking={speaking} frame={frame} />

      {/* title sits directly beneath the window */}
      <div
        style={{
          position: "absolute",
          top: TITLE_TOP,
          left: 60,
          right: 60,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          zIndex: 30,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: "10px 20px",
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
            const scale = isActive ? interpolate(enter, [0, 1], [0.9, 1.06]) : 1;

            return (
              <span
                key={`${word.word}-${index}`}
                style={{
                  fontSize: 88,
                  fontWeight: 900,
                  color: isActive ? ACCENT : isSpoken ? TEXT_LIGHT : TEXT_DIM,
                  transform: `scale(${scale})`,
                  textShadow: "0 6px 20px rgba(0,0,0,0.8)",
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
