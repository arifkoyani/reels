import { Composition } from "remotion";
import { Reel } from "./Reel.jsx";

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

export const RemotionRoot = () => {
  return (
    <Composition
      id="Reel"
      component={Reel}
      durationInFrames={90}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{
        audioFile: "output.mp3",
        transcription: { duration: 3, text: "", words: [] },
        title: "",
      }}
      calculateMetadata={({ props }) => {
        const seconds = resolveDuration(props.transcription);
        // +0.4s tail so the last word doesn't vanish on the final frame
        return {
          durationInFrames: Math.max(1, Math.ceil((seconds + 0.4) * FPS)),
          fps: FPS,
          width: WIDTH,
          height: HEIGHT,
        };
      }}
    />
  );
};
