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
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { buildPages, activePageAt } from "./captions.js";

const PARTS = "assets/parts";

const GOLD = "#F2C14E";
const CAPTION_SERIF = 'Georgia, "Times New Roman", serif';
const UI_SANS = '"Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif';

// How hard the audio drives the mouth. Raise if the bot barely opens its mouth.
const LOUDNESS_GAIN = 9;

const useLoudness = (src) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(src);

  if (!audioData) return 0;

  const bins = visualizeAudio({ fps, frame, audioData, numberOfSamples: 32 });
  const average = bins.reduce((sum, v) => sum + v, 0) / bins.length;
  return Math.min(1, average * LOUDNESS_GAIN);
};

// useAudioData() throws on a missing src and cancels the render if the file 404s,
// so it is isolated here and only mounts when a clip is actually staged.
const AudioDriven = ({ src, children }) => {
  const loudness = useLoudness(src);
  return (
    <>
      <Audio src={src} />
      {children(loudness)}
    </>
  );
};

// The bot's screen mouth. bot-hero.png has a mouth painted on, so mask that band
// with the screen's own colour (sampled from the asset) before drawing live bars.
const SCREEN = "rgb(22, 26, 36)";

const BotMouth = ({ loudness, frame }) => {
  const bars = 9;
  return (
    <div
      style={{
        position: "absolute",
        left: "39%",
        top: "63%",
        width: "31%",
        height: "13%",
      }}
    >
      {/* Covers the mouth baked into bot-hero.png */}
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
          const wobble = 0.65 + 0.35 * Math.sin(frame / 2.2 + i * 1.3);
          const height = Math.max(7, loudness * taper * wobble * 95);
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

// The notification card in the top-left, built in CSS so it stays sharp.
const InfoCard = ({ frame, fps, card }) => {
  const enter = spring({ frame: frame - 6, fps, config: { damping: 200 }, durationInFrames: 22 });
  const x = interpolate(enter, [0, 1], [-520, 0]);

  return (
    <div
      style={{
        position: "absolute",
        top: 190,
        left: 70,
        width: 600,
        transform: `translateX(${x}px)`,
        backgroundColor: "#FFFFFF",
        borderRadius: 26,
        boxShadow: "0 28px 60px rgba(0,0,0,0.45)",
        overflow: "hidden",
        fontFamily: UI_SANS,
        display: "flex",
      }}
    >
      <div
        style={{
          backgroundColor: "#E8503A",
          color: "#fff",
          padding: "22px 20px",
          minWidth: 150,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 1.5 }}>{card.badge}</div>
        <div style={{ fontSize: 46, fontWeight: 800, lineHeight: 1.1, marginTop: 6 }}>
          {card.time}
        </div>
      </div>
      <div style={{ padding: "20px 24px", flex: 1 }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: "#15181F" }}>{card.title}</div>
        <div style={{ fontSize: 21, color: "#E8503A", fontWeight: 600, marginTop: 6 }}>
          {card.subtitle}
        </div>
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: "2px solid #ECEFF3",
            fontSize: 20,
            color: "#5A6270",
          }}
        >
          {card.footer}
        </div>
      </div>
    </div>
  );
};

const SceneContent = ({ transcription, card, loudness }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const time = frame / fps;

  const words = transcription?.words ?? [];
  const pages = buildPages(words, { maxWords: 3 });
  const page = pages.length > 0 ? activePageAt(pages, time) : null;

  // Slow push-in keeps a still room from feeling dead
  const push = interpolate(frame, [0, durationInFrames], [1, 1.06], {
    extrapolateRight: "clamp",
  });
  const bob = Math.sin(frame / 18) * 14;

  // With no clip staged, idle the mouth so the layout is still reviewable
  const mouth = loudness === null ? 0.25 + 0.2 * Math.sin(frame / 3) : loudness;

  return (
    <AbsoluteFill style={{ backgroundColor: "#140B06", overflow: "hidden" }}>
      {/* Room. Scaled to a little wider than the frame and anchored to the top so
          the corkboard and plant survive instead of being cropped away. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          width: 1350,
          transform: `translateX(-50%) scale(${push})`,
          transformOrigin: "50% 30%",
        }}
      >
        <Img src={staticFile("assets/background.png")} style={{ width: "100%", display: "block" }} />
      </div>

      {/* Blend the room's bottom edge into the dark lower half */}
      <div
        style={{
          position: "absolute",
          top: 620,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "linear-gradient(to bottom, rgba(20,11,6,0) 0%, rgba(20,11,6,0.82) 32%, #140B06 60%)",
        }}
      />

      {/* Man, seen from behind, cropped at the waist so he reads as seated */}
      <Img
        src={staticFile(`${PARTS}/man-body-back.png`)}
        style={{
          position: "absolute",
          bottom: -630,
          left: -120,
          height: 1600,
          filter: "drop-shadow(0 20px 50px rgba(0,0,0,0.6))",
        }}
      />

      {/* Floating bot on the right */}
      <div
        style={{
          position: "absolute",
          right: -20,
          top: 640 + bob,
          width: 560,
        }}
      >
        <Img
          src={staticFile(`${PARTS}/bot-hero.png`)}
          style={{ width: "100%", display: "block", filter: "drop-shadow(0 24px 50px rgba(0,0,0,0.55))" }}
        />
        <BotMouth loudness={mouth} frame={frame} />
      </div>

      <InfoCard frame={frame} fps={fps} card={card} />

      {/* Captions */}
      <div
        style={{
          position: "absolute",
          bottom: 250,
          left: 80,
          right: 80,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "10px 20px",
          fontFamily: CAPTION_SERIF,
        }}
      >
        {page?.words.map((word, i) => {
          const isActive = time >= word.start && time <= word.end;
          const enter = spring({
            frame: frame - Math.round(word.start * fps),
            fps,
            config: { damping: 200, stiffness: 180 },
            durationInFrames: 7,
          });
          const scale = isActive ? interpolate(enter, [0, 1], [0.9, 1]) : 1;
          return (
            <span
              key={`${word.word}-${i}`}
              style={{
                fontSize: 64,
                fontWeight: 700,
                color: isActive ? "#FFFFFF" : GOLD,
                transform: `scale(${scale})`,
                textShadow: "0 4px 18px rgba(0,0,0,0.85), 0 0 36px rgba(0,0,0,0.6)",
              }}
            >
              {word.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const Scene = (props) => {
  const src = props.audioFile ? staticFile(props.audioFile) : null;
  if (!src) return <SceneContent {...props} loudness={null} />;
  return (
    <AudioDriven src={src}>
      {(loudness) => <SceneContent {...props} loudness={loudness} />}
    </AudioDriven>
  );
};
