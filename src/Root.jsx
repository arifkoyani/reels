import { Composition } from "remotion";
import { Reel } from "./Reel.jsx";
import { Scene } from "./Scene.jsx";

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

// Groq reports `duration`, but a word can end after it (seen: duration 2.88, last
// word ends 3.12). Take the max so captions are never cut off.
const resolveDuration = (transcription) => {
  const words = transcription?.words ?? [];
  const lastWordEnd = words.reduce((max, w) => Math.max(max, w.end ?? 0), 0);
  return Math.max(transcription?.duration ?? 0, lastWordEnd);
};

const metadata = ({ props }) => ({
  // +0.4s tail so the last word doesn't vanish on the final frame
  durationInFrames: Math.max(1, Math.ceil((resolveDuration(props.transcription) + 0.4) * FPS)),
  fps: FPS,
  width: WIDTH,
  height: HEIGHT,
});

const baseProps = {
  audioFile: "audio/output.mp3",
  transcription: { duration: 3, text: "", words: [] },
};

export const RemotionRoot = () => {
  return (
    <>
      {/* Full layered scene: room, man, bot, info card, captions */}
      <Composition
        id="Scene"
        component={Scene}
        durationInFrames={90}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          ...baseProps,
          card: {
            badge: "TOMORROW",
            time: "10:00",
            title: "Google · Interview",
            subtitle: "Tomorrow 10:00 AM · Data Analyst",
            footer: "Prep plan:",
          },
        }}
        calculateMetadata={metadata}
      />

      {/* Captions-only version, kept as a fallback */}
      <Composition
        id="Reel"
        component={Reel}
        durationInFrames={90}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ ...baseProps, title: "" }}
        calculateMetadata={metadata}
      />
    </>
  );
};
