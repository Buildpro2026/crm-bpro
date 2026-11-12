"use client";

import { useActionState, useEffect, useRef } from "react";
import { uploadFileAction } from "@/app/(owner)/file-actions";
import { ACCEPT_ATTRIBUTE, type FolderOption } from "@/lib/files";

type Props = {
  folders: readonly FolderOption[];
  companyId?: string;
  candidateId?: string;
};

export function FileUpload({ folders, companyId, candidateId }: Props) {
  const [state, formAction, pending] = useActionState(uploadFileAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state?.ok, state?.savedAt]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
      {companyId ? <input type="hidden" name="company_id" value={companyId} /> : null}
      {candidateId ? <input type="hidden" name="candidate_id" value={candidateId} /> : null}
      <label className="text-sm">
        <span className="block font-medium text-slate-800">File</span>
        <input
          type="file"
          name="file"
          required
          accept={ACCEPT_ATTRIBUTE}
          className="mt-1 block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200"
        />
      </label>
      <label className="text-sm">
        <span className="block font-medium text-slate-800">Folder</span>
        <select name="folder" defaultValue={folders[0]?.value} className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
          {folders.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-sky-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-900 disabled:opacity-60"
      >
        {pending ? "Uploading..." : "Upload"}
      </button>
      <p className="w-full text-xs text-slate-500">PDF, Word, Excel, text, or image files, up to 10 MB.</p>
      {state?.error ? (
        <p role="alert" className="w-full text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? <p className="w-full text-sm text-emerald-700">Uploaded.</p> : null}
    </form>
  );
}
