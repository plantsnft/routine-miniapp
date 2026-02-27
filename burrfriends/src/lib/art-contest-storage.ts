/**
 * Phase 39: TO SPINFINITY AND BEYOND ART CONTEST – Supabase Storage upload helper.
 * Bucket: art-contest (must exist and be public). Use service role for uploads.
 */

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE } from "./constants";

const BUCKET = "art-contest";

function getStorageClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE required for art contest storage");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false },
  });
}

/**
 * Upload image buffer to art-contest bucket and return public URL.
 * Path: {contestId}/{submissionId}.{ext}
 */
export async function uploadArtContestImage(
  contestId: string,
  submissionId: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const ext = mimeType.startsWith("image/") ? mimeType.replace("image/", "") : "jpg";
  const safeExt = ["jpeg", "jpg", "png", "gif", "webp"].includes(ext) ? ext : "jpg";
  const path = `${contestId}/${submissionId}.${safeExt}`;

  const client = getStorageClient();
  const { error } = await client.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType.startsWith("image/") ? mimeType : "image/jpeg",
    upsert: true,
  });

  if (error) {
    throw new Error(`Art contest storage upload failed: ${error.message}`);
  }

  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
