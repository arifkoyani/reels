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
const TEXT_LIGHT = "#FFFFFF";
const TEXT_DIM = "rgba(255,255,255,0.42)";
const GOLD = "#FAD06C";
const ACCENT = "#FF550D";
const PANEL = "rgba(255,255,255,0.06)";
const PANEL_LINE = "rgba(255,255,255,0.16)";

const SERIF_FONT = 'Georgia, Cambria, "Times New Roman", Times, serif';
const UI_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

// Vertical zones. The bot sits just above the captions; everything that
// explains lives in the open space above the bot.
const CAPTION_BOTTOM = 160;
const BOT_TOP = 1170;
const BOT_W = 400;
const INFO_TOP = 150;
const INFO_HEIGHT = 1000;

// The audio's first sentence ends at frame 128; stop there so no word is clipped.
const SPEECH_END = 132;

// bot_large.png has a mouth painted on, so that band is masked with the screen's
// own colour (sampled from the asset) before the live bars are drawn.
const SCREEN = "rgb(22, 26, 36)";

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
        top: "63%",
        width: "31%",
        height: "13%",
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
                backgroundColor: GOLD,
                boxShadow: `0 0 10px ${GOLD}`,
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
  const tilt = Math.sin(frame / 19) * 2.4;

  return (
    <div
      style={{
        position: "absolute",
        top: BOT_TOP,
        left: (1080 - BOT_W) / 2,
        width: BOT_W,
        transform: `translateY(${floatY + interpolate(enter, [0, 1], [60, 0])}px) rotate(${tilt}deg) scale(${interpolate(enter, [0, 1], [0.86, 1])})`,
        opacity: enter,
        filter: "drop-shadow(0 26px 40px rgba(0,0,0,0.55))",
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

// ---------------------------------------------------------------- infographic
const Info = ({ frame }) => {
  const { fps } = useVideoConfig();
  const url = "https://example.com/article";

  const title = spring({ frame: frame - 6, fps, config: { damping: 18 }, durationInFrames: 20 });
  const barIn = spring({ frame: frame - 22, fps, config: { damping: 18 }, durationInFrames: 20 });
  const typed = interpolate(frame, [30, 64], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const arrow = interpolate(frame, [68, 82], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const card = spring({ frame: frame - 90, fps, config: { damping: 16, stiffness: 120 }, durationInFrames: 24 });

  return (
    <div
      style={{
        position: "absolute",
        top: INFO_TOP,
        left: 80,
        right: 80,
        height: INFO_HEIGHT,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: UI_FONT,
      }}
    >
      <div
        style={{
          fontSize: 88,
          fontWeight: 800,
          letterSpacing: -2,
          color: TEXT_LIGHT,
          textAlign: "center",
          opacity: title,
          transform: `translateY(${interpolate(title, [0, 1], [-30, 0])}px)`,
        }}
      >
        Any webpage, <span style={{ color: GOLD }}>one PDF</span>
      </div>

      {/* URL bar */}
      <div
        style={{
          marginTop: 56,
          width: "100%",
          padding: "28px 32px",
          borderRadius: 22,
          backgroundColor: PANEL,
          border: `3px solid ${PANEL_LINE}`,
          fontFamily: "monospace",
          fontSize: 36,
          color: TEXT_LIGHT,
          whiteSpace: "nowrap",
          overflow: "hidden",
          opacity: barIn,
          transform: `translateY(${interpolate(barIn, [0, 1], [30, 0])}px)`,
        }}
      >
        {url.slice(0, Math.round(typed * url.length))}
        <span style={{ color: GOLD }}>{typed < 1 ? "|" : ""}</span>
      </div>

      <div style={{ marginTop: 26, fontSize: 64, color: GOLD, opacity: arrow, lineHeight: 1 }}>
        &#8595;
      </div>

      {/* PDF result */}
      <div
        style={{
          marginTop: 26,
          width: 420,
          padding: 34,
          borderRadius: 26,
          backgroundColor: PANEL,
          border: `3px solid ${PANEL_LINE}`,
          opacity: card,
          transform: `translateY(${interpolate(card, [0, 1], [40, 0])}px) scale(${interpolate(card, [0, 1], [0.9, 1])})`,
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: "10px 22px",
            borderRadius: 12,
            backgroundColor: ACCENT,
            color: "#fff",
            fontSize: 30,
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
              backgroundColor: "rgba(255,255,255,0.22)",
            }}
          />
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- 150 frames
export const BotReel = ({ audioFile, transcription }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;

  const words = transcription?.words ?? [];
  const pages = buildPages(words);

  // Only treat speech inside the trimmed range as "speaking"
  const speaking =
    frame < SPEECH_END && words.some((w) => time >= w.start && time <= w.end);

  // Only pages that FINISH inside the trimmed audio — otherwise a caption shows
  // words the viewer never hears.
  const visiblePages = pages.filter((p) => p.end * fps <= SPEECH_END);
  let activePageIndex = visiblePages.findIndex((p) => time >= p.start && time <= p.end);
  if (activePageIndex === -1) {
    const passed = visiblePages.filter((p) => p.end < time);
    activePageIndex = passed.length > 0 ? visiblePages.indexOf(passed[passed.length - 1]) : 0;
  }
  const activePage = visiblePages[activePageIndex];

  return (
    <AbsoluteFill style={{ backgroundColor: BG, overflow: "hidden" }}>
      {/* a little depth so the flat navy doesn't read as dead */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 34%, rgba(250,208,108,0.10) 0%, rgba(19,28,45,0) 60%)",
        }}
      />

      {/* Audio stops on the sentence boundary so no word is cut mid-way */}
      <Sequence from={0} durationInFrames={SPEECH_END}>
        {audioFile ? <Audio src={staticFile(audioFile)} /> : null}
      </Sequence>

      <Info frame={frame} />
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
                  fontSize: 84,
                  fontWeight: 900,
                  color: isActive ? GOLD : isSpoken ? TEXT_LIGHT : TEXT_DIM,
                  transform: `scale(${scale})`,
                  textShadow: "0 6px 18px rgba(0,0,0,0.75)",
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
