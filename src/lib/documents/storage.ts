import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sha256Hex } from "@/lib/crypto";

// The "documents" bucket is private and has no policies. Only this module,
// running with the service role, touches it. Browsers receive short-lived
// signed URLs that the application issues after its own access checks.

const BUCKET = "documents";
const DOWNLOAD_URL_SECONDS = 60;

export async function uploadPrivateFile(
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await createAdminClient()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Storage upload failed for ${path}: ${error.message}`);
}

export async function downloadPrivateFile(path: string): Promise<Uint8Array> {
  const { data, error } = await createAdminClient().storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`Storage download failed for ${path}: ${error?.message ?? "no data"}`);
  }
  return new Uint8Array(await data.arrayBuffer());
}

export class IntegrityError extends Error {}

// Reads the stored bytes, checks them against the SHA-256 recorded when the
// file was written, and only then issues a short-lived signed URL. A file
// whose bytes no longer match is never handed out.
export async function signedUrlAfterIntegrityCheck(doc: {
  storage_path: string;
  sha256: string;
  file_name: string;
}): Promise<string> {
  const bytes = await downloadPrivateFile(doc.storage_path);
  const actual = sha256Hex(bytes);
  if (actual !== doc.sha256) {
    throw new IntegrityError(
      `Integrity check failed for ${doc.storage_path}: stored hash ${doc.sha256}, computed ${actual}`,
    );
  }
  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrl(doc.storage_path, DOWNLOAD_URL_SECONDS, { download: doc.file_name });
  if (error || !data) {
    throw new Error(`Could not create a signed URL: ${error?.message ?? "no data"}`);
  }
  return data.signedUrl;
}
