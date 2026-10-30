import { Config } from "@remotion/cli/config";

// Assets live in public/ (images in public/assets, audio staged into public/audio
// by reel.mjs). The project root is never the public dir — that would put
// .env.local into the bundle.
Config.setPublicDir("public");
Config.setEntryPoint("./src/index.jsx");
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
