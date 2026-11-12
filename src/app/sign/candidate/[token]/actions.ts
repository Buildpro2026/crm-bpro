"use server";

import { getRequestContext } from "@/lib/request-context";
import { submitCandidateAgreement, type SubmitResult } from "@/lib/candidates/agreement-service";
import { CANDIDATE_SIGNING_FIELDS } from "@/lib/candidate-agreement";

// The token is re-validated inside submitCandidateAgreement on every call.
export async function submitCandidateAgreementAction(token: string, formData: FormData): Promise<SubmitResult> {
  const answers: Record<string, string> = {};
  for (const field of CANDIDATE_SIGNING_FIELDS) {
    const v = formData.get(field.key);
    answers[field.key] = typeof v === "string" ? v : "";
  }
  const ctx = await getRequestContext();
  try {
    return await submitCandidateAgreement(
      token,
      {
        answers,
        textOptIn: String(formData.get("text_opt_in") ?? ""),
        signatureName: String(formData.get("signature_name") ?? ""),
        consent: formData.get("consent") === "on",
      },
      ctx,
    );
  } catch (err) {
    console.error(err);
    return { ok: false, error: "Something went wrong saving your signature. Please try again, or call 214-238-5145." };
  }
}
