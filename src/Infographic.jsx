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
import { createTikTokStyleCaptions } from "@remotion/captions";
import captionData from "./vo-captions.json";

// Brand, sampled from khanpdf.com
const ACCENT = "#FF550D";
const INK = "#101317";
const MUTED = "#6B7280";
const LINE = "#E6E8EC";
const PAPER = "#FFFFFF";
const SANS =
  '"Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif';

// video-layout.md: 80px from the sides, 100px top/bottom on a 1080px-wide video
const SAFE_X = 80;

// Scene cuts taken from the voiceover's own word timestamps
const SCENES = {
  problem: { from: 0, duration: 168 },
  solution: { from: 168, duration: 112 },
  // runs slightly past the next cut so "Hit convert" is readable, not a flash
  steps: { from: 280, duration: 100 },
  result: { from: 370, duration: 210 },
  settings: { from: 580, duration: 85 },
  outro: { from: 665, duration: 235 },
};

// Sound effects, placed on the beat they belong to
const POPS = [8, 49, 89, 285, 330, 352, 518, 560, 670, 715, 743];
const WHOOSHES = [168, 280, 370, 580, 665];
const SUCCESS_AT = 499;

const pop = (frame, fps, delay = 0, duration = 16) =>
  spring({ frame: frame - delay, fps, config: { damping: 180, stiffness: 190 }, durationInFrames: duration });

// Scene wrapper: fades in, holds, fades out
const Scene = ({ length, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 7, length - 10, length], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        opacity,
        justifyContent: "center",
        alignItems: "center",
        padding: `0 ${SAFE_X}px`,
        // leave the lower band clear for captions, without stranding content up top
        paddingBottom: 300,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const Wordmark = ({ size }) => (
  <span style={{ fontSize: size, fontWeight: 800, letterSpacing: -2, color: INK }}>
    Khan<span style={{ color: ACCENT }}>PDF</span>
  </span>
);

const Headline = ({ children, size = 92 }) => (
  <div
    style={{
      fontSize: size,
      lineHeight: 1.12,
      fontWeight: 800,
      letterSpacing: -2,
      color: INK,
      textAlign: "center",
    }}
  >
    {children}
  </div>
);

// A row that pops up from below
const PopRow = ({ delay, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = pop(frame, fps, delay);
  return (
    <div
      style={{
        transform: `translateY(${interpolate(e, [0, 1], [50, 0])}px) scale(${interpolate(e, [0, 1], [0.9, 1])})`,
        opacity: e,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// A row that slides in from the left
const SlideRow = ({ delay, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = pop(frame, fps, delay, 20);
  return (
    <div
      style={{
        transform: `translateX(${interpolate(e, [0, 1], [-260, 0])}px)`,
        opacity: e,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

const Pill = ({ children, tone = "plain" }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 18,
      padding: "24px 38px",
      borderRadius: 999,
      border: `3px solid ${tone === "accent" ? ACCENT : LINE}`,
      backgroundColor: tone === "accent" ? "#FFF4EE" : PAPER,
      boxShadow: "0 12px 32px rgba(16,19,23,0.07)",
      fontSize: 48,
      fontWeight: 700,
      color: INK,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </div>
);

const Mark = ({ symbol, color }) => (
  <span
    style={{
      width: 52,
      height: 52,
      borderRadius: 999,
      backgroundColor: color,
      color: "#fff",
      fontSize: 30,
      fontWeight: 900,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}
  >
    {symbol}
  </span>
);

// ------------------------------------------------------------------ scenes
const Problem = ({ length }) => (
  <Scene length={length}>
    <Headline>Webpages
      <br />
      don&rsquo;t last.
    </Headline>
    <div style={{ marginTop: 70, display: "flex", flexDirection: "column", gap: 28 }}>
      {[
        { label: "Pages change", delay: 8 },
        { label: "Links break", delay: 49 },
        { label: "Articles vanish", delay: 89 },
      ].map((row) => (
        <PopRow key={row.label} delay={row.delay}>
          <Pill>
            <Mark symbol="&#10005;" color={ACCENT} />
            <span style={{ textDecoration: "line-through", color: MUTED }}>{row.label}</span>
          </Pill>
        </PopRow>
      ))}
    </div>
  </Scene>
);

const Solution = ({ length }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const snap = pop(frame, fps, 22, 20);

  return (
    <Scene length={length}>
      <PopRow delay={0}>
        <Wordmark size={104} />
      </PopRow>
      <div style={{ marginTop: 44 }}>
        <Headline size={86}>freezes the page exactly as it looks today</Headline>
      </div>
      <div
        style={{
          marginTop: 60,
          padding: "26px 46px",
          borderRadius: 24,
          backgroundColor: ACCENT,
          color: "#fff",
          fontSize: 48,
          fontWeight: 800,
          transform: `scale(${interpolate(snap, [0, 1], [0.7, 1])})`,
          opacity: snap,
          boxShadow: "0 18px 44px rgba(255,85,13,0.35)",
        }}
      >
        Saved forever
      </div>
    </Scene>
  );
};

const Steps = ({ length }) => (
  <Scene length={length}>
    <Headline size={86}>Three steps.</Headline>
    <div style={{ marginTop: 64, display: "flex", flexDirection: "column", gap: 30 }}>
      {[
        { n: "1", label: "Copy the link", delay: 5 },
        { n: "2", label: "Paste it", delay: 46 },
        { n: "3", label: "Hit convert", delay: 66 },
      ].map((step) => (
        <SlideRow key={step.n} delay={step.delay}>
          <Pill tone="accent">
            <Mark symbol={step.n} color={ACCENT} />
            {step.label}
          </Pill>
        </SlideRow>
      ))}
    </div>
  </Scene>
);

const Result = ({ length }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Bar fills while the voice describes the server render; card lands on "clean PDF"
  const progress = interpolate(frame, [20, 125], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const card = pop(frame, fps, 129, 24);
  const barOpacity = interpolate(frame, [125, 140], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Scene length={length}>
      <Headline size={84}>Rendered like a real browser.</Headline>

      <div
        style={{
          marginTop: 56,
          width: 620,
          height: 16,
          borderRadius: 999,
          backgroundColor: LINE,
          overflow: "hidden",
          opacity: barOpacity,
        }}
      >
        <div style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: ACCENT }} />
      </div>

      <div
        style={{
          marginTop: 44,
          width: 560,
          padding: 44,
          borderRadius: 32,
          backgroundColor: PAPER,
          border: `3px solid ${LINE}`,
          boxShadow: "0 30px 70px rgba(16,19,23,0.14)",
          transform: `translateY(${interpolate(card, [0, 1], [60, 0])}px) scale(${interpolate(card, [0, 1], [0.9, 1])})`,
          opacity: card,
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
              marginTop: i === 0 ? 30 : 18,
              height: 18,
              width: `${w * 100}%`,
              borderRadius: 999,
              backgroundColor: LINE,
            }}
          />
        ))}
      </div>

      <div style={{ marginTop: 44, display: "flex", gap: 24 }}>
        <PopRow delay={148}>
          <Pill>
            <Mark symbol="&#10005;" color={MUTED} />
            <span style={{ textDecoration: "line-through", color: MUTED }}>Ads</span>
          </Pill>
        </PopRow>
        <PopRow delay={190}>
          <Pill>
            <Mark symbol="&#10005;" color={MUTED} />
            <span style={{ textDecoration: "line-through", color: MUTED }}>Sidebars</span>
          </Pill>
        </PopRow>
      </div>
    </Scene>
  );
};

const Settings = ({ length }) => (
  <Scene length={length}>
    <Headline size={86}>Your paper, your rules.</Headline>
    <div
      style={{
        marginTop: 56,
        display: "flex",
        flexWrap: "wrap",
        gap: 24,
        justifyContent: "center",
      }}
    >
      {["A4", "Letter", "Legal", "Portrait", "Landscape", "Margins"].map((label, i) => (
        <PopRow key={label} delay={i * 7}>
          <Pill>{label}</Pill>
        </PopRow>
      ))}
    </div>
    <PopRow delay={62} style={{ marginTop: 46 }}>
      <div style={{ fontSize: 48, color: MUTED, fontWeight: 600 }}>&hellip; or keep the defaults</div>
    </PopRow>
  </Scene>
);

const Outro = ({ length }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cta = pop(frame, fps, 120, 24);

  return (
    <Scene length={length}>
      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        {[
          { label: "No sign-up", delay: 5 },
          { label: "No watermark", delay: 50 },
          { label: "100% free", delay: 78 },
        ].map((chip) => (
          <PopRow key={chip.label} delay={chip.delay}>
            <Pill tone="accent">
              <Mark symbol="&#10003;" color={ACCENT} />
              {chip.label}
            </Pill>
          </PopRow>
        ))}
      </div>

      <div
        style={{
          marginTop: 80,
          textAlign: "center",
          opacity: cta,
          transform: `translateY(${interpolate(cta, [0, 1], [34, 0])}px)`,
        }}
      >
        <Wordmark size={88} />
        <div style={{ marginTop: 16, fontSize: 56, fontWeight: 800, color: ACCENT }}>
          khanpdf.com
        </div>
      </div>
    </Scene>
  );
};

// ------------------------------------------------------------------ captions
const Captions = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeMs = (frame / fps) * 1000;

  const { pages } = createTikTokStyleCaptions({
    captions: captionData,
    combineTokensWithinMilliseconds: 1100,
  });

  const page = pages.find(
    (p) => timeMs >= p.startMs && timeMs < p.startMs + p.durationMs,
  );
  if (!page) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 170,
        left: SAFE_X,
        right: SAFE_X,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "8px 16px",
      }}
    >
      {page.tokens.map((token, i) => {
        const active = timeMs >= token.fromMs && timeMs < token.toMs;
        return (
          <span
            key={`${token.text}-${i}`}
            style={{
              fontSize: 54,
              fontWeight: 800,
              color: active ? ACCENT : INK,
              letterSpacing: -0.5,
            }}
          >
            {token.text.trim()}
          </span>
        );
      })}
    </div>
  );
};

// ------------------------------------------------------------------ 900 frames
export const Infographic = ({ audioFile }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER, fontFamily: SANS }}>
      {/* Faint warm wash so flat white has some depth */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 50% 26%, rgba(255,85,13,0.08) 0%, rgba(255,255,255,0) 62%)",
        }}
      />

      {audioFile ? <Audio src={staticFile(audioFile)} /> : null}

      {/* Sound design */}
      {WHOOSHES.map((f) => (
        <Sequence key={`w${f}`} from={f} durationInFrames={28}>
          <Audio src={staticFile("sfx/whoosh.mp3")} volume={0.28} />
        </Sequence>
      ))}
      {POPS.map((f) => (
        <Sequence key={`p${f}`} from={f} durationInFrames={18}>
          <Audio src={staticFile("sfx/pop.mp3")} volume={0.32} />
        </Sequence>
      ))}
      <Sequence from={SUCCESS_AT} durationInFrames={40}>
        <Audio src={staticFile("sfx/success.mp3")} volume={0.45} />
      </Sequence>

      {/* Scenes, cut on the voiceover's phrase boundaries */}
      <Sequence from={SCENES.problem.from} durationInFrames={SCENES.problem.duration}>
        <Problem length={SCENES.problem.duration} />
      </Sequence>
      <Sequence from={SCENES.solution.from} durationInFrames={SCENES.solution.duration}>
        <Solution length={SCENES.solution.duration} />
      </Sequence>
      <Sequence from={SCENES.steps.from} durationInFrames={SCENES.steps.duration}>
        <Steps length={SCENES.steps.duration} />
      </Sequence>
      <Sequence from={SCENES.result.from} durationInFrames={SCENES.result.duration}>
        <Result length={SCENES.result.duration} />
      </Sequence>
      <Sequence from={SCENES.settings.from} durationInFrames={SCENES.settings.duration}>
        <Settings length={SCENES.settings.duration} />
      </Sequence>
      <Sequence from={SCENES.outro.from} durationInFrames={SCENES.outro.duration}>
        <Outro length={SCENES.outro.duration} />
      </Sequence>

      <Captions />
    </AbsoluteFill>
  );
};
