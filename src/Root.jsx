import { Composition } from "remotion";
import { Reel } from "./Reel.jsx";
import { Scene } from "./Scene.jsx";
import { Explainer } from "./Explainer.jsx";
import { Infographic } from "./Infographic.jsx";
import { BotReel } from "./BotReel.jsx";
import reelTranscription from "./reel-transcription.json";
import botTestTranscription from "./bot-test-transcription.json";

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
      {/* 5s layout test: bot only, infographics above it, no human character */}
      <Composition
        id="BotReel"
        component={BotReel}
        durationInFrames={150}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          audioFile: "audio/bot-test-vo.mp3",
          transcription: botTestTranscription,
        }}
      />

      {/* KhanPDF infographic: 30s, voiceover + captions + sound effects */}
      <Composition
        id="Infographic"
        component={Infographic}
        durationInFrames={900}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ audioFile: "audio/khanpdf-vo-30s.mp3" }}
      />

      {/* KhanPDF explainer: white, no characters, fixed 15s */}
      <Composition
        id="Explainer"
        component={Explainer}
        durationInFrames={450}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ audioFile: "audio/khanpdf-vo.mp3" }}
      />

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

      {/* Main AI reel: characters, four acts, fixed 15s (450 frames) */}
      <Composition
        id="Reel"
        component={Reel}
        durationInFrames={450}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          audioFile: "audio/reel-vo.mp3",
          transcription: reelTranscription,
        }}
      />
    </>
  );
};
