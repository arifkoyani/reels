import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import dotenv from "dotenv";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

const apiKey = process.env.ELEVENLABS_API_KEY;

if (!apiKey) {
  console.error("Error: ELEVENLABS_API_KEY is not defined in .env.local");
  process.exit(1);
}

const client = new ElevenLabsClient({ apiKey });

async function generateSFX() {
  const outputDir = path.join(process.cwd(), "public", "sfx");
  const outputPath = path.join(outputDir, "ui-click.mp3");

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  console.log("Generating sound effect via ElevenLabs...");

  try {
    // Generate clean, modern UI click sound effect
    const audioStream = await client.textToSoundEffects.convert({
      text: "A clean, crisp, subtle modern digital UI mouse click pop sound effect",
      durationSeconds: 1,
      promptInfluence: 0.5,
    });

    // Handle stream response and pipe to disk
    const nodeStream = Readable.fromWeb(audioStream);
    const writeStream = fs.createWriteStream(outputPath);
    await pipeline(nodeStream, writeStream);

    console.log(
      `Sound effect successfully created and saved at: ${outputPath}`,
    );
  } catch (error) {
    console.error("Failed to generate sound effect:", error.message);
  }
}

generateSFX();
