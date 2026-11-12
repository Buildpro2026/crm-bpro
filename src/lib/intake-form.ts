// Client Search Information Form, version 1. Field labels are the approved
// wording. Do not add a reason-for-opening field, a deal-breakers field, or
// an advertising permission question. They were deliberately removed.

export const INTAKE_FORM_KEY = "client_search_information";
export const INTAKE_FORM_VERSION = "v1";

export type FieldType = "text" | "textarea" | "email" | "tel" | "date" | "number" | "select";

export type IntakeField = {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  maxLength?: number;
};

export type IntakeSection = {
  title: string;
  fields: readonly IntakeField[];
};

export const WORK_ARRANGEMENTS = ["Onsite", "Hybrid", "Remote"] as const;

export const INTAKE_SECTIONS: readonly IntakeSection[] = [
  {
    title: "Company Information",
    fields: [
      { key: "company_name", label: "Company name", type: "text", maxLength: 200 },
      { key: "industry", label: "Industry", type: "text", maxLength: 200 },
      { key: "company_website", label: "Company website", type: "text", maxLength: 300 },
      { key: "hq_city_state", label: "Headquarters city and state", type: "text", maxLength: 200 },
      { key: "contact_name", label: "Contact name", type: "text", maxLength: 200 },
      { key: "contact_title", label: "Contact title", type: "text", maxLength: 200 },
      { key: "contact_email", label: "Contact email", type: "email", maxLength: 320 },
      { key: "contact_phone", label: "Contact phone", type: "tel", maxLength: 40 },
    ],
  },
  {
    title: "The Position",
    fields: [
      { key: "position_title", label: "Position title", type: "text", maxLength: 200 },
      { key: "department", label: "Department", type: "text", maxLength: 200 },
      { key: "reports_to", label: "Reports to, name and title", type: "text", maxLength: 300 },
      { key: "number_of_openings", label: "Number of openings", type: "number", maxLength: 4 },
      { key: "position_location", label: "Position location", type: "text", maxLength: 200 },
      {
        key: "work_arrangement",
        label: "Work arrangement (Onsite, Hybrid, or Remote)",
        type: "select",
        options: WORK_ARRANGEMENTS,
      },
      { key: "travel_requirements", label: "Travel requirements", type: "textarea", maxLength: 2000 },
    ],
  },
  {
    title: "Responsibilities and Requirements",
    fields: [
      {
        key: "primary_responsibilities",
        label: "Primary responsibilities of this role",
        type: "textarea",
        maxLength: 4000,
      },
      { key: "years_experience_required", label: "Years of experience required", type: "text", maxLength: 200 },
      {
        key: "required_skills_systems_software",
        label: "Required skills, systems, and software",
        type: "textarea",
        maxLength: 4000,
      },
      { key: "education_certifications", label: "Education and certifications", type: "textarea", maxLength: 2000 },
      { key: "licenses_required", label: "Licenses required", type: "textarea", maxLength: 2000 },
    ],
  },
  {
    title: "Compensation",
    fields: [
      { key: "base_salary_range", label: "Base salary range", type: "text", maxLength: 200 },
      { key: "bonus_or_commission", label: "Bonus or commission", type: "textarea", maxLength: 2000 },
      { key: "benefits_summary", label: "Benefits summary", type: "textarea", maxLength: 4000 },
      { key: "relocation_assistance", label: "Relocation assistance offered", type: "textarea", maxLength: 2000 },
    ],
  },
  {
    title: "Timeline and Process",
    fields: [
      { key: "target_start_date", label: "Target start date", type: "date" },
      { key: "hiring_decision_maker", label: "Who makes the hiring decision", type: "text", maxLength: 300 },
      {
        key: "interview_process",
        label: "Interview process, who interviews and how many rounds",
        type: "textarea",
        maxLength: 4000,
      },
    ],
  },
  {
    title: "The Ideal Candidate",
    fields: [
      {
        key: "ideal_candidate",
        label: "What makes a candidate a great fit for this role and your company",
        type: "textarea",
        maxLength: 4000,
      },
    ],
  },
];

export const INTAKE_FIELDS: readonly IntakeField[] = INTAKE_SECTIONS.flatMap((s) => s.fields);

export type IntakeAnswers = Record<string, string>;

// Every field is required. A client who has nothing to say types "None" or
// "N/A", so the record shows a deliberate answer and not a blank.
export function validateIntakeAnswers(input: Record<string, unknown>): {
  answers: IntakeAnswers;
  errors: Record<string, string>;
} {
  const answers: IntakeAnswers = {};
  const errors: Record<string, string> = {};

  for (const field of INTAKE_FIELDS) {
    const raw = typeof input[field.key] === "string" ? (input[field.key] as string) : "";
    const value = raw.replace(/\r\n/g, "\n").trim();
    answers[field.key] = value;

    if (!value) {
      errors[field.key] = "This field is required. Type None or N/A if it does not apply.";
      continue;
    }
    if (field.maxLength && value.length > field.maxLength) {
      errors[field.key] = `Please keep this under ${field.maxLength} characters.`;
      continue;
    }
    if (field.type === "email" && !isEmail(value)) {
      errors[field.key] = "Enter a valid email address.";
    }
    if (field.type === "number" && !/^\d{1,4}$/.test(value)) {
      errors[field.key] = "Enter a whole number.";
    }
    if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      errors[field.key] = "Enter a valid date.";
    }
    if (field.type === "select" && field.options && !field.options.includes(value)) {
      errors[field.key] = "Choose one of the listed options.";
    }
  }

  return { answers, errors };
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320;
}
