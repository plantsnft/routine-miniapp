/**
 * WEEKEND GAME - 3D Tunnel Racer verification (Phase 30).
 * OpenAI Vision for screenshots and cast embed images; extract score + liberal game check.
 * When in doubt, accept. No date validation.
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
 * Extract score and is3DTunnelRacerGame from an image (screenshot of 3D Tunnel Racer / Remix result).
 * Liberal: if there is a numeric score and any hint of Remix / 3D Tunnel Racer, set is3DTunnelRacerGame true.
 * Returns { score: number | null (0-1000000), is3DTunnelRacerGame: boolean }.
 */
export async function extractTunnelRacerFromImage(
  image: string | Buffer
): Promise<{ score: number | null; is3DTunnelRacerGame: boolean }> {
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
            text: `You are analyzing an image that may show "3D Tunnel Racer" game results (a game on Remix by farcade). The game shows a numeric score (e.g. 3200, 3,200, "New High Score 3200").

Respond with a JSON object only, no other text:
{ "score": <number or null>, "is3DTunnelRacerGame": <boolean> }

Rules:
- "score": The numeric score shown (e.g. 3200, 1450, 7250). Strip commas. Use null only if no clear score is visible.
- "is3DTunnelRacerGame": true if this looks like 3D Tunnel Racer or Remix game results (score display, "New High Score", "Play Again", tunnel/racer style UI, or Remix/farcade branding). When in doubt, use true if there is any plausible score and game-like UI.`,
          },
          { type: "image_url", image_url: { url, detail: "high" as const } },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 150,
  });

  const raw = res.choices?.[0]?.message?.content;
  if (!raw || typeof raw !== "string") {
    return { score: null, is3DTunnelRacerGame: false };
  }

  try {
    const j = JSON.parse(raw) as { score?: unknown; is3DTunnelRacerGame?: unknown };
    const score =
      typeof j.score === "number" && !isNaN(j.score) && j.score >= 0 && j.score <= 1_000_000
        ? Math.floor(j.score)
        : typeof j.score === "string"
          ? parseInt(j.score.replace(/,/g, ""), 10)
          : null;
    const validScore = score !== null && !isNaN(score) && score >= 0 && score <= 1_000_000 ? score : null;
    const is3DTunnelRacerGame = j.is3DTunnelRacerGame === true;
    return { score: validScore, is3DTunnelRacerGame };
  } catch {
    return { score: null, is3DTunnelRacerGame: false };
  }
}

/**
 * Extract score from cast text (e.g. "Score 3200", "3,200").
 * Returns { score: number | null }.
 */
export async function extractTunnelRacerFromCastText(text: string): Promise<{ score: number | null }> {
  const t = String(text || "").trim();
  if (!t) return { score: null };

  const openai = getOpenAI();
  const res = await openai.chat.completions.create({
    model: MODEL_TEXT,
    messages: [
      {
        role: "user",
        content: `From this Farcaster cast text, extract a single numeric game score (e.g. from 3D Tunnel Racer or similar). Look for patterns like "Score 3200", "3,200", "3200", "New High Score 3200".

Respond with a JSON object only: { "score": <number or null> }

Use null if no clear score is found. Strip commas from numbers.

Cast text:
${t.slice(0, 2000)}`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 80,
  });

  const raw = res.choices?.[0]?.message?.content;
  if (!raw || typeof raw !== "string") return { score: null };

  try {
    const j = JSON.parse(raw) as { score?: unknown };
    const score =
      typeof j.score === "number" && !isNaN(j.score) && j.score >= 0 && j.score <= 1_000_000
        ? Math.floor(j.score)
        : null;
    return { score };
  } catch {
    return { score: null };
  }
}
