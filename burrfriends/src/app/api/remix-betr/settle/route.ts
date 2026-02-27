/**
 * POST /api/remix-betr/settle
 * Admin only. Body: { roundId?, roundLabel?, winners: [ {fid, amount, position} ], notes? }.
 * Advantage-only (all amount 0): 1–N winners allowed; each stored with position 1. Payout path: exactly 3 winners.
 * If roundId provided, updates that round to settled. Otherwise auto-selects most recent non-settled round.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import {
  fetchBulkWalletAddressesForWinners,
  resolveWinners,
  transferBETRToWinners,
  createSettlementResponse,
  type WinnerEntry,
} from "~/lib/settlement-core";
import { sendNotificationToFid } from "~/lib/notifications";
import { formatPrizeAmount } from "~/lib/format-prize";
import { APP_URL, COMMUNITY_CONFIG } from "~/lib/constants";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const winners: Array<{ fid?: number; amount?: number; position?: number }> = Array.isArray(body.winners) ? body.winners : [];
    const roundId = typeof body.roundId === "string" ? body.roundId.trim() || null : null;
    const roundLabel = typeof body.roundLabel === "string" ? body.roundLabel.trim() || null : null;
    const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

    // Find the round to settle (provided roundId or most recent non-settled)
    let targetRound: { id: string; round_label?: string | null } | null = null;
    if (roundId) {
      const rounds = await pokerDb.fetch<{ id: string; status: string; round_label?: string | null; community?: string }>("remix_betr_rounds", {
        filters: { id: roundId },
        limit: 1,
      });
      if (!rounds || rounds.length === 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Round not found" }, { status: 404 });
      }
      if (rounds[0].status === "settled") {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Round already settled" }, { status: 400 });
      }
      targetRound = rounds[0];
    } else {
      // Auto-select most recent open or closed round
      const [openRounds, closedRounds] = await Promise.all([
        pokerDb.fetch<{ id: string; round_label?: string | null; created_at: string }>("remix_betr_rounds", {
          filters: { status: "open" },
          order: "created_at.desc",
          limit: 1,
        }),
        pokerDb.fetch<{ id: string; round_label?: string | null; created_at: string }>("remix_betr_rounds", {
          filters: { status: "closed" },
          order: "created_at.desc",
          limit: 1,
        }),
      ]);
      const candidates = [...(openRounds || []), ...(closedRounds || [])];
      if (candidates.length > 0) {
        candidates.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        targetRound = candidates[0];
      }
    }

    const [scores, regs] = await Promise.all([
      pokerDb.fetch<{ fid: number }>("remix_betr_scores", { select: "fid", limit: 1000 }),
      pokerDb.fetch<{ fid: number }>("betr_games_registrations", { select: "fid", limit: 10000 }),
    ]);
    const registeredSet = new Set((regs || []).map((r: any) => Number(r.fid)));
    const submittersSet = new Set((scores || []).filter((s: any) => registeredSet.has(Number(s.fid))).map((s: any) => Number(s.fid)));

    // Phase 2: Use unified settlement library
    const winnerFids = winners.map(w => Number(w?.fid)).filter(fid => fid && !isNaN(fid));
    if (winnerFids.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No valid winner FIDs provided" }, { status: 400 });
    }

    // Validate eligibility (REMIX BETR specific: must be in submitters set)
    for (const w of winners) {
      const winnerFid = Number(w?.fid);
      if (!submittersSet.has(winnerFid)) {
        return NextResponse.json<ApiResponse>({ ok: false, error: `Winner FID ${winnerFid} must have at least one verified score.` }, { status: 400 });
      }
    }

    const winnerEntries: WinnerEntry[] = winners.map((w) => ({
      fid: Number(w?.fid),
      amount: typeof w?.amount === "number" ? w.amount : parseFloat(String(w?.amount ?? "")),
      position: Number(w?.position) || 0,
    }));
    const isAdvantageOnly = winnerEntries.every((e) => e.amount === 0);

    if (isAdvantageOnly) {
      if (winnerEntries.length < 1) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "At least one winner required." }, { status: 400 });
      }
    } else {
      if (winnerEntries.length !== 3) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Exactly 3 winners required for payout." }, { status: 400 });
      }
    }

    let resolved: { winnerFid: number; amount: number; position: number; address: string }[];
    let txHashes: string[];

    if (isAdvantageOnly) {
      // FRAMEDL advantage-only: no BETR transfer; all winners stored as position 1 (single "1st" group)
      resolved = winnerEntries.map((w) => ({
        winnerFid: w.fid,
        amount: 0,
        position: 1,
        address: "",
      }));
      txHashes = [];
    } else {
      // Phase 36: resolve community config once for wallet ordering + token transfer
      const roundCommunity = (targetRound as any)?.community;
      const commCfg = COMMUNITY_CONFIG[(roundCommunity === 'minted_merch' ? 'minted_merch' : 'betr') as keyof typeof COMMUNITY_CONFIG];

      // Fetch wallet addresses for all winners (batched), ordered by community staking
      const addressMap = await fetchBulkWalletAddressesForWinners(winnerFids, commCfg.stakingAddress, commCfg.stakingFn);
      try {
        resolved = resolveWinners(winnerEntries, addressMap);
      } catch (error) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: error instanceof Error ? error.message : "Failed to resolve winners" },
          { status: 400 }
        );
      }
      try {
        txHashes = await transferBETRToWinners(resolved, commCfg.tokenAddress);
      } catch (error) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: error instanceof Error ? error.message : "Failed to transfer tokens" },
          { status: 500 }
        );
      }
      if (txHashes.length !== resolved.length) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: `Transaction hash count mismatch: expected ${resolved.length}, got ${txHashes.length}. Settlement aborted to prevent data corruption.` },
          { status: 500 }
        );
      }
    }

    // Insert settlement records
    const chosenAt = new Date().toISOString();
    const effectiveRoundLabel = roundLabel || targetRound?.round_label || null;
    for (let i = 0; i < resolved.length; i++) {
      const r = resolved[i];
      await pokerDb.insert("remix_betr_settlements", [
        {
          round_label: effectiveRoundLabel,
          winner_fid: r.winnerFid,
          amount: r.amount,
          position: r.position,
          chosen_by_fid: fid,
          chosen_at: chosenAt,
          tx_hash: txHashes[i] ?? null,
          notes,
        },
      ]);
    }

    // Update round status to settled if we have a target round
    if (targetRound) {
      await pokerDb.update("remix_betr_rounds", { id: targetRound.id }, {
        status: "settled",
        settled_at: chosenAt,
        settle_tx_hashes: txHashes,
        updated_at: chosenAt,
      });
    }

    // Phase 21: Send winner notifications after settlement (async, non-blocking). Skip for advantage-only (no payout). Never send for preview rounds.
    if (!isAdvantageOnly && targetRound && !(targetRound as any).is_preview) {
      const roundTitle = effectiveRoundLabel || "FRAMEDL BETR";
      after(async () => {
        try {
          const truncatedTitle = roundTitle.length > 15 ? roundTitle.substring(0, 15) + "..." : roundTitle;
          for (const r of resolved) {
            await sendNotificationToFid(
              r.winnerFid,
              {
                title: `${truncatedTitle} - Results`,
                body: `You won ${formatPrizeAmount(r.amount)} BETR! Click here to view the payment details.`,
                targetUrl: `${APP_URL}/results?gameId=${effectiveRoundLabel}&type=framedl_betr`,
              },
              `settlement:framedl_betr:${effectiveRoundLabel}:${r.winnerFid}`
            );
          }
          safeLog("info", "[remix-betr/settle] Winner notifications sent", { roundLabel: effectiveRoundLabel, winnerCount: resolved.length });
        } catch (notifErr) {
          safeLog("error", "[remix-betr/settle] Failed to send winner notifications", {
            roundLabel: effectiveRoundLabel,
            error: (notifErr as Error)?.message,
          });
        }
      });
    }

    return NextResponse.json<ApiResponse>(
      createSettlementResponse(txHashes[0] || "", txHashes, resolved)
    );
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[remix-betr/settle]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to settle" }, { status: 500 });
  }
}
