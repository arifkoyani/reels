import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const GOLD_ACCENT = "#FAD06C";
const TEXT_LIGHT = "#FFFFFF";
const TEXT_DIM = "rgba(255, 255, 255, 0.45)";

const SERIF_FONT =
  'Georgia, Cambria, "Times New Roman", Times, serif';

// Break words into caption pages of 3 to 4 words
const buildPages = (words, { maxWords = 4, maxGap = 0.45, maxDuration = 2.2 } = {}) => {
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

export const Reel = ({ audioFile, transcription, title }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const time = frame / fps;

  const words = transcription?.words ?? [];
  const pages = buildPages(words);

  // Active word detection
  const isAudioSpeaking = words.some(
    (w) => time >= w.start && time <= w.end
  );

  // Group pages for caption display
  let activePageIndex = pages.findIndex((p) => time >= p.start && time <= p.end);
  if (activePageIndex === -1) {
    const passed = pages.filter((p) => p.end < time);
    activePageIndex = passed.length > 0 ? pages.indexOf(passed[passed.length - 1]) : 0;
  }
  const activePage = pages[activePageIndex];

  // --- 1. IDLE & FLOATING MOTIONS ---
  // Man breathing oscillation
  const manBreathing = Math.sin(frame / 16) * 5;

  // Bot floating hover
  const botFloatY = Math.sin(frame / 12) * 16;
  const botFloatX = Math.cos(frame / 24) * 5;
  const botTilt = Math.sin(frame / 18) * 3;

  // --- 2. LIP-SYNC & HEAD ANIMATION ---
  // When audio is speaking, cycle mouth/head sprites every 4-6 frames
  const mouthFrameCycle = Math.floor(frame / 5) % 3;
  let manHeadSprite = "assets/sprites/man_head_closed.png";
  if (isAudioSpeaking) {
    if (mouthFrameCycle === 1) manHeadSprite = "assets/sprites/man_head_talk.png";
    else if (mouthFrameCycle === 2) manHeadSprite = "assets/sprites/man_head_wide.png";
  }

  // Bot screen talking face
  const botFaceSprite = isAudioSpeaking
    ? "assets/sprites/bot_face_talking.png"
    : "assets/sprites/bot_face_idle.png";

  // --- 3. MOTION GRAPHICS POPUP CARD (TOP LEFT) ---
  const cardEnter = spring({
    frame: frame - 6,
    fps,
    config: { damping: 14, stiffness: 120 },
  });
  const cardY = interpolate(cardEnter, [0, 1], [-80, 0]);
  const cardOpacity = interpolate(cardEnter, [0, 1], [0, 1]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0C0E14", overflow: "hidden" }}>
      {/* Voice Audio */}
      {audioFile ? <Audio src={staticFile(audioFile)} /> : null}

      {/* ======================================================== */}
      {/* LAYER 1: ROOM BACKGROUND                                  */}
      {/* ======================================================== */}
      <AbsoluteFill>
        <Img
          src={staticFile("assets/background.png")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "brightness(0.96) contrast(1.05)",
          }}
        />
        {/* Warm ambient vignette */}
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
          transform: `translateY(${manBreathing}px)`,
          zIndex: 5,
        }}
      >
        {/* Man Body */}
        <Img
          src={staticFile("assets/sprites/man_body_34.png")}
          style={{
            position: "absolute",
            bottom: 0,
            left: 50,
            width: 290,
            height: "auto",
            filter: "drop-shadow(0 15px 25px rgba(0,0,0,0.65))",
          }}
        />
        {/* Dynamic Lip-Sync Head */}
        <Img
          src={staticFile(manHeadSprite)}
          style={{
            position: "absolute",
            top: 25,
            left: 78,
            width: 175,
            height: "auto",
            zIndex: 6,
          }}
        />
      </div>

      {/* ======================================================== */}
      {/* LAYER 3: FLOATING AVATAR BOT (HOVERING OVER DESK)        */}
      {/* ======================================================== */}
      <div
        style={{
          position: "absolute",
          right: 90,
          bottom: 500,
          width: 440,
          height: 440,
          transform: `translate(${botFloatX}px, ${botFloatY}px) rotate(${botTilt}deg)`,
          zIndex: 8,
          filter: "drop-shadow(0 25px 35px rgba(0,0,0,0.55))",
        }}
      >
        {/* Bot Body & Saturn Ring */}
        <Img
          src={staticFile("assets/sprites/bot_large.png")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />

        {/* Bot Dynamic LED Face Screen */}
        <div
          style={{
            position: "absolute",
            top: "28%",
            left: "24%",
            width: "52%",
            height: "46%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <Img
            src={staticFile(botFaceSprite)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              filter: "drop-shadow(0 0 16px rgba(255, 220, 100, 0.6))",
            }}
          />
        </div>
      </div>

      {/* ======================================================== */}
      {/* LAYER 4: TOP-LEFT SUPPORTING GRAPHICS / UI POPUP CARD    */}
      {/* ======================================================== */}
      <div
        style={{
          position: "absolute",
          top: 130,
          left: 70,
          width: 530,
          backgroundColor: "#FFFFFF",
          borderRadius: 24,
          padding: "24px 28px",
          boxShadow:
            "0 20px 45px rgba(0, 0, 0, 0.45), 0 4px 12px rgba(0, 0, 0, 0.15)",
          transform: `translateY(${cardY}px)`,
          opacity: cardOpacity,
          zIndex: 15,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Badge */}
          <div
            style={{
              backgroundColor: "#DC2626",
              color: "#FFFFFF",
              fontWeight: 800,
              fontSize: 18,
              padding: "6px 14px",
              borderRadius: 8,
              letterSpacing: 1,
            }}
          >
            TOMORROW
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: "#1E293B",
            }}
          >
            Google · Interview
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 22,
            fontWeight: 700,
            color: "#DC2626",
          }}
        >
          Tomorrow 10:00 AM · Data Analyst
        </div>

        <div
          style={{
            marginTop: 8,
            fontSize: 19,
            fontWeight: 500,
            color: "#64748B",
            borderTop: "1px solid #E2E8F0",
            paddingTop: 8,
          }}
        >
          Prep plan: System Design & Strategy
        </div>
      </div>

      {/* ======================================================== */}
      {/* LAYER 5: CAPTIONS (WORD-BY-WORD GOLDEN RETRO SUBTITLES)  */}
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

            // Word pop bounce
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
                  textShadow:
                    "0 6px 18px rgba(0, 0, 0, 0.95), 0 2px 4px rgba(0, 0, 0, 0.9)",
                  transition: "none",
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
