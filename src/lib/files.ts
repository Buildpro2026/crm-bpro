// File folders and upload rules. Pure module. Folder values mirror the
// documents.folder check constraint in 0003_candidates_and_files.sql.

export const COMPANY_FOLDERS = [
  { value: "client packet", label: "Client packet" },
  { value: "agreements", label: "Agreements" },
  { value: "search forms", label: "Search forms" },
  { value: "job descriptions", label: "Job descriptions" },
  { value: "invoices", label: "Invoices" },
  { value: "correspondence", label: "Correspondence" },
  { value: "other", label: "Other" },
] as const;

export const CANDIDATE_FOLDERS = [
  { value: "resumes", label: "Resumes" },
  { value: "agreements", label: "Agreements" },
  { value: "applications", label: "Applications" },
  { value: "references", label: "References" },
  { value: "offer letters", label: "Offer letters" },
  { value: "correspondence", label: "Correspondence" },
  { value: "other", label: "Other" },
] as const;

export type FolderOption = { value: string; label: string };

export function isFolderFor(owner: "company" | "candidate", folder: string): boolean {
  const list: readonly FolderOption[] = owner === "company" ? COMPANY_FOLDERS : CANDIDATE_FOLDERS;
  return list.some((f) => f.value === folder);
}

export function folderLabel(folder: string): string {
  return [...COMPANY_FOLDERS, ...CANDIDATE_FOLDERS].find((f) => f.value === folder)?.label ?? "Other";
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  rtf: "application/rtf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export const ALLOWED_EXTENSIONS = Object.keys(CONTENT_TYPES);
export const ACCEPT_ATTRIBUTE = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

export function extensionOf(fileName: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName);
  return match ? match[1].toLowerCase() : "";
}

// The content type is derived from the extension, never trusted from the
// browser, so a file is always served as what its name says it is.
export function contentTypeFor(fileName: string): string | null {
  return CONTENT_TYPES[extensionOf(fileName)] ?? null;
}

// Keeps letters, digits, spaces, dots, dashes, underscores and parentheses,
// and caps the length, so the name is safe in a storage path and a download.
export function safeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "file";
  const ext = extensionOf(base);
  const stem = base
    .slice(0, ext ? -(ext.length + 1) : undefined)
    .normalize("NFKD")
    .replace(/[^\w .()-]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${stem || "file"}${ext ? `.${ext}` : ""}`;
}

export function validateUpload(file: { name: string; size: number }): string | null {
  if (!file.name || file.size === 0) return "Choose a file to upload.";
  if (file.size > MAX_UPLOAD_BYTES) return "That file is larger than 10 MB.";
  if (!contentTypeFor(file.name)) {
    return `That file type is not allowed. Use one of: ${ALLOWED_EXTENSIONS.join(", ")}.`;
  }
  return null;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
