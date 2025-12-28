import { NextResponse } from "next/server";
import { BASE_CHAIN_ID, GAME_ESCROW_CONTRACT } from "~/lib/constants";

/**
 * GET /api/health
 * Health check endpoint (no auth required)
 * Returns app version, chain ID, and contract address for debugging
 * 
 * No secrets exposed - only public configuration values
 */
export async function GET() {
  try {
    // Get version from package.json (read at build time)
    // In Next.js, we can't easily read package.json at runtime, so use env vars
    // Vercel automatically provides VERCEL_GIT_COMMIT_SHA
    const buildSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'dev';
    const version = process.env.npm_package_version || '0.1.0';
    const shortSha = buildSha.length >= 7 ? buildSha.slice(0, 7) : buildSha;
    
    return NextResponse.json({
      status: 'ok',
      version,
      buildSha: shortSha,
      chainId: BASE_CHAIN_ID,
      contractAddress: GAME_ESCROW_CONTRACT || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

