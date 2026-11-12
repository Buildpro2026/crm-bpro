// Shared shape for server action results shown by client forms.
export type FormState =
  | {
      error?: string;
      fieldErrors?: Record<string, string>;
      values?: Record<string, string>;
    }
  | undefined;

// Reads named string fields from FormData, trimmed. Missing fields become "".
export function readStrings(formData: FormData, names: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of names) {
    const v = formData.get(name);
    out[name] = typeof v === "string" ? v.trim() : "";
  }
  return out;
}
