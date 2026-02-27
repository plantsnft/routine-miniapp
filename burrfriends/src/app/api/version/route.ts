/**
 * GET /api/version
 * Diagnostic endpoint to verify Vercel deployment details
 * No authentication required - purely diagnostic
 */
export const runtime = 'nodejs';

export async function GET() {
  return Response.json({
    vercelEnv: process.env.VERCEL_ENV ?? null,
    gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    gitCommitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    buildTime: process.env.BUILD_TIME ?? process.env.VERCEL_BUILD_TIME ?? null,
  });
}

