/**
 * Phase 29.2: Beta Testing — helpers for preview game access via password.
 */

import type { NextRequest } from "next/server";

export const BETA_PASSWORD = "gojets";

/**
 * Check if the request has valid beta access (cookie set after password verification).
 */
export function hasBetaAccess(req: NextRequest): boolean {
  const cookie = req.cookies.get("beta_access");
  return cookie?.value === "1";
}
