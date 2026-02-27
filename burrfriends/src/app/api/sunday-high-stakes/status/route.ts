/**
 * GET /api/sunday-high-stakes/status
 * Auth required. Returns: stakeEligible, stakedAmount, canSubmit, contest (active contest or null).
 * Phase 29.1 Layer 2: Eligibility = 1M BETR staked (betr community). Allowlist FIDs and admins bypass all checks.
 * canSubmit true when contest is open, within signup window, and (allowlist OR admin OR stakeEligible).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { isGlobalAdmin } from "~/lib/permissions";
import { SUNDAY_HIGH_STAKES_ALLOWLIST_FIDS } from "~/lib/constants";
import { isWithinSignupWindow } from "~/lib/sundayHighStakes";
import { checkUserStakeByFid } from "~/lib/staking";
import type { ApiResponse } from "~/lib/types";

const STAKE_REQUIRED = 1_000_000;

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    const adminBypass = isGlobalAdmin(fid);
    const allowlistBypass = SUNDAY_HIGH_STAKES_ALLOWLIST_FIDS.includes(Number(fid));

    const [contests, stakeResult] = await Promise.all([
      pokerDb.fetch<Record<string, unknown>>("sunday_high_stakes", {
        filters: { status: "open" },
        order: "created_at.desc",
        limit: 1,
      }),
      adminBypass || allowlistBypass
        ? Promise.resolve({ meetsRequirement: true, stakedAmount: "0" })
        : checkUserStakeByFid(Number(fid), STAKE_REQUIRED, "betr"),
    ]);

    const stakeEligible = stakeResult.meetsRequirement;
    const stakedAmount = stakeResult.stakedAmount ?? "0";
    const contest = contests?.[0] ?? null;
    const open = contest && (contest.status as string) === "open";
    const withinWindow = !contest?.starts_at || isWithinSignupWindow(contest as { starts_at?: string | null });
    const canSubmit =
      !!open &&
      withinWindow &&
      (allowlistBypass || adminBypass || stakeEligible);

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        stakeEligible: !!stakeEligible,
        stakedAmount,
        canSubmit: !!canSubmit,
        contest: contest
          ? {
              id: contest.id,
              title: contest.title,
              status: contest.status,
              is_preview: contest.is_preview,
              clubgg_url: contest.clubgg_url,
              starts_at: contest.starts_at ?? null,
            }
          : null,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[sunday-high-stakes/status]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to get status" },
      { status: 500 }
    );
  }
}
