import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// The recorded read is 15.64s. Nudging playback by 5% fits it inside the 15.00s
// composition instead of cutting the last word — inaudible at this ratio.
const VO_RATE = 1.05;

// Pulled from the live site
const ACCENT = "#FF550D";
const INK = "#121417";
const MUTED = "#6B7280";
const LINE = "#E6E8EC";
const SANS =
  '"Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif';

const ease = (frame, fps, delay = 0, duration = 20) =>
  spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: duration });

// Fade a scene in and out so the cuts aren't hard
const useSceneOpacity = (length) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [0, 8, length - 12, length], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};

const Wordmark = ({ size = 96 }) => (
  <div style={{ fontSize: size, fontWeight: 800, letterSpacing: -2, color: INK }}>
    Khan<span style={{ color: ACCENT }}>PDF</span>
  </div>
);

const Chip = ({ label, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = ease(frame, fps, delay, 18);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "22px 34px",
        borderRadius: 999,
        border: "3px solid " + LINE,
        backgroundColor: "#FFFFFF",
        boxShadow: "0 10px 30px rgba(18,20,23,0.06)",
        transform:
          "translateY(" +
          interpolate(e, [0, 1], [40, 0]) +
          "px) scale(" +
          interpolate(e, [0, 1], [0.92, 1]) +
          ")",
        opacity: e,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          backgroundColor: ACCENT,
          color: "#fff",
          fontSize: 24,
          fontWeight: 900,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        &#10003;
      </div>
      <span style={{ fontSize: 38, fontWeight: 700, color: INK }}>{label}</span>
    </div>
  );
};

// ---------------------------------------------------------------- scene 1
const Intro = ({ length }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useSceneOpacity(length);
  // Tight stagger — this scene only runs while "Need any web page as a PDF?" plays
  const logo = ease(frame, fps, 0, 20);
  const line = ease(frame, fps, 8, 20);
  const pill = ease(frame, fps, 16, 18);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity }}>
      <div
        style={{
          transform: "scale(" + interpolate(logo, [0, 1], [0.8, 1]) + ")",
          opacity: logo,
        }}
      >
        <Wordmark size={130} />
      </div>

      <div
        style={{
          marginTop: 40,
          fontSize: 76,
          fontWeight: 800,
          color: INK,
          letterSpacing: -1,
          opacity: line,
          transform: "translateY(" + interpolate(line, [0, 1], [30, 0]) + "px)",
        }}
      >
        Convert <span style={{ color: ACCENT }}>URL to PDF</span>
      </div>

      <div
        style={{
          marginTop: 44,
          padding: "20px 38px",
          borderRadius: 999,
          border: "3px solid " + LINE,
          fontSize: 34,
          color: MUTED,
          opacity: pill,
          transform: "translateY(" + interpolate(pill, [0, 1], [24, 0]) + "px)",
        }}
      >
        Turn any webpage into a PDF
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- scene 2
const URL_TEXT = "https://example.com/report";

const Typing = ({ length }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useSceneOpacity(length);
  const bar = ease(frame, fps, 0, 22);

  // Reveal one character at a time, then hold
  // Typing runs under "paste the link"; the button depresses on "convert"
  const typed = Math.max(
    0,
    Math.min(
      URL_TEXT.length,
      Math.round(
        interpolate(frame, [20, 50], [0, URL_TEXT.length], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      ),
    ),
  );
  const caretOn = frame % 16 < 9 && typed < URL_TEXT.length;

  const press = ease(frame, fps, 51, 14);
  const buttonScale = interpolate(press, [0, 0.5, 1], [1, 0.94, 1]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity, padding: 90 }}>
      <div style={{ fontSize: 40, color: MUTED, marginBottom: 44, fontWeight: 600 }}>
        Paste any link
      </div>

      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 22,
          padding: "34px 38px",
          borderRadius: 28,
          border: "3px solid " + LINE,
          backgroundColor: "#FFFFFF",
          boxShadow: "0 18px 50px rgba(18,20,23,0.08)",
          transform: "translateY(" + interpolate(bar, [0, 1], [40, 0]) + "px)",
          opacity: bar,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            border: "4px solid " + MUTED,
            flexShrink: 0,
          }}
        />
        <div style={{ fontSize: 38, color: INK, fontFamily: "monospace", whiteSpace: "nowrap" }}>
          {URL_TEXT.slice(0, typed)}
          <span style={{ opacity: caretOn ? 1 : 0, color: ACCENT }}>|</span>
        </div>
      </div>

      <div
        style={{
          marginTop: 50,
          padding: "30px 76px",
          borderRadius: 999,
          backgroundColor: ACCENT,
          color: "#FFFFFF",
          fontSize: 44,
          fontWeight: 800,
          transform: "scale(" + buttonScale + ")",
          boxShadow: "0 16px 40px rgba(255,85,13,0.35)",
        }}
      >
        Convert
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- scene 3
const Result = ({ length }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useSceneOpacity(length);

  // Bar fills across "turns it into a clean, downloadable PDF", card lands on "seconds"
  const progress = interpolate(frame, [5, 92], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const card = ease(frame, fps, 92, 24);
  const trackOpacity = interpolate(frame, [92, 106], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity, padding: 90 }}>
      <div
        style={{
          width: 620,
          height: 14,
          borderRadius: 999,
          backgroundColor: LINE,
          overflow: "hidden",
          opacity: trackOpacity,
        }}
      >
        <div
          style={{ width: progress * 100 + "%", height: "100%", backgroundColor: ACCENT }}
        />
      </div>

      <div
        style={{
          marginTop: 70,
          width: 560,
          padding: 46,
          borderRadius: 34,
          backgroundColor: "#FFFFFF",
          border: "3px solid " + LINE,
          boxShadow: "0 30px 70px rgba(18,20,23,0.12)",
          transform:
            "translateY(" +
            interpolate(card, [0, 1], [70, 0]) +
            "px) scale(" +
            interpolate(card, [0, 1], [0.9, 1]) +
            ")",
          opacity: card,
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: "12px 24px",
            borderRadius: 14,
            backgroundColor: ACCENT,
            color: "#fff",
            fontSize: 30,
            fontWeight: 900,
            letterSpacing: 1,
          }}
        >
          PDF
        </div>
        {[1, 0.92, 0.97, 0.6].map((w, i) => (
          <div
            key={i}
            style={{
              marginTop: i === 0 ? 34 : 20,
              height: 18,
              width: w * 100 + "%",
              borderRadius: 999,
              backgroundColor: LINE,
            }}
          />
        ))}
      </div>

      <div style={{ marginTop: 54, fontSize: 52, fontWeight: 800, color: INK, opacity: card }}>
        Clean PDF in seconds
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- scene 4
const Outro = ({ length }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useSceneOpacity(length);
  // CTA lands on "Try it at khanpdf.com"
  const cta = ease(frame, fps, 110, 24);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity, padding: 80 }}>
      {/* Each chip appears on the phrase that names it */}
      <div style={{ display: "flex", flexDirection: "column", gap: 28, alignItems: "stretch" }}>
        <Chip label="No Sign-up" delay={3} />
        <Chip label="No Watermark" delay={45} />
        <Chip label="100% Free" delay={85} />
      </div>

      <div
        style={{
          marginTop: 86,
          opacity: cta,
          transform: "translateY(" + interpolate(cta, [0, 1], [30, 0]) + "px)",
          textAlign: "center",
        }}
      >
        <Wordmark size={74} />
        <div style={{ marginTop: 18, fontSize: 44, fontWeight: 700, color: ACCENT }}>
          khanpdf.com
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 450 frames = 15s
export const Explainer = ({ audioFile }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#FFFFFF", fontFamily: SANS }}>
      {/* Barely-there warm tint so pure white doesn't read as flat */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 50% 28%, rgba(255,85,13,0.07) 0%, rgba(255,255,255,0) 60%)",
        }}
      />

      {audioFile ? <Audio src={staticFile(audioFile)} playbackRate={VO_RATE} /> : null}

      {/* Cuts are placed on the voiceover's own phrase boundaries */}
      <Sequence from={0} durationInFrames={58}>
        <Intro length={58} />
      </Sequence>
      <Sequence from={52} durationInFrames={86}>
        <Typing length={86} />
      </Sequence>
      <Sequence from={132} durationInFrames={126}>
        <Result length={126} />
      </Sequence>
      <Sequence from={252} durationInFrames={198}>
        <Outro length={198} />
      </Sequence>
    </AbsoluteFill>
  );
};
