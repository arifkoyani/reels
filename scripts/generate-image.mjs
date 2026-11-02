import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

const KIE_API_KEY = process.env.KIE_API_KEY;

if (!KIE_API_KEY) {
  console.error("Error: KIE_API_KEY is missing from .env.local");
  process.exit(1);
}

const OUTPUT_DIR = path.join(process.cwd(), "public", "shots");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "shot";
}

async function createTask({ prompt, aspect_ratio = "9:16", nsfw_checker = false }) {
  const url = "https://api.kie.ai/api/v1/jobs/createTask";
  const body = {
    model: "z-image",
    input: {
      prompt,
      aspect_ratio,
      nsfw_checker,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KIE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to create task (${res.status}): ${errorText}`);
  }

  const json = await res.json();
  if (json.code !== 200 || !json.data?.taskId) {
    throw new Error(`Task creation failed: ${json.msg || JSON.stringify(json)}`);
  }

  return json.data.taskId;
}

async function pollTask(taskId, intervalMs = 3000, timeoutMs = 600000) {
  const startTime = Date.now();
  const url = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;

  while (Date.now() - startTime < timeoutMs) {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${KIE_API_KEY}`,
      },
    });

    if (!res.ok) {
      console.warn(`Query warning (${res.status}): waiting to retry...`);
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }

    const json = await res.json();
    const data = json.data;

    if (!data) {
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }

    if (data.state === "success") {
      let resultUrls = [];
      if (typeof data.resultJson === "string") {
        try {
          const parsed = JSON.parse(data.resultJson);
          resultUrls = parsed.resultUrls || [];
        } catch {
          // ignore
        }
      } else if (data.resultJson?.resultUrls) {
        resultUrls = data.resultJson.resultUrls;
      }

      if (resultUrls.length === 0) {
        throw new Error("Generation succeeded but no image URLs were found in resultJson");
      }

      return resultUrls[0];
    }

    if (data.state === "fail") {
      throw new Error(`Task failed: ${data.failMsg || data.failCode || "Unknown error"}`);
    }

    console.log(`Task ${taskId} is processing... (${Math.round((Date.now() - startTime) / 1000)}s)`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Task timed out after ${timeoutMs / 1000} seconds.`);
}

async function downloadImage(imageUrl, destPath) {
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Failed to download image from ${imageUrl}: ${res.statusText}`);
  }

  const fileStream = fs.createWriteStream(destPath);
  await pipeline(Readable.fromWeb(res.body), fileStream);
}

export async function generateShot({
  prompt,
  aspect_ratio = "9:16",
  nsfw_checker = false,
  filename = null,
}) {
  console.log(`\nSubmitting image generation task to Kie.ai (z-image)...`);
  console.log(`Prompt: "${prompt}"`);
  console.log(`Aspect Ratio: ${aspect_ratio}`);

  const taskId = await createTask({ prompt, aspect_ratio, nsfw_checker });
  console.log(`Task created successfully! Task ID: ${taskId}`);

  console.log("Polling for completion...");
  const imageUrl = await pollTask(taskId);
  console.log(`Image generated: ${imageUrl}`);

  const safeName = filename ? slugify(filename) : `${Date.now()}_${slugify(prompt)}`;
  const outPath = path.join(OUTPUT_DIR, `${safeName}.png`);

  console.log(`Downloading and saving to: ${outPath}...`);
  await downloadImage(imageUrl, outPath);

  console.log(`Saved successfully to: ${outPath}\n`);
  return outPath;
}

// CLI direct execution support.
// pathToFileURL handles percent-encoding: a hand-built "file:///" + path leaves
// the space in "GLT COMPUTER" literal while import.meta.url has "%20", so the
// comparison silently failed and the script exited 0 without generating.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const promptArg = process.argv[2] || "Generate a photorealistic image of a cafe terrace in the Marais district of Paris on a Wednesday morning in March 2025. It is a crisp, cool spring morning with clear skies. Locals are drinking coffee. In sharp focus should be a young woman with a pixie cut wearing a scarf, stirring a cappuccino and looking thoughtfully to the side; the waiter and street traffic behind her are blurred. The photo should have the candid, natural morning light feel of an iPhone image.";
  const aspectArg = process.argv[3] || "9:16";
  const nameArg = process.argv[4] || null;

  generateShot({
    prompt: promptArg,
    aspect_ratio: aspectArg,
    nsfw_checker: true,
    filename: nameArg,
  }).catch((err) => {
    console.error("Execution failed:", err.message);
    process.exit(1);
  });
}

