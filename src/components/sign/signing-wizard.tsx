"use client";

import { useState, useTransition } from "react";
import { saveIntakeAction, submitSignatureAction } from "@/app/sign/[token]/actions";
import { SignaturePad } from "@/components/sign/signature-pad";
import { isEmail, type IntakeAnswers } from "@/lib/intake-form";

type FieldDef = {
  key: string;
  label: string;
  type: "text" | "textarea" | "email" | "tel" | "date" | "number" | "select";
  options?: string[];
  maxLength?: number;
};

type Props = {
  token: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  agreementTitle: string;
  agreementParagraphs: string[];
  sections: Array<{ title: string; fields: FieldDef[] }>;
  savedAnswers: IntakeAnswers | null;
};

type Step = 1 | 2 | 3;

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base shadow-sm focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-200 aria-[invalid=true]:border-red-500";

export function SigningWizard(props: Props) {
  const { token, companyName, agreementTitle, agreementParagraphs, sections } = props;
  const allFields = sections.flatMap((s) => s.fields);

  const [step, setStep] = useState<Step>(1);
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const f of allFields) initial[f.key] = props.savedAnswers?.[f.key] ?? "";
    // Pre-fill company and contact from what BuildPro already has.
    if (!initial.company_name) initial.company_name = companyName;
    if (!initial.contact_name) initial.contact_name = props.contactName;
    if (!initial.contact_email) initial.contact_email = props.contactEmail;
    return initial;
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [signerName, setSignerName] = useState(props.contactName);
  const [signerTitle, setSignerTitle] = useState(props.savedAnswers?.contact_title ?? "");
  const [signerEmail, setSignerEmail] = useState(props.contactEmail);
  const [consent, setConsent] = useState(false);
  const [method, setMethod] = useState<"drawn" | "typed">("drawn");
  const [drawn, setDrawn] = useState<string | null>(null);
  const [typedName, setTypedName] = useState("");
  const [signed, setSigned] = useState(false);
  const [signErrors, setSignErrors] = useState<Record<string, string>>({});

  const [pending, startTransition] = useTransition();

  function validateForm(): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const f of allFields) {
      const value = (answers[f.key] ?? "").trim();
      if (!value) {
        errors[f.key] = "This field is required. Type None or N/A if it does not apply.";
      } else if (f.maxLength && value.length > f.maxLength) {
        errors[f.key] = `Please keep this under ${f.maxLength} characters.`;
      } else if (f.type === "email" && !isEmail(value)) {
        errors[f.key] = "Enter a valid email address.";
      } else if (f.type === "number" && !/^\d{1,4}$/.test(value)) {
        errors[f.key] = "Enter a whole number.";
      } else if (f.type === "select" && f.options && !f.options.includes(value)) {
        errors[f.key] = "Choose one of the listed options.";
      }
    }
    return errors;
  }

  function saveForm() {
    setFormError(null);
    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setFormError("Please complete the highlighted fields.");
      return;
    }
    startTransition(async () => {
      const result = await saveIntakeAction(token, answers);
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        return;
      }
      setSignerTitle((t) => t || (answers.contact_title ?? ""));
      setStep(3);
    });
  }

  function submitSignature() {
    setFormError(null);
    const errors: Record<string, string> = {};
    if (signerName.trim().length < 2) errors.signerName = "Enter the printed name of the signer.";
    if (signerTitle.trim().length < 2) errors.signerTitle = "Enter the signer's title.";
    if (!isEmail(signerEmail.trim())) errors.signerEmail = "Enter a valid email address for the signer.";
    if (method === "drawn" && !drawn) errors.signature = "Draw your signature in the box.";
    if (method === "typed" && typedName.trim().length < 2) errors.typedName = "Type your signature.";
    if (!consent) errors.consent = "Check the box to agree to sign electronically.";
    setSignErrors(errors);
    if (Object.keys(errors).length > 0) {
      setFormError("Please fix the highlighted items before signing.");
      return;
    }
    startTransition(async () => {
      const result = await submitSignatureAction(token, {
        signerName: signerName.trim(),
        signerTitle: signerTitle.trim(),
        signerEmail: signerEmail.trim(),
        consent,
        method,
        drawnPngDataUrl: method === "drawn" ? (drawn ?? undefined) : undefined,
        typedName: method === "typed" ? typedName.trim() : undefined,
      });
      if (!result.ok) {
        setSignErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        return;
      }
      setSigned(true);
    });
  }

  if (signed) {
    return (
      <section className="space-y-4 rounded-lg border border-emerald-300 bg-emerald-50 p-6">
        <h1 className="text-xl font-semibold text-emerald-950">Thank you. Your signature was received.</h1>
        <p className="text-sm text-emerald-950">
          BuildPro Recruiters will countersign the agreement for {companyName} and send you the executed copy. No
          further action is needed from you.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2 text-sm font-medium text-slate-600" aria-label="Progress">
        {[
          [1, "Read the agreement"],
          [2, "Complete the form"],
          [3, "Sign"],
        ].map(([n, label]) => (
          <li
            key={n as number}
            className={`rounded-full px-3 py-1 ${step === n ? "bg-sky-900 text-white" : "bg-slate-200 text-slate-700"}`}
            aria-current={step === n ? "step" : undefined}
          >
            {n}. {label}
          </li>
        ))}
      </ol>

      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          {step === 1 ? agreementTitle : step === 2 ? "Client Search Information Form" : "Sign the packet"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">For {companyName}</p>
      </div>

      {formError ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {formError}
        </div>
      ) : null}

      {step === 1 ? (
        <section className="space-y-5">
          <div className="max-h-[60vh] space-y-4 overflow-y-auto rounded-md border border-slate-300 bg-white p-5 text-[15px] leading-relaxed text-slate-900">
            {agreementParagraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="rounded-md bg-sky-800 px-5 py-3 text-base font-semibold text-white hover:bg-sky-900"
          >
            I have read the agreement. Continue
          </button>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-8">
          {sections.map((section) => (
            <fieldset key={section.title} className="space-y-4">
              <legend className="mb-2 border-b border-slate-300 pb-1 text-sm font-semibold uppercase tracking-wide text-sky-900">
                {section.title}
              </legend>
              {section.fields.map((f) => {
                const id = `answer-${f.key}`;
                const error = fieldErrors[f.key];
                const common = {
                  id,
                  name: f.key,
                  required: true,
                  maxLength: f.maxLength,
                  "aria-invalid": error ? true : undefined,
                  "aria-describedby": error ? `${id}-error` : undefined,
                  className: inputClass,
                  value: answers[f.key] ?? "",
                  onChange: (
                    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
                  ) => setAnswers((a) => ({ ...a, [f.key]: e.target.value })),
                };
                return (
                  <div key={f.key}>
                    <label htmlFor={id} className="block text-sm font-medium text-slate-800">
                      {f.label} <span className="text-red-600">*</span>
                    </label>
                    {f.type === "textarea" ? (
                      <textarea {...common} rows={4} />
                    ) : f.type === "select" ? (
                      <select {...common}>
                        <option value="">Choose one</option>
                        {f.options?.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input {...common} type={f.type === "number" ? "text" : f.type} inputMode={f.type === "number" ? "numeric" : undefined} />
                    )}
                    {error ? (
                      <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
                        {error}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </fieldset>
          ))}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-100"
            >
              Back
            </button>
            <button
              type="button"
              onClick={saveForm}
              disabled={pending}
              className="rounded-md bg-sky-800 px-5 py-3 text-base font-semibold text-white hover:bg-sky-900 disabled:opacity-60"
            >
              {pending ? "Saving..." : "Save and continue"}
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-6">
          <div className="space-y-4 rounded-md border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">Signer</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Labeled id="signer-name" label="Printed name" error={signErrors.signerName}>
                <input
                  id="signer-name"
                  className={inputClass}
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  autoComplete="name"
                  aria-invalid={signErrors.signerName ? true : undefined}
                />
              </Labeled>
              <Labeled id="signer-title" label="Title" error={signErrors.signerTitle}>
                <input
                  id="signer-title"
                  className={inputClass}
                  value={signerTitle}
                  onChange={(e) => setSignerTitle(e.target.value)}
                  autoComplete="organization-title"
                  aria-invalid={signErrors.signerTitle ? true : undefined}
                />
              </Labeled>
              <div className="sm:col-span-2">
                <Labeled id="signer-email" label="Email" error={signErrors.signerEmail}>
                  <input
                    id="signer-email"
                    type="email"
                    className={inputClass}
                    value={signerEmail}
                    onChange={(e) => setSignerEmail(e.target.value)}
                    autoComplete="email"
                    aria-invalid={signErrors.signerEmail ? true : undefined}
                  />
                </Labeled>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-md border border-slate-200 bg-white p-5">
            <div className="flex gap-2" role="tablist" aria-label="Signature method">
              {(["drawn", "typed"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={method === m}
                  onClick={() => setMethod(m)}
                  className={`rounded-md px-4 py-2 text-sm font-medium ${
                    method === m ? "bg-sky-900 text-white" : "border border-slate-300 text-slate-700"
                  }`}
                >
                  {m === "drawn" ? "Draw signature" : "Type signature"}
                </button>
              ))}
            </div>

            {method === "drawn" ? (
              <div>
                <SignaturePad onChange={setDrawn} />
                {signErrors.signature ? <p className="mt-1 text-sm text-red-700">{signErrors.signature}</p> : null}
              </div>
            ) : (
              <div className="space-y-3">
                <Labeled id="typed-name" label="Type your full name as your signature" error={signErrors.typedName}>
                  <input
                    id="typed-name"
                    className={inputClass}
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    aria-invalid={signErrors.typedName ? true : undefined}
                  />
                </Labeled>
                <p className="rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-center font-serif text-3xl italic text-slate-900">
                  {typedName.trim() || "Your signature"}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-md border border-slate-200 bg-white p-5">
            <label className="flex items-start gap-3 text-sm text-slate-900">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-400"
                aria-invalid={signErrors.consent ? true : undefined}
              />
              <span>
                I agree to sign this agreement electronically, and to receive the executed copy electronically.
              </span>
            </label>
            {signErrors.consent ? <p className="text-sm text-red-700">{signErrors.consent}</p> : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-100"
            >
              Back to the form
            </button>
            <button
              type="button"
              onClick={submitSignature}
              disabled={pending}
              className="rounded-md bg-emerald-700 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {pending ? "Submitting..." : "Sign and submit"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Labeled({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
