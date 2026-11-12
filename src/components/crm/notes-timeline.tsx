import Link from "next/link";
import { deleteNoteAction } from "@/app/(owner)/crm-actions";
import { formatCentralDateTime } from "@/lib/time";

export type NoteRow = {
  id: string;
  body: string;
  created_at: string;
  deal_id: string | null;
  contact_id: string | null;
};

type Props = {
  notes: readonly NoteRow[];
  returnPath: string;
  dealNames?: ReadonlyMap<string, string>;
  contactNames?: ReadonlyMap<string, string>;
};

export function NotesTimeline({ notes, returnPath, dealNames, contactNames }: Props) {
  if (notes.length === 0) return <p className="text-sm text-slate-600">No notes yet.</p>;
  return (
    <ol className="space-y-3">
      {notes.map((n) => {
        const deal = n.deal_id ? dealNames?.get(n.deal_id) : undefined;
        const contact = n.contact_id ? contactNames?.get(n.contact_id) : undefined;
        return (
          <li key={n.id} className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                {formatCentralDateTime(n.created_at)}
                {deal && n.deal_id ? (
                  <>
                    {"  |  "}
                    <Link href={`/deals/${n.deal_id}`} className="text-sky-900 hover:underline">
                      Deal: {deal}
                    </Link>
                  </>
                ) : null}
                {contact ? `  |  ${contact}` : null}
              </span>
              <form action={deleteNoteAction}>
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="return_path" value={returnPath} />
                <button type="submit" className="text-slate-400 hover:text-red-700">
                  Delete
                </button>
              </form>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-slate-800">{n.body}</p>
          </li>
        );
      })}
    </ol>
  );
}
