import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "~/lib/supabaseAdmin";
import { verifyNeynarWebhookSignature, getWebhookSecrets } from "~/lib/webhookSecurity";

// Metrics for dev-only logging
let webhookMetrics = {
  eventsReceived: 0,
  eventsWritten: 0,
  eventsIgnored: 0,
  signatureMissing: 0,
  signatureInvalid: 0,
  byEventType: {
    'cast.created': { received: 0, written: 0, ignored: 0 },
    'cast.deleted': { received: 0, written: 0, ignored: 0 },
    'reaction.created': { received: 0, written: 0, ignored: 0 },
    'reaction.deleted': { received: 0, written: 0, ignored: 0 },
  },
  deletesProcessed: 0,
  lastReset: Date.now(),
};

// Channel author FID - should match the channel owner
const AUTHOR_FID = parseInt(process.env.CATWALK_AUTHOR_FID || "0", 10);
const CATWALK_CHANNEL_PARENT_URL = "https://warpcast.com/~/channel/catwalk";

/**
 * Safe timestamp parser that returns a valid Date or null.
 * Handles various input formats: ISO strings, numbers (seconds or ms), numeric strings.
 * If number looks like seconds (< 1e12), converts to ms.
 * If invalid, returns null (never throws).
 */
function safeParseTimestamp(input: unknown): Date | null {
  if (!input) {
    return null;
  }
  
  // Already an ISO string
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(input)) {
    const date = new Date(input);
    if (!isNaN(date.getTime())) {
      return date;
    }
    return null;
  }
  
  // Number or numeric string
  let num: number;
  if (typeof input === 'number') {
    num = input;
  } else if (typeof input === 'string') {
    num = parseFloat(input);
    if (isNaN(num)) {
      return null;
    }
  } else {
    return null;
  }
  
  // If seconds (looks like Unix timestamp in seconds: < 1e12), convert to milliseconds
  if (num > 0 && num < 1e12) {
    num = num * 1000;
  }
  
  const date = new Date(num);
  if (isNaN(date.getTime())) {
    return null;
  }
  
  return date;
}

/**
 * Safe ISO timestamp converter that handles various input formats.
 * Returns ISO string, falling back to current time if invalid.
 * Used for database writes where we always need a valid timestamp.
 */
function safeISO(input: unknown): string {
  const date = safeParseTimestamp(input);
  return date ? date.toISOString() : new Date().toISOString();
}

/**
 * Webhook receiver for Neynar events (cast.created, cast.deleted, reaction.created, reaction.deleted).
 * Captures engagements in real-time and writes to engagements table.
 * 
 * Webhook subscriptions should be configured for:
 * - reaction.created + reaction.deleted filtered by target_fids: [AUTHOR_FID]
 * - cast.created filtered by parent_author_fids: [AUTHOR_FID] (captures replies to my casts)
 * - cast.deleted (optional) for cleanup
 * 
 * POST /api/webhooks/neynar
 */

export async function GET() {
  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    vercelEnv: process.env.VERCEL_ENV ?? "unknown",
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  });
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,HEAD,OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

export async function POST(req: NextRequest) {
  // Read raw body ONCE for signature verification
  const rawBody = await req.text();
  
  // Get signature from X-Neynar-Signature header (case-insensitive)
  const signature = req.headers.get("x-neynar-signature") || 
                    req.headers.get("X-Neynar-Signature");

  // Verify HMAC SHA-512 signature before parsing JSON
  const secrets = getWebhookSecrets();
  if (secrets.length > 0) {
    if (!signature) {
      webhookMetrics.signatureMissing++;
      if (process.env.NODE_ENV === 'development') {
        console.error("[Webhook Neynar] Missing signature header");
      }
      return NextResponse.json(
        { ok: false, error: "Missing signature" },
        { status: 401 }
      );
    }

    const isValid = verifyNeynarWebhookSignature(rawBody, signature, secrets);
    if (!isValid) {
      webhookMetrics.signatureInvalid++;
      if (process.env.NODE_ENV === 'development') {
        console.error("[Webhook Neynar] Invalid signature (no sensitive values logged)");
      }
      return NextResponse.json(
        { ok: false, error: "Invalid signature" },
        { status: 401 }
      );
    }
  } else if (process.env.NODE_ENV === 'development') {
    console.warn("[Webhook Neynar] No webhook secrets configured - skipping signature verification");
  }

  try {
    // Parse JSON after signature verification
    const body = JSON.parse(rawBody) as any;
    const eventType = body.type || body.event_type;
    const data = body.data || body;

    webhookMetrics.eventsReceived++;

    if (!eventType) {
      return NextResponse.json(
        { ok: false, error: "Missing event type" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    let processed = false;

    // Handle cast.created
    if (eventType === "cast.created" || eventType === "cast_created") {
      const cast = data.cast || data;
      const castHash = cast.hash || cast.cast_hash;
      const authorFid = cast.author?.fid;
      const parentHash = cast.parent_hash || cast.parentHash;
      const castTimestamp = cast.timestamp 
        ? new Date(cast.timestamp * 1000).toISOString()
        : new Date().toISOString();
      const castCreatedAt = new Date(cast.timestamp * 1000 || Date.now());

      webhookMetrics.byEventType['cast.created'].received++;

      if (!castHash || !authorFid) {
        webhookMetrics.byEventType['cast.created'].ignored++;
        return NextResponse.json({ ok: true, processed: false, reason: "missing_cast_data" });
      }

      // Case 1a: Cast is from AUTHOR_FID - upsert into eligible_casts
      if (authorFid === AUTHOR_FID && AUTHOR_FID > 0) {
        // Only keep if within last 15 days
        if (castCreatedAt >= new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)) {
          const { error } = await supabase
            .from("eligible_casts")
            .upsert({
              cast_hash: castHash,
              author_fid: authorFid,
              created_at: castTimestamp,
              parent_url: cast.parent_url || CATWALK_CHANNEL_PARENT_URL,
              text: cast.text || null,
              last_seen_at: new Date().toISOString(),
            } as any, {
              onConflict: "cast_hash",
            });

          if (!error) {
            webhookMetrics.byEventType['cast.created'].written++;
            webhookMetrics.eventsWritten++;
            processed = true;
          }
        } else {
          webhookMetrics.byEventType['cast.created'].ignored++;
        }
      }
      // Case 1b: This is a reply (has parent_hash) AND parent exists in eligible_casts
      else if (parentHash) {
        // Check if parent exists in eligible_casts
        const { data: parentCast } = await supabase
          .from("eligible_casts")
          .select("cast_hash")
          .eq("cast_hash", parentHash)
          .single();

        if (parentCast) {
          // Upsert reply_map
          const { error: replyMapError } = await supabase
            .from("reply_map")
            .upsert({
              reply_hash: castHash,
              user_fid: authorFid,
              parent_cast_hash: parentHash,
              created_at: castTimestamp,
            } as any, {
              onConflict: "reply_hash",
            });

          if (!replyMapError) {
            // Upsert engagement for reply
            const { error: engagementError } = await supabase
              .from("engagements")
              .upsert({
                user_fid: authorFid,
                cast_hash: parentHash, // Use parent_cast_hash for engagement
                engagement_type: 'reply',
                engaged_at: castTimestamp,
                source: 'webhook',
              } as any, {
                onConflict: "user_fid,cast_hash,engagement_type",
              });

            if (!engagementError) {
              webhookMetrics.byEventType['cast.created'].written++;
              webhookMetrics.eventsWritten++;
              processed = true;
            }
          }
        } else {
          webhookMetrics.byEventType['cast.created'].ignored++;
        }
      } else {
        webhookMetrics.byEventType['cast.created'].ignored++;
      }
    }

    // Handle cast.deleted
    if (eventType === "cast.deleted" || eventType === "cast_deleted") {
      const cast = data.cast || data;
      const castHash = cast.hash || cast.cast_hash;

      webhookMetrics.byEventType['cast.deleted'].received++;

      if (!castHash) {
        webhookMetrics.byEventType['cast.deleted'].ignored++;
        return NextResponse.json({ ok: true, processed: false, reason: "missing_cast_hash" });
      }

      // Case 2a: Deleted cast exists in eligible_casts
      const { data: eligibleCast } = await supabase
        .from("eligible_casts")
        .select("cast_hash")
        .eq("cast_hash", castHash)
        .single();

      if (eligibleCast) {
        // Delete from eligible_casts (cascade will handle engagements and sync_state)
        const { error } = await supabase
          .from("eligible_casts")
          .delete()
          .eq("cast_hash", castHash);

        if (!error) {
          webhookMetrics.byEventType['cast.deleted'].written++;
          webhookMetrics.eventsWritten++;
          webhookMetrics.deletesProcessed++;
          processed = true;
        }
      }
      // Case 2b: Deleted cast exists in reply_map
      else {
        const { data: replyMapRow } = await supabase
          .from("reply_map")
          .select("user_fid, parent_cast_hash")
          .eq("reply_hash", castHash)
          .single();

        if (replyMapRow) {
          const row = replyMapRow as any;
          const userFid = row.user_fid;
          const parentCastHash = row.parent_cast_hash;

          // Delete reply_map row
          const { error: deleteReplyError } = await supabase
            .from("reply_map")
            .delete()
            .eq("reply_hash", castHash);

          if (!deleteReplyError) {
            // Check if user has any other replies for this parent
            const { data: otherReplies } = await supabase
              .from("reply_map")
              .select("reply_hash")
              .eq("user_fid", userFid)
              .eq("parent_cast_hash", parentCastHash)
              .limit(1);

            // If no other replies exist, delete the engagement
            if (!otherReplies || otherReplies.length === 0) {
              const { error: deleteEngagementError } = await supabase
                .from("engagements")
                .delete()
                .eq("user_fid", userFid)
                .eq("cast_hash", parentCastHash)
                .eq("engagement_type", "reply");

              if (!deleteEngagementError) {
                webhookMetrics.byEventType['cast.deleted'].written++;
                webhookMetrics.eventsWritten++;
                webhookMetrics.deletesProcessed++;
                processed = true;
              }
            } else {
              webhookMetrics.byEventType['cast.deleted'].written++;
              webhookMetrics.eventsWritten++;
              processed = true;
            }
          }
        } else {
          webhookMetrics.byEventType['cast.deleted'].ignored++;
        }
      }
    }

    // Handle reaction.created (for likes/recasts)
    if (eventType === "reaction.created" || eventType === "reaction_created") {
      const reaction = data.reaction || data;
      const castHash = reaction.target?.hash || reaction.cast_hash;
      const userFid = reaction.actor?.fid || reaction.user_fid;
      const reactionType = reaction.reaction_type || reaction.type;

      webhookMetrics.byEventType['reaction.created'].received++;

      if (castHash && userFid && (reactionType === "like" || reactionType === "recast")) {
        // Server-side filter: only process if cast is in eligible_casts (last 15 days)
        const { data: eligibleCast } = await supabase
          .from("eligible_casts")
          .select("cast_hash")
          .eq("cast_hash", castHash)
          .gte("created_at", fifteenDaysAgo)
          .single();

        if (eligibleCast) {
          // Upsert engagement
          const { error } = await supabase
            .from("engagements")
            .upsert({
              user_fid: userFid,
              cast_hash: castHash,
              engagement_type: reactionType === "like" ? 'like' : 'recast',
              engaged_at: reaction.timestamp 
                ? new Date(reaction.timestamp * 1000).toISOString()
                : new Date().toISOString(),
              source: 'webhook',
            } as any, {
              onConflict: "user_fid,cast_hash,engagement_type",
            });

          if (!error) {
            webhookMetrics.byEventType['reaction.created'].written++;
            webhookMetrics.eventsWritten++;
            processed = true;
          }
        } else {
          webhookMetrics.byEventType['reaction.created'].ignored++;
          if (process.env.NODE_ENV === 'development') {
            console.log("[Webhook Neynar] Ignored reaction.created - cast not eligible:", castHash.substring(0, 10));
          }
        }
      } else {
        webhookMetrics.byEventType['reaction.created'].ignored++;
      }
    }

    // Handle reaction.deleted (for cleanup)
    if (eventType === "reaction.deleted" || eventType === "reaction_deleted") {
      const reaction = data.reaction || data;
      const castHash = reaction.target?.hash || reaction.cast_hash;
      const userFid = reaction.actor?.fid || reaction.user_fid;
      const reactionType = reaction.reaction_type || reaction.type;

      webhookMetrics.byEventType['reaction.deleted'].received++;

      if (castHash && userFid && (reactionType === "like" || reactionType === "recast")) {
        // Delete the specific engagement
        const { error } = await supabase
          .from("engagements")
          .delete()
          .eq("user_fid", userFid)
          .eq("cast_hash", castHash)
          .eq("engagement_type", reactionType === "like" ? 'like' : 'recast');

        if (!error) {
          webhookMetrics.byEventType['reaction.deleted'].written++;
          webhookMetrics.eventsWritten++;
          webhookMetrics.deletesProcessed++;
          processed = true;
        } else {
          webhookMetrics.byEventType['reaction.deleted'].ignored++;
        }
      } else {
        webhookMetrics.byEventType['reaction.deleted'].ignored++;
      }
    }

    // Update webhook health tracking (on every valid event)
    if (processed || webhookMetrics.eventsReceived > 0) {
      try {
        await supabase
          .from("app_state")
          .upsert({
            key: "last_webhook_at",
            value: { timestamp: new Date().toISOString() },
            updated_at: new Date().toISOString(),
          } as any, {
            onConflict: "key",
          });
      } catch (err) {
        // Best-effort - don't fail the webhook if health tracking fails
        if (process.env.NODE_ENV === 'development') {
          console.warn("[Webhook Neynar] Failed to update health tracking:", err);
        }
      }
    }

    // Dev-only metrics logging
    if (process.env.NODE_ENV === 'development') {
      const now = Date.now();
      if (now - webhookMetrics.lastReset > 60000) { // Log every minute
        console.log("[Webhook Neynar] Metrics:", {
          eventsReceived: webhookMetrics.eventsReceived,
          eventsWritten: webhookMetrics.eventsWritten,
          eventsIgnored: webhookMetrics.eventsIgnored,
          signatureMissing: webhookMetrics.signatureMissing,
          signatureInvalid: webhookMetrics.signatureInvalid,
          deletesProcessed: webhookMetrics.deletesProcessed,
          byEventType: webhookMetrics.byEventType,
        });
        webhookMetrics = {
          eventsReceived: 0,
          eventsWritten: 0,
          eventsIgnored: 0,
          signatureMissing: 0,
          signatureInvalid: 0,
          byEventType: {
            'cast.created': { received: 0, written: 0, ignored: 0 },
            'cast.deleted': { received: 0, written: 0, ignored: 0 },
            'reaction.created': { received: 0, written: 0, ignored: 0 },
            'reaction.deleted': { received: 0, written: 0, ignored: 0 },
          },
          deletesProcessed: 0,
          lastReset: now,
        };
      }
    }

    return NextResponse.json({ ok: true, processed });
  } catch (err) {
    console.error("[Webhook Neynar] Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
