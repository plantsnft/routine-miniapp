/**
 * REMIX BETR verification: OpenAI Vision for screenshots and cast embed images,
 * and OpenAI for extracting score from cast text.
 * Env: OPENAI_API_KEY.
 */

import OpenAI from "openai";

const MODEL_IMAGE = "gpt-4o-mini";
const MODEL_TEXT = "gpt-4o-mini";

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  return new OpenAI({ apiKey: key });
}

/**
 * Extract score and isRemixGame from an image (screenshot of Remix end screen or cast embed).
 * Input: base64 string (with or without data URL prefix) or Buffer.
 * Returns { score: number | null, isRemixGame: boolean }.
 * Throws on API/config errors.
 */
export async function extractScoreFromImage(
  image: string | Buffer
): Promise<{ score: number | null; isRemixGame: boolean }> {
  let url: string;
  if (Buffer.isBuffer(image)) {
    const b64 = image.toString("base64");
    url = `data:image/png;base64,${b64}`;
  } else {
    const s = String(image).trim();
    url = s.startsWith("data:") ? s : `data:image/png;base64,${s}`;
  }

  const openai = getOpenAI();
  const res = await openai.chat.completions.create({
    model: MODEL_IMAGE,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are analyzing an image that may show the end screen of the REMIX BETR game (a game on Remix/Farcaster).

Respond with a JSON object only, no other text:
{ "score": <number or null>, "isRemixGame": <boolean> }

Rules:
- "score": The single numeric game score shown on the end screen. If there is no clear score, or multiple numbers that could be the score, use null.
- "isRemixGame": true only if this looks like the REMIX BETR / Remix game end screen (score, game-over style UI). If it's a different app, a random screenshot, or you're unsure, use false.`,
          },
          { type: "image_url", image_url: { url, detail: "high" as const } },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 200,
  });

  const raw = res.choices?.[0]?.message?.content;
  if (!raw || typeof raw !== "string") {
    return { score: null, isRemixGame: false };
  }

  try {
    const j = JSON.parse(raw) as { score?: unknown; isRemixGame?: unknown };
    const score = typeof j.score === "number" && !isNaN(j.score) && j.score >= 0 ? j.score : null;
    const isRemixGame = j.isRemixGame === true;
    return { score, isRemixGame };
  } catch {
    return { score: null, isRemixGame: false };
  }
}

/**
 * Extract the single game score from Farcaster cast text.
 * Returns the number if found and unambiguous, else null.
 * Throws on API/config errors.
 */
export async function extractScoreFromCastText(text: string): Promise<number | null> {
  const t = String(text || "").trim();
  if (!t) return null;

  const openai = getOpenAI();
  const res = await openai.chat.completions.create({
    model: MODEL_TEXT,
    messages: [
      {
        role: "user",
        content: `From this Farcaster cast text, extract the single game score the user is sharing (e.g. from REMIX BETR or a similar game). If there are many numbers or it's ambiguous, return null.

Respond with a JSON object only: { "score": <number or null> }

Cast text:
${t.slice(0, 2000)}`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 50,
  });

  const raw = res.choices?.[0]?.message?.content;
  if (!raw || typeof raw !== "string") return null;

  try {
    const j = JSON.parse(raw) as { score?: unknown };
    if (typeof j.score === "number" && !isNaN(j.score) && j.score >= 0) return j.score;
    return null;
  } catch {
    return null;
  }
}
