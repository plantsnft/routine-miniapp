/**
 * GET /api/admin/wallet-status
 * Returns master wallet BETR balance and address
 * 
 * Phase 18: Admin Dashboard
 */

import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { MASTER_WALLET_ADDRESS, BETR_TOKEN_ADDRESS, MINTED_MERCH_TOKEN_ADDRESS, BASE_RPC_URL } from "~/lib/constants";
import type { ApiResponse } from "~/lib/types";

const BETR_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view' as const,
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    if (!MASTER_WALLET_ADDRESS || !BETR_TOKEN_ADDRESS || !BASE_RPC_URL) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Wallet configuration missing" },
        { status: 500 }
      );
    }

    const publicClient = createPublicClient({
      chain: base,
      transport: http(BASE_RPC_URL),
    });

    // Get BETR balance and Minted Merch balance in parallel (Phase 36)
    const [balanceWei, mintedMerchBalanceWei] = await Promise.all([
      publicClient.readContract({
        address: BETR_TOKEN_ADDRESS as `0x${string}`,
        abi: BETR_ABI,
        functionName: 'balanceOf',
        args: [MASTER_WALLET_ADDRESS as `0x${string}`],
      }),
      publicClient.readContract({
        address: MINTED_MERCH_TOKEN_ADDRESS as `0x${string}`,
        abi: BETR_ABI,
        functionName: 'balanceOf',
        args: [MASTER_WALLET_ADDRESS as `0x${string}`],
      }),
    ]);

    const balance = formatUnits(balanceWei, 18);
    const balanceNum = Number(balance);
    const mintedMerchBalance = formatUnits(mintedMerchBalanceWei, 18);

    // Wallet warning thresholds (Phase 18.1)
    let warningLevel: 'ok' | 'warning' | 'critical' = 'ok';
    if (balanceNum < 5_000_000) {
      warningLevel = 'critical';
    } else if (balanceNum < 20_000_000) {
      warningLevel = 'warning';
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        address: MASTER_WALLET_ADDRESS,
        balance,
        warningLevel,
        mintedMerchBalance,
        baseScanUrl: `https://basescan.org/address/${MASTER_WALLET_ADDRESS}`,
      },
    });
  } catch (error: any) {
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    console.error("[admin/wallet-status]", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to get wallet status" },
      { status: 500 }
    );
  }
}
