import { NextResponse } from "next/server";
import { getNeynarClient } from "~/lib/neynar";
import { updateUserTokenBalance } from "~/lib/supabase";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";
const TOKEN_ADDRESS = "0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07"; // CATWALK on Base

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

/**
 * Cron job for syncing token balances
 * GET /api/cron/sync-balances
 * 
 * This runs daily and:
 * 1. Gets all users from checkins table
 * 2. Fetches their CATWALK balance via Neynar API
 * 3. Updates token_balance column for fast leaderboard queries
 * 
 * Schedule: Daily at 2 AM UTC (in vercel.json)
 */
export async function GET(request: Request) {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log("[Sync-Balances] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Sync-Balances] Starting balance sync job...");

  try {
    // Step 1: Get all users from checkins table
    const usersRes = await fetch(
      `${SUPABASE_URL}/rest/v1/checkins?select=fid&order=fid.asc`,
      {
        method: "GET",
        headers: SUPABASE_HEADERS,
      }
    );

    if (!usersRes.ok) {
      throw new Error("Failed to fetch users from checkins");
    }

    const users = await usersRes.json() as { fid: number }[];
    console.log(`[Sync-Balances] Found ${users.length} users to sync`);

    if (users.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No users to sync",
        synced: 0,
      });
    }

    const client = getNeynarClient();
    let syncedCount = 0;
    let errorCount = 0;
    const results: { fid: number; balance: number; error?: string }[] = [];

    // Step 2: Process users in batches to avoid rate limiting
    const BATCH_SIZE = 10;
    const DELAY_BETWEEN_BATCHES_MS = 1000; // 1 second between batches

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (user) => {
        try {
          const balance = await getTokenBalanceFromNeynar(client, user.fid);
          
          // Update in database
          await updateUserTokenBalance(user.fid, balance);
          
          syncedCount++;
          return { fid: user.fid, balance };
        } catch (error: any) {
          errorCount++;
          console.error(`[Sync-Balances] Error syncing FID ${user.fid}:`, error.message);
          return { fid: user.fid, balance: 0, error: error.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Log progress
      console.log(`[Sync-Balances] Progress: ${Math.min(i + BATCH_SIZE, users.length)}/${users.length} users processed`);

      // Delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < users.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
      }
    }

    console.log(`[Sync-Balances] Complete! Synced: ${syncedCount}, Errors: ${errorCount}`);

    return NextResponse.json({
      ok: true,
      message: `Synced ${syncedCount} users, ${errorCount} errors`,
      synced: syncedCount,
      errors: errorCount,
      totalUsers: users.length,
    });

  } catch (error: any) {
    console.error("[Sync-Balances] Fatal error:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Get CATWALK token balance for a user via Neynar API.
 */
async function getTokenBalanceFromNeynar(client: any, fid: number): Promise<number> {
  try {
    const response = await client.fetchUserBalance({
      fid: fid,
      networks: ['base'],
    });

    const userBalance = response.user_balance as any;
    const addressBalances = userBalance?.address_balances || [];
    let totalBalance = 0;

    // Sum up CATWALK tokens across all wallets
    for (const addressBalance of addressBalances) {
      const tokenBalances = addressBalance?.token_balances || [];
      
      for (const tokenBalance of tokenBalances) {
        const token = tokenBalance?.token;
        if (!token) continue;
        
        const contractAddr = token.contract_address || token.contractAddress || token.address;
        
        // Check if this is CATWALK token
        if (contractAddr?.toLowerCase() === TOKEN_ADDRESS.toLowerCase()) {
          const balance = tokenBalance.balance?.in_token || tokenBalance.balance || 0;
          const balanceNum = typeof balance === 'number' ? balance : parseFloat(String(balance)) || 0;
          
          if (balanceNum > 0) {
            totalBalance += balanceNum;
          }
        }
      }
    }

    return totalBalance;
  } catch (error: any) {
    console.error(`[Sync-Balances] Neynar error for FID ${fid}:`, error.message);
    return 0;
  }
}
