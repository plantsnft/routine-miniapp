/**
 * GET /api/admin/betr-usage
 * Returns BETR payout totals: this month and all time
 * 
 * Phase 18: Admin Dashboard
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    // Get start of current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    let thisMonthTotal = 0;
    let allTimeTotal = 0;

    // Settlement tables to query
    const settlementTables = [
      'buddy_up_settlements',
      'mole_settlements',
      'steal_no_steal_settlements',
      'jenga_settlements',
      'remix_betr_settlements',
      'betr_guesser_settlements',
    ];

    for (const table of settlementTables) {
      try {
        // All time
        const allRecords = await pokerDb.fetch<{ prize_amount: number; settled_at: string }>(table, {
          select: "prize_amount,settled_at",
        });

        for (const r of allRecords || []) {
          const amount = Number(r.prize_amount) || 0;
          allTimeTotal += amount;
          
          if (r.settled_at && new Date(r.settled_at) >= new Date(startOfMonth)) {
            thisMonthTotal += amount;
          }
        }
      } catch (e) {
        // Table might not exist or be empty, continue
        console.warn(`[admin/betr-usage] Error querying ${table}:`, e);
      }
    }

    // Also check poker payouts table
    try {
      const payouts = await pokerDb.fetch<{ amount: number; created_at: string }>("payouts", {
        select: "amount,created_at",
      });

      for (const p of payouts || []) {
        const amount = Number(p.amount) || 0;
        allTimeTotal += amount;
        
        if (p.created_at && new Date(p.created_at) >= new Date(startOfMonth)) {
          thisMonthTotal += amount;
        }
      }
    } catch (e) {
      console.warn("[admin/betr-usage] Error querying payouts:", e);
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        thisMonth: thisMonthTotal.toFixed(0),
        allTime: allTimeTotal.toFixed(0),
      },
    });
  } catch (error: any) {
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    console.error("[admin/betr-usage]", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to get BETR usage" },
      { status: 500 }
    );
  }
}
