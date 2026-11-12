"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/owner";
import { writeAudit } from "@/lib/audit";
import { readStrings, type FormState } from "@/lib/form-state";
import {
  COMPANY_FIELD_NAMES,
  CONTACT_FIELD_NAMES,
  isUuid,
  validateCompanyInput,
  validateContactInput,
} from "@/lib/records";

const orNull = (value: string) => (value ? value : null);

function companyColumns(values: Record<string, string>) {
  return {
    name: values.name,
    status: values.status || "prospect",
    industry: orNull(values.industry),
    phone: orNull(values.phone),
    website: orNull(values.website),
    hq_city: orNull(values.hq_city),
    hq_state: orNull(values.hq_state),
    source: orNull(values.source),
    notes: orNull(values.notes),
  };
}

export async function createCompanyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const values = readStrings(formData, COMPANY_FIELD_NAMES);
  const fieldErrors = validateCompanyInput(values);
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix the highlighted fields.", fieldErrors, values };
  }

  const { data, error } = await owner.supabase
    .from("companies")
    .insert({
      ...companyColumns(values),
      created_by: owner.profile.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { error: `The company could not be saved. ${error?.message ?? ""}`.trim(), values };
  }

  await writeAudit(owner.supabase, {
    actor: owner.actor,
    action: "company_created",
    companyId: data.id,
    detail: { name: values.name },
  });
  revalidatePath("/companies");
  redirect(`/companies/${data.id}`);
}

export async function updateCompanyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { error: "That company was not found." };

  const values = readStrings(formData, COMPANY_FIELD_NAMES);
  const fieldErrors = validateCompanyInput(values);
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix the highlighted fields.", fieldErrors, values };
  }

  const { data, error } = await owner.supabase
    .from("companies")
    .update(companyColumns(values))
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "The company could not be saved. Refresh and try again.", values };

  await writeAudit(owner.supabase, {
    actor: owner.actor,
    action: "company_updated",
    companyId: id,
    detail: { fields: COMPANY_FIELD_NAMES },
  });
  revalidatePath(`/companies/${id}`);
  redirect(`/companies/${id}`);
}

export async function createContactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const companyId = String(formData.get("company_id") ?? "");
  if (!isUuid(companyId)) return { error: "That company was not found." };

  const values = readStrings(formData, CONTACT_FIELD_NAMES);
  const fieldErrors = validateContactInput(values);
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix the highlighted fields.", fieldErrors, values };
  }

  const { data, error } = await owner.supabase
    .from("contacts")
    .insert({
      company_id: companyId,
      name: values.name,
      title: orNull(values.title),
      email: orNull(values.email),
      phone: orNull(values.phone),
      role_note: orNull(values.role_note),
    })
    .select("id")
    .single();
  if (error || !data) {
    return { error: `The contact could not be saved. ${error?.message ?? ""}`.trim(), values };
  }

  await writeAudit(owner.supabase, {
    actor: owner.actor,
    action: "contact_created",
    companyId,
    detail: { contact_id: data.id, name: values.name },
  });
  revalidatePath(`/companies/${companyId}`);
  redirect(`/companies/${companyId}`);
}

export async function updateContactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const companyId = String(formData.get("company_id") ?? "");
  const contactId = String(formData.get("contact_id") ?? "");
  if (!isUuid(companyId) || !isUuid(contactId)) return { error: "That contact was not found." };

  const values = readStrings(formData, CONTACT_FIELD_NAMES);
  const fieldErrors = validateContactInput(values);
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix the highlighted fields.", fieldErrors, values };
  }

  const { data, error } = await owner.supabase
    .from("contacts")
    .update({
      name: values.name,
      title: orNull(values.title),
      email: orNull(values.email),
      phone: orNull(values.phone),
      role_note: orNull(values.role_note),
    })
    .eq("id", contactId)
    .eq("company_id", companyId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "The contact could not be saved. Refresh and try again.", values };

  await writeAudit(owner.supabase, {
    actor: owner.actor,
    action: "contact_updated",
    companyId,
    detail: { contact_id: contactId },
  });
  revalidatePath(`/companies/${companyId}`);
  redirect(`/companies/${companyId}`);
}
