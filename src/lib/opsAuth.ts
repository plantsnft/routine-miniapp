export function isOpsAuthorized(req: Request): boolean {
  // Allow automatically in non-production (local + preview)
  const vercelEnv = process.env.VERCEL_ENV; // "production" | "preview" | "development" | undefined
  const nodeEnv = process.env.NODE_ENV;     // usually "production" on Vercel prod
  const isProd = vercelEnv === "production" || nodeEnv === "production";
  if (!isProd) return true;

  // In production: require secret
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const provided =
    req.headers.get("x-cron-secret") ??
    req.headers.get("x-ops-secret") ??
    "";

  if (!provided) return false;
  return provided === expected;
}
