import { deleteFileAction } from "@/app/(owner)/file-actions";
import { folderLabel, formatBytes, type FolderOption } from "@/lib/files";
import { formatCentralDate } from "@/lib/time";
import { FileUpload } from "@/components/crm/file-upload";

export type FileRow = {
  id: string;
  file_name: string;
  folder: string | null;
  kind: string;
  size_bytes: number | null;
  created_at: string;
};

type Props = {
  files: readonly FileRow[];
  folders: readonly FolderOption[];
  companyId?: string;
  candidateId?: string;
};

const KIND_NOTE: Record<string, string> = {
  generated: "Auto-filled",
  "signed agreement": "Signed online",
  "executed agreement": "Fully executed",
  other: "Client signed",
};

// Folder view of a record's files, Zoho-style: every folder is listed, with
// its files, and new files can be uploaded into any folder.
export function FilesPanel({ files, folders, companyId, candidateId }: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <FileUpload folders={folders} companyId={companyId} candidateId={candidateId} />
      </div>
      <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-sm">
        {folders.map((folder) => {
          const inFolder = files.filter((f) => (f.folder ?? "other") === folder.value);
          return (
            <details key={folder.value} open={inFolder.length > 0} className="group">
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-slate-800 hover:bg-slate-50">
                <span>
                  <span aria-hidden className="mr-2">
                    📁
                  </span>
                  {folderLabel(folder.value)}
                </span>
                <span className="rounded-full bg-slate-100 px-2 text-xs text-slate-600">{inFolder.length}</span>
              </summary>
              {inFolder.length === 0 ? (
                <p className="px-10 pb-3 text-xs text-slate-500">Empty</p>
              ) : (
                <ul className="pb-2">
                  {inFolder.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-10 py-1.5 text-sm">
                      <a href={`/documents/${f.id}`} className="text-sky-900 hover:underline">
                        {f.file_name}
                      </a>
                      <span className="flex items-center gap-3 text-xs text-slate-500">
                        {KIND_NOTE[f.kind] ? (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-800">{KIND_NOTE[f.kind]}</span>
                        ) : null}
                        <span>{formatBytes(f.size_bytes)}</span>
                        <span>{formatCentralDate(f.created_at)}</span>
                        {f.kind === "uploaded" ? (
                          <form action={deleteFileAction}>
                            <input type="hidden" name="id" value={f.id} />
                            <button type="submit" className="text-slate-400 hover:text-red-700" aria-label={`Delete ${f.file_name}`}>
                              Delete
                            </button>
                          </form>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          );
        })}
      </div>
    </div>
  );
}
