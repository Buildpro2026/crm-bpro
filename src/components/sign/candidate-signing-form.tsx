"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitCandidateAgreementAction } from "@/app/sign/candidate/[token]/actions";
import {
  CANDIDATE_AGREEMENT_PARAGRAPHS,
  CANDIDATE_AGREEMENT_TITLE,
  CANDIDATE_BUILDPRO_ACCEPTANCE,
  CANDIDATE_CONSENT_TEXT,
  CANDIDATE_SIGNING_FIELDS,
  TEXT_OPT_IN_NO,
  TEXT_OPT_IN_YES,
} from "@/lib/candidate-agreement";

type Props = { token: string; prefill: Record<string, string> };

const input =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-200 aria-[invalid=true]:border-red-500";

export function CandidateSigningForm({ token, prefill }: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      noValidate
      className="space-y-8"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await submitCandidateAgreementAction(token, data);
          if (result.ok) {
            router.refresh();
            return;
          }
          setFormError(result.error);
          setErrors(result.fieldErrors ?? {});
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }}
    >
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Candidate Representation Agreement</h1>
        <p className="mt-1 text-sm text-slate-600">
          Thank you for working with BuildPro Recruiters. Please confirm your information, read the short Agreement, and
          sign at the end by typing your name. There is never a fee to you for our services.
        </p>
      </div>

      {formError ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {formError}
        </p>
      ) : null}

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">1. Your information</h2>
        {CANDIDATE_SIGNING_FIELDS.map((f) => {
          const id = `f-${f.key}`;
          const error = errors[f.key];
          return (
            <div key={f.key}>
              <label htmlFor={id} className="block text-sm font-medium text-slate-800">
                {f.label}
                {f.required ? <span className="text-red-600"> *</span> : null}
              </label>
              {f.type === "textarea" ? (
                <textarea
                  id={id}
                  name={f.key}
                  rows={3}
                  maxLength={f.maxLength}
                  defaultValue={prefill[f.key] ?? ""}
                  aria-invalid={error ? true : undefined}
                  className={input}
                />
              ) : (
                <input
                  id={id}
                  name={f.key}
                  type={f.type}
                  maxLength={f.maxLength}
                  defaultValue={prefill[f.key] ?? ""}
                  aria-invalid={error ? true : undefined}
                  className={input}
                />
              )}
              {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}
            </div>
          );
        })}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">2. The Agreement</h2>
        <div className="max-h-[28rem] space-y-3 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">
          <p className="font-semibold">{CANDIDATE_AGREEMENT_TITLE}</p>
          {CANDIDATE_AGREEMENT_PARAGRAPHS.map((p, i) => (
            <p key={i} className={/^\d+\. [A-Z ]+$/.test(p) ? "pt-2 font-semibold" : undefined}>
              {p}
            </p>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">3. Agreed and accepted</h2>
        <p className="text-sm text-slate-600">{CANDIDATE_BUILDPRO_ACCEPTANCE}</p>

        <fieldset>
          <legend className="text-sm font-medium text-slate-800">
            Text messages <span className="text-red-600">*</span>
          </legend>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="radio" name="text_opt_in" value="yes" className="mt-1" /> {TEXT_OPT_IN_YES}
          </label>
          <label className="mt-1 flex items-start gap-2 text-sm">
            <input type="radio" name="text_opt_in" value="no" className="mt-1" /> {TEXT_OPT_IN_NO}
          </label>
          {errors.text_opt_in ? <p className="mt-1 text-sm text-red-700">{errors.text_opt_in}</p> : null}
        </fieldset>

        <label className="flex items-start gap-2 text-sm text-slate-800">
          <input type="checkbox" name="consent" className="mt-1" /> <span>{CANDIDATE_CONSENT_TEXT}</span>
        </label>
        {errors.consent ? <p className="text-sm text-red-700">{errors.consent}</p> : null}

        <div>
          <label htmlFor="signature_name" className="block text-sm font-medium text-slate-800">
            Signature: type your full legal name <span className="text-red-600">*</span>
          </label>
          <input
            id="signature_name"
            name="signature_name"
            maxLength={200}
            autoComplete="name"
            aria-invalid={errors.signature_name ? true : undefined}
            className={`${input} font-serif text-lg italic`}
          />
          {errors.signature_name ? <p className="mt-1 text-sm text-red-700">{errors.signature_name}</p> : null}
          <p className="mt-1 text-xs text-slate-500">
            Typing your name is your electronic signature and has the same effect as a handwritten signature.
          </p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-sky-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-900 disabled:opacity-60"
        >
          {pending ? "Signing..." : "Sign agreement"}
        </button>
      </section>
    </form>
  );
}
