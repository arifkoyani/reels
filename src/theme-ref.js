// Palette and layout sampled from the reference reel (720x1280, scaled x1.5
// to our 1080x1920 frame).
import { loadFont as loadArchivo } from "@remotion/google-fonts/Archivo";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// Load only the weights and subsets actually used — the default pulls every
// weight and script, which is hundreds of requests per render tab.
const only = (weights) => ({
  weights,
  subsets: ["latin"],
  ignoreTooManyRequestsWarning: true,
});

export const SANS = loadArchivo("normal", only(["700", "800"])).fontFamily;
export const SERIF = loadPlayfair("italic", only(["700"])).fontFamily;
export const DISPLAY = loadAnton("normal", only(["400"])).fontFamily;
export const MONO = loadMono("normal", only(["400"])).fontFamily;

export const REF = {
  bg: "#ECEAE5", // warm off-white, sampled
  ink: "#0C0A08", // near-black, sampled
  accent: "#F83820", // red, sampled from the stamps and italics
  muted: "#AEACA6", // mono micro-labels, sampled
  card: "#FBFAF7",
  line: "#DCD9D2",
};

export const REF_LAYOUT = {
  width: 1080,
  height: 1920,
  fps: 30,
  margin: 130, // left/right text margin
  labelTop: 135, // mono section label
  captionTop: 250, // spoken line
  stageTop: 580, // infographic zone starts
  stageHeight: 820,
  botWidth: 430, // character, bottom-right and cropped by the frame
  botRight: -40,
  botBottom: -60,
};
