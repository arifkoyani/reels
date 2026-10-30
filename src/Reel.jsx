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
import { IsoDocTray } from "./IsoDocTray.jsx";

const GOLD_ACCENT = "#FAD06C";
const ACCENT = "#FF550D";
const INK = "#121417";
const MUTED = "#6B7280";
const LINE = "#E6E8EC";
const TEXT_LIGHT = "#FFFFFF";
const TEXT_DIM = "rgba(255, 255, 255, 0.45)";

const SERIF_FONT = 'Georgia, Cambria, "Times New Roman", Times, serif';
const UI_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

// Shot list. The presenter opens and closes; the middle is cut away to
// full-screen explainer panels, with no character on them.
//   PRESENTER 0-90    "What if you could keep any web page forever?"
//   SCREEN A  90-200  "KhanPDF turns any link into a clean PDF."
//   SCREEN B  200-290 "Save it offline, email it to anyone."
//   PRESENTER 290-360 "Free forever."
//   END CARD  360-450
const SHOT = {
  openA: { from: 0, duration: 90 },
  screenA: { from: 90, duration: 110 },
  screenB: { from: 200, duration: 90 },
  openB: { from: 290, duration: 70 },
  end: { from: 360, duration: 90 },
};

const CUTS = [90, 200, 290, 360];

// Presenter geometry, measured from the sprite sheet:
// the headless front body is 275x442 native and renders 700px wide (2.545x);
// the head closeup is ~0.75 of that scale, so 1.909x => 298px wide, chin at 72.7%.
// Framed waist-to-mid-thigh with the head in the upper third, so the presenter
// fills the frame the way a piece-to-camera does. Body renders 3.6x native.
const BODY_W = 990;
const BODY_LEFT = 45;
const BODY_TOP = 852;
const HEAD_W = 421;
const HEAD_LEFT = 330;
const HEAD_TOP = 440;

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

// ---------------------------------------------------------------- presenter
const Presenter = ({ speaking, frame }) => {
  const { fps } = useVideoConfig();

  // Word timestamps mark word boundaries, not phonemes, so this cycles three
  // mouth poses while a word sounds rather than claiming true lip-sync.
  const cycle = Math.floor(frame / 5) % 3;
  let head = "assets/sprites/man_head_closed.png";
  if (speaking) {
    if (cycle === 1) head = "assets/sprites/man_head_talk.png";
    else if (cycle === 2) head = "assets/sprites/man_head_wide.png";
  }

  const breathe = Math.sin(frame / 18) * 6;
  const sway = Math.sin(frame / 34) * 7;
  const headBob = Math.sin(frame / 15) * 4;
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 110 }, durationInFrames: 20 });

  return (
    <AbsoluteFill>
      {/* Room, pushed back with a soft blur so the presenter reads first */}
      <Img
        src={staticFile("assets/background.png")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${1.1 + Math.sin(frame / 90) * 0.01})`,
          filter: "blur(6px) brightness(0.82) saturate(1.05)",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 62%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translateY(${breathe + interpolate(enter, [0, 1], [70, 0])}px) translateX(${sway}px)`,
          opacity: enter,
        }}
      >
        <Img
          src={staticFile("assets/sprites/man_body_front_headless.png")}
          style={{
            position: "absolute",
            top: BODY_TOP,
            left: BODY_LEFT,
            width: BODY_W,
            height: "auto",
            filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.6))",
          }}
        />
        <Img
          src={staticFile(head)}
          style={{
            position: "absolute",
            top: HEAD_TOP + headBob,
            left: HEAD_LEFT,
            width: HEAD_W,
            height: "auto",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- screen A
const ScreenA = ({ length }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const url = "https://example.com/article";

  const e = spring({ frame, fps, config: { damping: 18 }, durationInFrames: 18 });
  const typed = interpolate(frame, [16, 58], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const done = interpolate(frame, [64, 78], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const arrow = interpolate(frame, [58, 72], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <ExplainerFrame length={length}>
      <div style={{ fontSize: 96, fontWeight: 800, color: INK, letterSpacing: -2, textAlign: "center" }}>
        Any link
      </div>

      {/* URL bar */}
      <div
        style={{
          marginTop: 46,
          width: 880,
          padding: "30px 34px",
          borderRadius: 24,
          border: `3px solid ${LINE}`,
          backgroundColor: "#fff",
          boxShadow: "0 18px 46px rgba(16,19,23,0.10)",
          fontFamily: "monospace",
          fontSize: 36,
          color: "#334155",
          whiteSpace: "nowrap",
          overflow: "hidden",
          transform: `translateY(${interpolate(e, [0, 1], [40, 0])}px)`,
          opacity: e,
        }}
      >
        {url.slice(0, Math.round(typed * url.length))}
        <span style={{ color: ACCENT }}>{typed < 1 ? "|" : ""}</span>
      </div>

      {/* arrow down */}
      <div style={{ marginTop: 30, fontSize: 72, color: ACCENT, opacity: arrow }}>&#8595;</div>

      {/* PDF result */}
      <div
        style={{
          marginTop: 24,
          width: 460,
          padding: 40,
          borderRadius: 30,
          backgroundColor: "#fff",
          border: `3px solid ${LINE}`,
          boxShadow: "0 28px 60px rgba(16,19,23,0.14)",
          opacity: done,
          transform: `scale(${interpolate(done, [0, 1], [0.88, 1])})`,
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: "12px 26px",
            borderRadius: 14,
            backgroundColor: ACCENT,
            color: "#fff",
            fontSize: 34,
            fontWeight: 900,
            letterSpacing: 1,
          }}
        >
          PDF
        </div>
        {[1, 0.9, 0.96, 0.55].map((w, i) => (
          <div
            key={i}
            style={{
              marginTop: i === 0 ? 28 : 16,
              height: 16,
              width: `${w * 100}%`,
              borderRadius: 999,
              backgroundColor: LINE,
            }}
          />
        ))}
      </div>

      <div style={{ marginTop: 34, fontSize: 56, fontWeight: 800, color: INK, opacity: done }}>
        Clean PDF, in seconds
      </div>
    </ExplainerFrame>
  );
};

// ---------------------------------------------------------------- screen B
const ScreenB = ({ length }) => {
  const frame = useCurrentFrame();
  const lift = interpolate(frame, [6, 44], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <ExplainerFrame length={length}>
      <div style={{ fontSize: 96, fontWeight: 800, color: INK, letterSpacing: -2, textAlign: "center" }}>
        Keep it. Send it.
      </div>

      <div style={{ marginTop: 10 }}>
        <IsoDocTray lift={lift} size={520} />
      </div>

      <div style={{ marginTop: 20, display: "flex", gap: 26 }}>
        <Chip label="Save offline" delay={18} />
        <Chip label="Email it" delay={42} />
      </div>
    </ExplainerFrame>
  );
};

// A white explainer panel: the character is cut away entirely for these.
const ExplainerFrame = ({ length, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 5, length - 8, length], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: "#FFFFFF", fontFamily: UI_FONT }}>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 50% 30%, rgba(255,85,13,0.09) 0%, rgba(255,255,255,0) 62%)",
        }}
      />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          padding: "0 80px",
          paddingBottom: 360,
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

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
        fontSize: 44,
        fontWeight: 700,
        color: INK,
        whiteSpace: "nowrap",
        transform: `translateY(${interpolate(e, [0, 1], [34, 0])}px) scale(${interpolate(e, [0, 1], [0.88, 1])})`,
        opacity: e,
      }}
    >
      <span style={{ color: ACCENT }}>&#10003;</span>
      {label}
    </div>
  );
};

// ---------------------------------------------------------------- hook text
const HookText = ({ length }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame: frame - 4, fps, config: { damping: 15, stiffness: 120 }, durationInFrames: 22 });
  const out = interpolate(frame, [length - 18, length - 2], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 170,
        left: 80,
        right: 80,
        textAlign: "center",
        opacity: e * out,
        transform: `translateY(${interpolate(e, [0, 1], [-50, 0])}px)`,
      }}
    >
      <div
        style={{
          fontFamily: UI_FONT,
          fontSize: 100,
          fontWeight: 800,
          lineHeight: 1.08,
          letterSpacing: -2,
          color: TEXT_LIGHT,
          textShadow: "0 8px 30px rgba(0,0,0,0.9)",
        }}
      >
        Keep any webpage
      </div>
      <div
        style={{
          marginTop: 8,
          fontFamily: SERIF_FONT,
          fontSize: 100,
          fontWeight: 900,
          color: GOLD_ACCENT,
          textShadow: "0 8px 30px rgba(0,0,0,0.9)",
        }}
      >
        forever.
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- end card
const EndCard = ({ length }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame, fps, config: { damping: 18, stiffness: 100 }, durationInFrames: 26 });
  const fade = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0C0E14", opacity: fade }}>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          opacity: e,
          transform: `scale(${interpolate(e, [0, 1], [0.9, 1])})`,
        }}
      >
        <div style={{ fontFamily: UI_FONT, fontSize: 132, fontWeight: 800, color: TEXT_LIGHT, letterSpacing: -3 }}>
          Khan<span style={{ color: GOLD_ACCENT }}>PDF</span>
        </div>
        <div style={{ marginTop: 22, fontFamily: SERIF_FONT, fontSize: 66, fontWeight: 700, color: GOLD_ACCENT }}>
          khanpdf.com
        </div>
        <div
          style={{
            marginTop: 44,
            fontFamily: UI_FONT,
            fontSize: 44,
            fontWeight: 600,
            color: "rgba(255,255,255,0.72)",
          }}
        >
          Free &middot; No signup &middot; No watermark
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 450 frames
export const Reel = ({ audioFile, transcription }) => {
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

  // A short white flash on each cut makes the edit feel deliberate
  const flash = CUTS.reduce((acc, cut) => {
    const f = interpolate(frame, [cut - 2, cut, cut + 5], [0, 0.5, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return Math.max(acc, f);
  }, 0);

  const captionsVisible = frame < SHOT.end.from + 10;

  // The explainer panels are white, so gold-on-white captions would vanish.
  // Flip the caption palette for the duration of those two shots.
  const onWhite = frame >= SHOT.screenA.from && frame < SHOT.openB.from;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0C0E14", overflow: "hidden" }}>
      {audioFile ? <Audio src={staticFile(audioFile)} /> : null}

      {/* a soft whoosh on every cut */}
      {CUTS.map((cut) => (
        <Sequence key={cut} from={cut - 3} durationInFrames={26}>
          <Audio src={staticFile("sfx/whoosh.mp3")} volume={0.26} />
        </Sequence>
      ))}
      <Sequence from={218} durationInFrames={16}>
        <Audio src={staticFile("sfx/pop.mp3")} volume={0.26} />
      </Sequence>
      <Sequence from={242} durationInFrames={16}>
        <Audio src={staticFile("sfx/pop.mp3")} volume={0.26} />
      </Sequence>
      <Sequence from={SHOT.end.from} durationInFrames={44}>
        <Audio src={staticFile("sfx/success.mp3")} volume={0.42} />
      </Sequence>

      {/* ---- SHOT 1: presenter, hook ---- */}
      <Sequence from={SHOT.openA.from} durationInFrames={SHOT.openA.duration}>
        <Presenter speaking={speaking} frame={frame} />
        <HookText length={SHOT.openA.duration} />
      </Sequence>

      {/* ---- SHOT 2: explainer screen, no character ---- */}
      <Sequence from={SHOT.screenA.from} durationInFrames={SHOT.screenA.duration}>
        <ScreenA length={SHOT.screenA.duration} />
      </Sequence>

      {/* ---- SHOT 3: explainer screen, no character ---- */}
      <Sequence from={SHOT.screenB.from} durationInFrames={SHOT.screenB.duration}>
        <ScreenB length={SHOT.screenB.duration} />
      </Sequence>

      {/* ---- SHOT 4: back to the presenter for the payoff ---- */}
      <Sequence from={SHOT.openB.from} durationInFrames={SHOT.openB.duration}>
        <Presenter speaking={speaking} frame={frame} />
      </Sequence>

      {/* ---- SHOT 5: end card ---- */}
      <Sequence from={SHOT.end.from} durationInFrames={SHOT.end.duration}>
        <EndCard length={SHOT.end.duration} />
      </Sequence>

      {/* cut flash */}
      <AbsoluteFill style={{ backgroundColor: "#FFFFFF", opacity: flash, pointerEvents: "none" }} />

      {/* ---- captions, over every shot ---- */}
      {captionsVisible ? (
        <div
          style={{
            position: "absolute",
            bottom: 200,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            padding: "0 80px",
            zIndex: 30,
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
                    color: onWhite
                      ? isActive
                        ? ACCENT
                        : isSpoken
                          ? INK
                          : MUTED
                      : isActive
                        ? GOLD_ACCENT
                        : isSpoken
                          ? TEXT_LIGHT
                          : TEXT_DIM,
                    transform: `scale(${scale})`,
                    textShadow: onWhite
                      ? "0 2px 10px rgba(255,255,255,0.9)"
                      : "0 6px 18px rgba(0,0,0,0.95), 0 2px 4px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)",
                  }}
                >
                  {word.word}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
