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
const TEXT_LIGHT = "#FFFFFF";
const TEXT_DIM = "rgba(255, 255, 255, 0.45)";

const SERIF_FONT = 'Georgia, Cambria, "Times New Roman", Times, serif';
const UI_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

// Act boundaries, placed on the voiceover's own word timestamps.
//   HOOK    0-90    "What if you could keep any web page forever?"
//   EXPLAIN 90-205  "KhanPDF turns any link into a clean PDF."
//   DEMO    205-330 "Save it offline, email it to anyone."
//   PAYOFF  330-450 "Free forever." then the end card
const ACT = {
  hook: { from: 0, duration: 90 },
  explain: { from: 90, duration: 125 },
  demo: { from: 205, duration: 135 },
  payoff: { from: 330, duration: 120 },
};

// Break words into caption pages of up to 3 words so a page never overflows
// the 920px safe width at this type size.
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

export const Reel = ({ audioFile, transcription }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const time = frame / fps;

  const words = transcription?.words ?? [];
  const pages = buildPages(words);

  // Word timestamps give word boundaries, not phonemes — so this drives a
  // three-pose mouth cycle while a word is sounding, not true lip-sync.
  const isAudioSpeaking = words.some((w) => time >= w.start && time <= w.end);

  let activePageIndex = pages.findIndex((p) => time >= p.start && time <= p.end);
  if (activePageIndex === -1) {
    const passed = pages.filter((p) => p.end < time);
    activePageIndex = passed.length > 0 ? pages.indexOf(passed[passed.length - 1]) : 0;
  }
  const activePage = pages[activePageIndex];

  // --- 1. IDLE & FLOATING MOTIONS ---
  const manBreathing = Math.sin(frame / 16) * 5;
  const botFloatY = Math.sin(frame / 12) * 16;
  const botFloatX = Math.cos(frame / 24) * 5;
  const botTilt = Math.sin(frame / 18) * 3;

  // --- 2. MOUTH / HEAD POSE CYCLING ---
  const mouthFrameCycle = Math.floor(frame / 5) % 3;
  let manHeadSprite = "assets/sprites/man_head_closed.png";
  if (isAudioSpeaking) {
    if (mouthFrameCycle === 1) manHeadSprite = "assets/sprites/man_head_talk.png";
    else if (mouthFrameCycle === 2) manHeadSprite = "assets/sprites/man_head_wide.png";
  }
  // The face tiles on the sheet carry their own bezel, which reads as a bezel
  // inside a bezel over the hero's round head — so the screen mouth is drawn
  // live over the one painted into bot_large.png instead.

  // --- 3. ENTRANCES ---
  const manEnter = spring({ frame, fps, config: { damping: 16, stiffness: 110 }, durationInFrames: 26 });
  const botEnter = spring({
    frame: frame - ACT.demo.from,
    fps,
    config: { damping: 15, stiffness: 95 },
    durationInFrames: 32,
  });

  // --- 4. SUBTLE CAMERA ---
  // Slow push on the room only, so the characters don't drift with it.
  const camScale = interpolate(frame, [0, durationInFrames], [1.04, 1.12]);
  const camDrift = interpolate(frame, [0, durationInFrames], [0, -26]);

  // Payoff scrim and end card
  const scrim = interpolate(frame, [ACT.payoff.from + 12, ACT.payoff.from + 40], [0, 0.88], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const endCard = spring({
    frame: frame - (ACT.payoff.from + 18),
    fps,
    config: { damping: 18, stiffness: 100 },
    durationInFrames: 30,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0C0E14", overflow: "hidden" }}>
      {audioFile ? <Audio src={staticFile(audioFile)} /> : null}

      {/* Sound design — only where it marks a real beat */}
      <Sequence from={ACT.explain.from} durationInFrames={20}>
        <Audio src={staticFile("sfx/pop.mp3")} volume={0.3} />
      </Sequence>
      <Sequence from={ACT.demo.from} durationInFrames={30}>
        <Audio src={staticFile("sfx/whoosh.mp3")} volume={0.32} />
      </Sequence>
      <Sequence from={224} durationInFrames={18}>
        <Audio src={staticFile("sfx/pop.mp3")} volume={0.28} />
      </Sequence>
      <Sequence from={247} durationInFrames={18}>
        <Audio src={staticFile("sfx/pop.mp3")} volume={0.28} />
      </Sequence>
      <Sequence from={ACT.payoff.from + 14} durationInFrames={40}>
        <Audio src={staticFile("sfx/success.mp3")} volume={0.42} />
      </Sequence>

      {/* ======================================================== */}
      {/* LAYER 1: ROOM BACKGROUND (slow push)                     */}
      {/* ======================================================== */}
      <AbsoluteFill>
        <Img
          src={staticFile("assets/background.png")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${camScale}) translateY(${camDrift}px)`,
            filter: "brightness(0.96) contrast(1.05)",
          }}
        />
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.48) 100%)",
            pointerEvents: "none",
          }}
        />
      </AbsoluteFill>

      {/* ======================================================== */}
      {/* LAYER 2: MAN CHARACTER (SEATED AT DESK)                  */}
      {/* ======================================================== */}
      <div
        style={{
          position: "absolute",
          left: 140,
          bottom: 340,
          width: 380,
          height: 680,
          transform: `translateY(${manBreathing + interpolate(manEnter, [0, 1], [90, 0])}px)`,
          opacity: manEnter,
          zIndex: 5,
        }}
      >
        {/* Headless body: the full 3/4 sprite already has a head, so overlaying
            the lip-sync head on it produced two heads. This one is cut at the neck. */}
        <Img
          src={staticFile("assets/sprites/man_body_34_headless.png")}
          style={{
            position: "absolute",
            bottom: 0,
            left: 50,
            width: 290,
            height: "auto",
            filter: "drop-shadow(0 15px 25px rgba(0,0,0,0.65))",
          }}
        />
        {/* Head scaled so its chin meets the neck: body renders at 1.487x its
            native size, the head closeup is ~0.78 of that, so 1.161x => 181px wide. */}
        <Img
          src={staticFile(manHeadSprite)}
          style={{
            position: "absolute",
            top: -152,
            left: 100,
            width: 181,
            height: "auto",
            zIndex: 6,
          }}
        />
      </div>

      {/* ======================================================== */}
      {/* LAYER 3: FLOATING AVATAR BOT — enters on the demo act    */}
      {/* ======================================================== */}
      <Sequence from={ACT.demo.from} durationInFrames={durationInFrames - ACT.demo.from}>
        <div
          style={{
            position: "absolute",
            right: 90,
            bottom: 500,
            width: 440,
            height: 440,
            transform: `translate(${botFloatX + interpolate(botEnter, [0, 1], [240, 0])}px, ${botFloatY}px) rotate(${botTilt}deg) scale(${interpolate(botEnter, [0, 1], [0.8, 1])})`,
            opacity: botEnter,
            zIndex: 8,
            filter: "drop-shadow(0 25px 35px rgba(0,0,0,0.55))",
          }}
        >
          <Img
            src={staticFile("assets/sprites/bot_large.png")}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
          <BotMouth speaking={isAudioSpeaking} frame={frame} />
        </div>
      </Sequence>

      {/* ======================================================== */}
      {/* ACT 1 — HOOK: bold headline                              */}
      {/* ======================================================== */}
      <Sequence from={ACT.hook.from} durationInFrames={ACT.hook.duration}>
        <Hook />
      </Sequence>

      {/* ======================================================== */}
      {/* ACT 2 — EXPLANATION: URL to PDF card                     */}
      {/* ======================================================== */}
      <Sequence from={ACT.explain.from} durationInFrames={ACT.explain.duration}>
        <ConvertCard />
      </Sequence>

      {/* ======================================================== */}
      {/* ACT 3 — DEMONSTRATION: isometric tray + benefit badges   */}
      {/* ======================================================== */}
      <Sequence from={ACT.demo.from} durationInFrames={ACT.demo.duration}>
        <Demo />
      </Sequence>

      {/* ======================================================== */}
      {/* ACT 4 — PAYOFF: scrim + end card                         */}
      {/* ======================================================== */}
      <AbsoluteFill
        style={{
          backgroundColor: "#0C0E14",
          opacity: scrim,
          zIndex: 18,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 19,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          opacity: endCard,
          transform: `scale(${interpolate(endCard, [0, 1], [0.88, 1])})`,
          pointerEvents: "none",
        }}
      >
        <div style={{ fontFamily: UI_FONT, fontSize: 128, fontWeight: 800, color: TEXT_LIGHT, letterSpacing: -3 }}>
          Khan<span style={{ color: GOLD_ACCENT }}>PDF</span>
        </div>
        <div
          style={{
            marginTop: 24,
            fontFamily: SERIF_FONT,
            fontSize: 64,
            fontWeight: 700,
            color: GOLD_ACCENT,
          }}
        >
          khanpdf.com
        </div>
        <div
          style={{
            marginTop: 40,
            fontFamily: UI_FONT,
            fontSize: 44,
            fontWeight: 600,
            color: "rgba(255,255,255,0.72)",
          }}
        >
          Free · No signup · No watermark
        </div>
      </div>

      {/* ======================================================== */}
      {/* LAYER 5: CAPTIONS (word-by-word golden subtitles)        */}
      {/* ======================================================== */}
      <div
        style={{
          position: "absolute",
          bottom: 220,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "0 80px",
          zIndex: 20,
          opacity: 1 - scrim / 0.88,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: "14px 22px",
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
            const scale = isActive ? interpolate(enter, [0, 1], [0.88, 1.1]) : 1;

            return (
              <span
                key={`${word.word}-${index}`}
                style={{
                  fontSize: 88,
                  fontWeight: 900,
                  letterSpacing: "0.5px",
                  color: isActive ? GOLD_ACCENT : isSpoken ? TEXT_LIGHT : TEXT_DIM,
                  transform: `scale(${scale})`,
                  textShadow: "0 6px 18px rgba(0, 0, 0, 0.95), 0 2px 4px rgba(0, 0, 0, 0.9)",
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

// ---------------------------------------------------------------- bot screen
// bot_large.png has a mouth painted on, so that band is masked with the screen's
// own colour (sampled from the asset) before the live bars are drawn over it.
const SCREEN = "rgb(22, 26, 36)";

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
          const wobble = 0.55 + 0.45 * Math.sin(frame / 2.1 + i * 1.4);
          const height = speaking ? Math.max(9, taper * wobble * 95) : 9;
          return (
            <div
              key={i}
              style={{
                width: `${100 / (bars * 2.1)}%`,
                height: `${height}%`,
                borderRadius: 999,
                backgroundColor: GOLD_ACCENT,
                boxShadow: `0 0 10px ${GOLD_ACCENT}`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- act 1
const Hook = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame: frame - 4, fps, config: { damping: 15, stiffness: 120 }, durationInFrames: 24 });
  const out = interpolate(frame, [72, 88], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 190,
        left: 80,
        right: 80,
        zIndex: 16,
        textAlign: "center",
        opacity: e * out,
        transform: `translateY(${interpolate(e, [0, 1], [-60, 0])}px)`,
      }}
    >
      <div
        style={{
          fontFamily: UI_FONT,
          fontSize: 104,
          fontWeight: 800,
          lineHeight: 1.08,
          letterSpacing: -2,
          color: "#FFFFFF",
          textShadow: "0 8px 30px rgba(0,0,0,0.9)",
        }}
      >
        Keep any webpage
      </div>
      <div
        style={{
          marginTop: 10,
          fontFamily: SERIF_FONT,
          fontSize: 104,
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

// ---------------------------------------------------------------- act 2
const ConvertCard = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame: frame - 2, fps, config: { damping: 14, stiffness: 120 }, durationInFrames: 26 });
  const out = interpolate(frame, [108, 124], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // The link fills in, then the badge flips to PDF
  const typed = interpolate(frame, [18, 54], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const url = "https://example.com/article";
  const done = interpolate(frame, [60, 74], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 150,
        left: 70,
        width: 600,
        backgroundColor: "#FFFFFF",
        borderRadius: 26,
        padding: "26px 30px",
        boxShadow: "0 20px 45px rgba(0,0,0,0.45), 0 4px 12px rgba(0,0,0,0.15)",
        transform: `translateX(${interpolate(e, [0, 1], [-640, 0])}px)`,
        opacity: e * out,
        zIndex: 15,
        fontFamily: UI_FONT,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            backgroundColor: "#E8503A",
            color: "#FFFFFF",
            fontWeight: 800,
            fontSize: 20,
            padding: "7px 15px",
            borderRadius: 9,
            letterSpacing: 1,
          }}
        >
          URL
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, color: "#1E293B" }}>
          Khan<span style={{ color: "#E8503A" }}>PDF</span>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: "16px 18px",
          borderRadius: 14,
          border: "3px solid #E2E8F0",
          fontSize: 24,
          fontFamily: "monospace",
          color: "#334155",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        {url.slice(0, Math.round(typed * url.length))}
        <span style={{ color: "#E8503A" }}>{typed < 1 ? "|" : ""}</span>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          gap: 14,
          opacity: done,
        }}
      >
        <div
          style={{
            backgroundColor: "#16A34A",
            color: "#fff",
            width: 36,
            height: 36,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            fontWeight: 900,
          }}
        >
          &#10003;
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, color: "#15803D" }}>
          Clean PDF ready
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- act 3
const Badge = ({ label, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame: frame - delay, fps, config: { damping: 13, stiffness: 180 }, durationInFrames: 18 });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "18px 30px",
        borderRadius: 999,
        backgroundColor: "rgba(12,14,20,0.82)",
        border: `3px solid ${GOLD_ACCENT}`,
        fontFamily: UI_FONT,
        fontSize: 40,
        fontWeight: 700,
        color: "#FFFFFF",
        whiteSpace: "nowrap",
        transform: `translateY(${interpolate(e, [0, 1], [40, 0])}px) scale(${interpolate(e, [0, 1], [0.86, 1])})`,
        opacity: e,
      }}
    >
      <span style={{ color: GOLD_ACCENT, fontSize: 34 }}>&#10003;</span>
      {label}
    </div>
  );
};

const Demo = () => {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [118, 134], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Sheet rises out of the tray while "save it offline" is spoken
  const lift = interpolate(frame, [8, 46], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 14, opacity: out, pointerEvents: "none" }}>
      <div style={{ position: "absolute", top: 330, left: 300 }}>
        <IsoDocTray lift={lift} size={420} />
      </div>
      <div
        style={{
          position: "absolute",
          top: 760,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 26,
        }}
      >
        <Badge label="Save offline" delay={19} />
        <Badge label="Email it" delay={42} />
      </div>
    </div>
  );
};
