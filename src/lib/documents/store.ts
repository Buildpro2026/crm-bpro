import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomSuffix, sha256Hex } from "@/lib/crypto";
import { safeFileName } from "@/lib/files";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadPrivateFile } from "@/lib/documents/storage";

export type StoreDocumentInput = {
  // The client that writes the documents row: the owner's client (RLS) for
  // owner actions, or the admin client for the candidate signing page.
  client: SupabaseClient;
  companyId?: string | null;
  candidateId?: string | null;
  folder: string;
  kind: "uploaded" | "generated" | "signed agreement";
  fileName: string;
  bytes: Uint8Array;
  contentType: string;
  createdBy?: string | null;
};

// Writes the bytes to the private bucket, then records the documents row with
// the SHA-256 that every later download is checked against. If the row cannot
// be written, the stored object is removed again.
export async function storeDocument(input: StoreDocumentInput): Promise<{ id: string; sha256: string }> {
  if (!input.companyId && !input.candidateId) throw new Error("A document must belong to a company or a candidate.");
  const name = safeFileName(input.fileName);
  const prefix = input.companyId ? `companies/${input.companyId}` : `candidates/${input.candidateId}`;
  const stamp = new Date().toISOString().slice(0, 10);
  const storagePath = `${prefix}/files/${stamp}-${randomSuffix()}-${name}`;
  const sha256 = sha256Hex(input.bytes);

  await uploadPrivateFile(storagePath, input.bytes, input.contentType);

  const { data, error } = await input.client
    .from("documents")
    .insert({
      company_id: input.companyId ?? null,
      candidate_id: input.candidateId ?? null,
      folder: input.folder,
      kind: input.kind,
      file_name: name,
      storage_path: storagePath,
      sha256,
      size_bytes: input.bytes.byteLength,
      mime_type: input.contentType,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    await createAdminClient().storage.from("documents").remove([storagePath]);
    throw new Error(`The file record could not be saved. ${error?.message ?? ""}`.trim());
  }
  return { id: data.id, sha256 };
}

export async function removeStoredFile(storagePath: string): Promise<void> {
  await createAdminClient().storage.from("documents").remove([storagePath]);
}
