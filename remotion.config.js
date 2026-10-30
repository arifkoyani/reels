import { Config } from "@remotion/cli/config";

// Assets are served from mp3/ so the existing ElevenLabs output is used in place.
// Pointing this at the project root would expose .env.local to the bundle.
Config.setPublicDir("mp3");
Config.setEntryPoint("./src/index.jsx");
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
