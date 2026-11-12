"use server";

import { getRequestContext } from "@/lib/request-context";
import {
  saveIntakeForm,
  submitClientSignature,
  type ActionResult,
  type SignatureSubmission,
} from "@/lib/signing/service";
import type { IntakeAnswers } from "@/lib/intake-form";

// Both actions take the token again and validate it on every call. The
// browser's own checks are a convenience; the server decides.

export type SaveIntakeResult =
  | { ok: true; answers: IntakeAnswers }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function saveIntakeAction(token: string, answers: Record<string, string>): Promise<SaveIntakeResult> {
  const ctx = await getRequestContext();
  const result = await saveIntakeForm(token, answers, ctx);
  if (!result.ok) return { ok: false, error: result.error, fieldErrors: result.fieldErrors };
  return { ok: true, answers: result.answers ?? {} };
}

export async function submitSignatureAction(token: string, submission: SignatureSubmission): Promise<ActionResult> {
  const ctx = await getRequestContext();
  return submitClientSignature(token, submission, ctx);
}
