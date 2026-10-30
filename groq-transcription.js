import Groq from "groq-sdk";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load API key from .env.local
dotenv.config({ path: ".env.local" });

const AUDIO_DIR = path.join(process.cwd(), "mp3");
const OUTPUT_DIR = path.join(process.cwd(), "transcriptionasJSON");

// Initialize Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

function getAudioFilePath() {
  const arg = process.argv[2];

  if (arg) {
    if (fs.existsSync(arg)) return path.resolve(arg);
    const inAudioDir = path.join(AUDIO_DIR, arg);
    if (fs.existsSync(inAudioDir)) return inAudioDir;
    throw new Error(`Audio file "${arg}" not found directly or in ${AUDIO_DIR}`);
  }

  if (!fs.existsSync(AUDIO_DIR)) {
    throw new Error(`Directory "${AUDIO_DIR}" does not exist.`);
  }

  const mp3Files = fs
    .readdirSync(AUDIO_DIR)
    .filter((f) => f.toLowerCase().endsWith(".mp3"))
    .map((f) => {
      const fullPath = path.join(AUDIO_DIR, f);
      return {
        path: fullPath,
        file: f,
        mtime: fs.statSync(fullPath).mtimeMs,
      };
    })
    .sort((a, b) => b.mtime - a.mtime);

  if (mp3Files.length === 0) {
    throw new Error(`No .mp3 files found in ${AUDIO_DIR}. Generate audio first using "npm run tts".`);
  }

  console.log(`Using latest audio file: ${mp3Files[0].file}`);
  return mp3Files[0].path;
}

async function transcribeAudio() {
  try {
    // Check API key
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is missing from .env.local");
    }

    const audioFilePath = getAudioFilePath();

    console.log("Transcribing:", audioFilePath);

    // Send audio to Groq Whisper
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(audioFilePath),
      model: "whisper-large-v3",
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const baseName = path.parse(audioFilePath).name;
    const outputPath = path.join(OUTPUT_DIR, `${baseName}.json`);

    fs.writeFileSync(
      outputPath,
      JSON.stringify(transcription, null, 2),
      "utf8",
    );

    console.log("\nTranscription completed successfully!");
    console.log("Saved to:", outputPath);

    // Display word-level timestamps
    console.log("\nWord-level timestamps:");
    if (transcription.words && transcription.words.length > 0) {
      transcription.words.forEach((word) => {
        console.log(`  ${word.start.toFixed(2)}s - ${word.end.toFixed(2)}s: "${word.word}"`);
      });
    } else {
      console.log("No word-level timestamps returned.");
    }
  } catch (error) {
    console.error("Transcription failed:", error.message);
  }
}

transcribeAudio();
