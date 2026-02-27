/**
 * FRAMEDL BETR verification: OpenAI Vision for screenshots and cast embed images,
 * and OpenAI for extracting attempts/date from cast text.
 * Env: OPENAI_API_KEY.
 * 
 * Phase 12.1: Rebranded from remix-verify.ts
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
 * Extract attempts, date, and isFramedlGame from an image (screenshot of Framedl result or cast embed).
 * Input: base64 string (with or without data URL prefix) or Buffer.
 * Returns { attempts: number | null (1-7, where 7 = "X" / failed), date: string | null (YYYY-MM-DD), isFramedlGame: boolean }.
 * Throws on API/config errors.
 */
export async function extractFramedlFromImage(
  image: string | Buffer
): Promise<{ attempts: number | null; date: string | null; isFramedlGame: boolean }> {
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
            text: `You are analyzing an image that may show Framedl game results (a Wordle-like word guessing game on Farcaster).

Respond with a JSON object only, no other text:
{ "attempts": <number 1-7 or null>, "date": "<YYYY-MM-DD or null>", "isFramedlGame": <boolean> }

Rules:
- "attempts": The number of guesses/attempts shown (e.g., "4*" or "4 attempts" or "They won in 4 attempts" means 4). Valid range is 1-6 for successful solves. If the user failed (often shown as "X", "X/6", or no solve), return 7. Use null ONLY if no clear attempt count is visible and you cannot determine whether they solved or failed.
- "date": The puzzle date shown in the image (e.g., "Framedl 2026-02-01" → "2026-02-01"). Format must be YYYY-MM-DD. Use null if not visible.
- "isFramedlGame": true only if this looks like a Framedl game result (showing a word guessing grid with colored squares, attempt count, date). Use false if it's a different app, random screenshot, or you're unsure.`,
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
    return { attempts: null, date: null, isFramedlGame: false };
  }

  try {
    const j = JSON.parse(raw) as { attempts?: unknown; date?: unknown; isFramedlGame?: unknown };
    const attempts = typeof j.attempts === "number" && !isNaN(j.attempts) && j.attempts >= 1 && j.attempts <= 7 ? j.attempts : null;
    const date = typeof j.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : null;
    const isFramedlGame = j.isFramedlGame === true;
    return { attempts, date, isFramedlGame };
  } catch {
    return { attempts: null, date: null, isFramedlGame: false };
  }
}

/**
 * Extract attempts and date from Farcaster cast text.
 * Returns { attempts: number | null (1-7, where 7 = "X" / failed), date: string | null (YYYY-MM-DD) }.
 * Throws on API/config errors.
 */
export async function extractFramedlFromCastText(text: string): Promise<{ attempts: number | null; date: string | null }> {
  const t = String(text || "").trim();
  if (!t) return { attempts: null, date: null };

  const openai = getOpenAI();
  const res = await openai.chat.completions.create({
    model: MODEL_TEXT,
    messages: [
      {
        role: "user",
        content: `From this Farcaster cast text, extract Framedl game results.

Respond with a JSON object only: { "attempts": <number 1-7 or null>, "date": "<YYYY-MM-DD or null>" }

Rules:
- "attempts": Extract from patterns like "X attempts", "X*", "won in X", "X/6". Valid range 1-6 for successful solves. If the result shows "X" or "X/6" meaning failed (didn't solve), return 7. Use null ONLY if not found at all.
- "date": Extract from "Framedl YYYY-MM-DD" or similar date pattern. Format must be YYYY-MM-DD. Use null if not found.

Cast text:
${t.slice(0, 2000)}`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 100,
  });

  const raw = res.choices?.[0]?.message?.content;
  if (!raw || typeof raw !== "string") return { attempts: null, date: null };

  try {
    const j = JSON.parse(raw) as { attempts?: unknown; date?: unknown };
    const attempts = typeof j.attempts === "number" && !isNaN(j.attempts) && j.attempts >= 1 && j.attempts <= 7 ? j.attempts : null;
    const date = typeof j.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : null;
    return { attempts, date };
  } catch {
    return { attempts: null, date: null };
  }
}
