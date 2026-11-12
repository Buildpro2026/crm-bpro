"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/owner";
import { writeAudit } from "@/lib/audit";
import type { FormState } from "@/lib/form-state";
import { isUuid } from "@/lib/records";
import { contentTypeFor, isFolderFor, validateUpload } from "@/lib/files";
import { removeStoredFile, storeDocument } from "@/lib/documents/store";
import { buildAboutBuildProPdf } from "@/lib/documents/generated";

function recordPath(companyId: string | null, candidateId: string | null): string {
  return companyId ? `/companies/${companyId}` : `/candidates/${candidateId}`;
}

export async function uploadFileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const companyId = String(formData.get("company_id") ?? "") || null;
  const candidateId = String(formData.get("candidate_id") ?? "") || null;
  const folder = String(formData.get("folder") ?? "");
  const file = formData.get("file");

  if ((companyId && !isUuid(companyId)) || (candidateId && !isUuid(candidateId)) || (!companyId && !candidateId)) {
    return { error: "That record was not found." };
  }
  if (!isFolderFor(companyId ? "company" : "candidate", folder)) return { error: "Choose a folder." };
  if (!(file instanceof File)) return { error: "Choose a file to upload." };
  const problem = validateUpload(file);
  if (problem) return { error: problem };

  // Confirm the record exists and is visible to the owner before storing.
  const table = companyId ? "companies" : "candidates";
  const { data: record } = await owner.supabase.from(table).select("id").eq("id", companyId ?? candidateId!).maybeSingle();
  if (!record) return { error: "That record was not found." };

  try {
    const doc = await storeDocument({
      client: owner.supabase,
      companyId,
      candidateId,
      folder,
      kind: "uploaded",
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: contentTypeFor(file.name)!,
      createdBy: owner.profile.id,
    });
    await writeAudit(owner.supabase, {
      actor: owner.actor,
      action: "file_uploaded",
      companyId,
      candidateId,
      detail: { document_id: doc.id, file_name: file.name, folder, sha256: doc.sha256, size_bytes: file.size },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The file could not be uploaded." };
  }
  revalidatePath(recordPath(companyId, candidateId));
  return { ok: true, savedAt: Date.now() };
}

// Only files that were uploaded by hand can be deleted. Signed agreements and
// generated documents stay, because the audit trail points at them.
export async function deleteFileAction(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return;
  const { data: doc } = await owner.supabase
    .from("documents")
    .select("id, kind, storage_path, file_name, company_id, candidate_id")
    .eq("id", id)
    .maybeSingle();
  if (!doc || doc.kind !== "uploaded") return;

  const { error } = await owner.supabase.from("documents").delete().eq("id", id);
  if (error) return;
  await removeStoredFile(doc.storage_path);
  await writeAudit(owner.supabase, {
    actor: owner.actor,
    action: "file_deleted",
    companyId: doc.company_id,
    candidateId: doc.candidate_id,
    detail: { document_id: id, file_name: doc.file_name },
  });
  revalidatePath(recordPath(doc.company_id, doc.candidate_id));
}

export async function generateAboutBuildProAction(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const companyId = String(formData.get("company_id") ?? "");
  if (!isUuid(companyId)) return;
  const { data: company } = await owner.supabase.from("companies").select("id, name").eq("id", companyId).maybeSingle();
  if (!company) return;

  const now = new Date();
  const pdf = await buildAboutBuildProPdf({ companyName: company.name, generatedAt: now });
  const doc = await storeDocument({
    client: owner.supabase,
    companyId,
    folder: "client packet",
    kind: "generated",
    fileName: `${company.name} - About BuildPro Recruiters - ${now.toISOString().slice(0, 10)}.pdf`,
    bytes: pdf,
    contentType: "application/pdf",
    createdBy: owner.profile.id,
  });
  await writeAudit(owner.supabase, {
    actor: owner.actor,
    action: "document_generated",
    companyId,
    detail: { document_id: doc.id, template: "about_buildpro", sha256: doc.sha256 },
  });
  revalidatePath(`/companies/${companyId}`);
}
