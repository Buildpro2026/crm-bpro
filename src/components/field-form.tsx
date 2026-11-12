"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/form-state";

export type FieldSpec = {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "url" | "password" | "date" | "number" | "textarea" | "select";
  required?: boolean;
  options?: readonly { value: string; label: string }[];
  full?: boolean; // span both columns on wide screens
  hint?: string;
  maxLength?: number;
  autoComplete?: string;
};

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  fields: readonly FieldSpec[];
  defaults?: Record<string, string>;
  hidden?: Record<string, string>;
  submitLabel: string;
  cancelHref?: string;
};

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-200 aria-[invalid=true]:border-red-500";

export function FieldForm({ action, fields, defaults = {}, hidden = {}, submitLabel, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const valueOf = (name: string) => state?.values?.[name] ?? defaults[name] ?? "";
  const errorOf = (name: string) => state?.fieldErrors?.[name];

  return (
    <form action={formAction} noValidate className="space-y-5">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      {state?.error ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map((field) => {
          const id = `field-${field.name}`;
          const error = errorOf(field.name);
          const common = {
            id,
            name: field.name,
            required: field.required,
            maxLength: field.maxLength,
            autoComplete: field.autoComplete,
            "aria-invalid": error ? true : undefined,
            "aria-describedby": error || field.hint ? `${id}-help` : undefined,
            className: inputClass,
          };
          return (
            <div key={field.name} className={field.full || field.type === "textarea" ? "sm:col-span-2" : undefined}>
              <label htmlFor={id} className="block text-sm font-medium text-slate-800">
                {field.label}
                {field.required ? <span className="text-red-600"> *</span> : null}
              </label>
              {field.type === "textarea" ? (
                <textarea {...common} rows={4} defaultValue={valueOf(field.name)} />
              ) : field.type === "select" ? (
                <select {...common} defaultValue={valueOf(field.name)}>
                  <option value="">Choose one</option>
                  {field.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  {...common}
                  type={field.type ?? "text"}
                  defaultValue={field.type === "password" ? undefined : valueOf(field.name)}
                />
              )}
              {error ? (
                <p id={`${id}-help`} className="mt-1 text-sm text-red-700">
                  {error}
                </p>
              ) : field.hint ? (
                <p id={`${id}-help`} className="mt-1 text-xs text-slate-500">
                  {field.hint}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-md bg-sky-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-900 disabled:opacity-60"
        >
          {pending ? "Saving..." : submitLabel}
        </button>
        {cancelHref ? (
          <a href={cancelHref} className="text-sm text-slate-600 hover:text-slate-900">
            Cancel
          </a>
        ) : null}
      </div>
    </form>
  );
}
