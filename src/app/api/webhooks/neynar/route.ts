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
  lastReset: Date.now(),
};

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

    // Get eligible casts from last 15 days for server-side filtering
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    const { data: eligibleCasts } = await supabase
      .from("eligible_casts")
      .select("cast_hash")
      .gte("created_at", fifteenDaysAgo);

    const eligibleCastHashes = new Set((eligibleCasts || []).map((c: any) => c.cast_hash));

    let processed = false;

    // Handle cast.created (for replies)
    if (eventType === "cast.created" || eventType === "cast_created") {
      const cast = data.cast || data;
      const parentHash = cast.parent_hash || cast.parentHash;
      
      if (parentHash && cast.author?.fid) {
        // Server-side filter: only process if parent is in eligible_casts (last 15 days)
        if (eligibleCastHashes.has(parentHash)) {
          // Upsert engagement
          const { error } = await supabase
            .from("engagements")
            .upsert({
              user_fid: cast.author.fid,
              cast_hash: parentHash,
              engagement_type: 'reply',
              engaged_at: cast.timestamp 
                ? new Date(cast.timestamp * 1000).toISOString()
                : new Date().toISOString(),
              source: 'webhook',
            } as any, {
              onConflict: "user_fid,cast_hash,engagement_type",
            });

          if (!error) {
            webhookMetrics.eventsWritten++;
            processed = true;
          }
        } else {
          webhookMetrics.eventsIgnored++;
          if (process.env.NODE_ENV === 'development') {
            console.log("[Webhook Neynar] Ignored cast.created - parent not eligible:", parentHash.substring(0, 10));
          }
        }
      }
    }

    // Handle cast.deleted (for cleanup)
    if (eventType === "cast.deleted" || eventType === "cast_deleted") {
      const cast = data.cast || data;
      const castHash = cast.hash || cast.cast_hash;
      
      if (castHash) {
        // Delete all engagements for this cast
        const { error } = await supabase
          .from("engagements")
          .delete()
          .eq("cast_hash", castHash);

        if (!error) {
          webhookMetrics.eventsWritten++;
          processed = true;
        }
      }
    }

    // Handle reaction.created (for likes/recasts)
    if (eventType === "reaction.created" || eventType === "reaction_created") {
      const reaction = data.reaction || data;
      const castHash = reaction.target?.hash || reaction.cast_hash;
      const userFid = reaction.actor?.fid || reaction.user_fid;
      const reactionType = reaction.reaction_type || reaction.type;

      if (castHash && userFid && (reactionType === "like" || reactionType === "recast")) {
        // Server-side filter: only process if cast is in eligible_casts (last 15 days)
        if (eligibleCastHashes.has(castHash)) {
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
            webhookMetrics.eventsWritten++;
            processed = true;
          }
        } else {
          webhookMetrics.eventsIgnored++;
          if (process.env.NODE_ENV === 'development') {
            console.log("[Webhook Neynar] Ignored reaction.created - cast not eligible:", castHash.substring(0, 10));
          }
        }
      }
    }

    // Handle reaction.deleted (for cleanup)
    if (eventType === "reaction.deleted" || eventType === "reaction_deleted") {
      const reaction = data.reaction || data;
      const castHash = reaction.target?.hash || reaction.cast_hash;
      const userFid = reaction.actor?.fid || reaction.user_fid;
      const reactionType = reaction.reaction_type || reaction.type;

      if (castHash && userFid && (reactionType === "like" || reactionType === "recast")) {
        // Delete the specific engagement
        const { error } = await supabase
          .from("engagements")
          .delete()
          .eq("user_fid", userFid)
          .eq("cast_hash", castHash)
          .eq("engagement_type", reactionType === "like" ? 'like' : 'recast');

        if (!error) {
          webhookMetrics.eventsWritten++;
          processed = true;
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
        });
        webhookMetrics = {
          eventsReceived: 0,
          eventsWritten: 0,
          eventsIgnored: 0,
          signatureMissing: 0,
          signatureInvalid: 0,
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
