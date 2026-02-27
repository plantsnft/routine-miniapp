/**
 * Phase 43: User Feedback – Supabase Storage upload helper.
 * Bucket: feedback (must exist and be public). Use service role for uploads.
 * Max 25 MB per image.
 */

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE } from "./constants";

const BUCKET = "feedback";
const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB

function getStorageClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE required for feedback storage");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false },
  });
}

/**
 * Upload feedback image to bucket and return public URL.
 * Path: {ticketId}/{index}.{ext}
 * Rejects if buffer exceeds 25 MB.
 */
export async function uploadFeedbackImage(
  ticketId: string,
  imageIndex: number,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large (max 25 MB). Got ${(buffer.length / (1024 * 1024)).toFixed(1)} MB.`);
  }

  const ext = mimeType.startsWith("image/") ? mimeType.replace("image/", "") : "jpg";
  const safeExt = ["jpeg", "jpg", "png", "gif", "webp"].includes(ext) ? ext : "jpg";
  const path = `${ticketId}/${imageIndex}.${safeExt}`;

  const ALLOWED_MIME = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
  const safeContentType = ALLOWED_MIME.includes(mimeType) ? mimeType : "image/jpeg";

  const client = getStorageClient();
  const { error } = await client.storage.from(BUCKET).upload(path, buffer, {
    contentType: safeContentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Feedback storage upload failed: ${error.message}`);
  }

  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
