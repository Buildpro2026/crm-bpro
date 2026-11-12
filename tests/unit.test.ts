import { describe, expect, it } from "vitest";
import { generateAccessToken, hashAccessToken } from "@/lib/crypto";
import { INTAKE_FIELDS, validateIntakeAnswers } from "@/lib/intake-form";
import { effectiveStatus, isOpenForAction, actionLabel } from "@/lib/signing/status";
import { safeNextPath } from "@/lib/safe-redirect";
import { buildSigningEmail } from "@/lib/signing/email-text";
import { validateCompanyInput, validateContactInput, isUuid } from "@/lib/records";
import { formatCentralDateTime, addDays } from "@/lib/time";
import { decodeDrawnSignature } from "@/lib/signing/service";
import { AGREEMENT_PARAGRAPHS, AGREEMENT_TITLE, TEMPLATE_VERSION } from "@/lib/agreement";

function fullAnswers(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of INTAKE_FIELDS) out[f.key] = "Something specific";
  out.contact_email = "buyer@example.com";
  out.target_start_date = "2027-01-15";
  out.number_of_openings = "2";
  out.work_arrangement = "Remote";
  return out;
}

describe("tokens", () => {
  it("generates 32 random bytes encoded as URL-safe base64", () => {
    const token = generateAccessToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(generateAccessToken()).not.toBe(token);
  });

  it("hashes deterministically and never equals the raw token", () => {
    const token = generateAccessToken();
    expect(hashAccessToken(token)).toBe(hashAccessToken(token));
    expect(hashAccessToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAccessToken(token)).not.toContain(token);
  });
});

describe("intake form validation", () => {
  it("accepts a complete form", () => {
    const { errors, answers } = validateIntakeAnswers(fullAnswers());
    expect(errors).toEqual({});
    expect(Object.keys(answers)).toHaveLength(INTAKE_FIELDS.length);
  });

  it("requires every field and trims whitespace", () => {
    const input = fullAnswers();
    input.industry = "   ";
    delete input.position_title;
    const { errors, answers } = validateIntakeAnswers(input);
    expect(errors.industry).toMatch(/required/);
    expect(errors.position_title).toMatch(/required/);
    expect(answers.industry).toBe("");
  });

  it("rejects a bad email, a non-numeric opening count, a bad date, and an unlisted arrangement", () => {
    const { errors } = validateIntakeAnswers({
      ...fullAnswers(),
      contact_email: "not-an-email",
      number_of_openings: "two",
      target_start_date: "next spring",
      work_arrangement: "Anywhere",
    });
    expect(errors.contact_email).toMatch(/valid email/);
    expect(errors.number_of_openings).toMatch(/whole number/);
    expect(errors.target_start_date).toMatch(/valid date/);
    expect(errors.work_arrangement).toMatch(/listed options/);
  });

  it("uses the approved field labels and omits the removed questions", () => {
    const labels = INTAKE_FIELDS.map((f) => f.label.toLowerCase());
    expect(labels).toContain("work arrangement (onsite, hybrid, or remote)");
    expect(labels).toContain("interview process, who interviews and how many rounds");
    expect(labels.join(" ")).not.toMatch(/reason|deal.?breaker|advertis/);
    // 8 company + 7 position + 5 requirements + 4 compensation + 3 timeline + 1 ideal candidate.
    expect(INTAKE_FIELDS).toHaveLength(28);
  });
});

describe("signing status", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();

  it("shows an open request as expired once its expiry has passed", () => {
    expect(effectiveStatus({ status: "created", expires_at: past })).toBe("expired");
    expect(effectiveStatus({ status: "viewed", expires_at: past })).toBe("expired");
    expect(effectiveStatus({ status: "created", expires_at: future })).toBe("created");
  });

  it("does not expire a request the client has already signed", () => {
    expect(effectiveStatus({ status: "client signed", expires_at: past })).toBe("client signed");
    expect(effectiveStatus({ status: "fully executed", expires_at: past })).toBe("fully executed");
  });

  it("only created and viewed requests accept client action", () => {
    expect(isOpenForAction("created")).toBe(true);
    expect(isOpenForAction("viewed")).toBe(true);
    expect(isOpenForAction("client signed")).toBe(false);
    expect(isOpenForAction("revoked")).toBe(false);
  });

  it("labels every audit action", () => {
    expect(actionLabel("client_signed")).toBe("Client signed");
    expect(actionLabel("link_expired")).toBe("Link expired");
    expect(actionLabel("unknown_action")).toBe("unknown_action");
  });
});

describe("redirects after sign-in", () => {
  it("accepts same-site paths only", () => {
    expect(safeNextPath("/companies/123")).toBe("/companies/123");
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
    expect(safeNextPath(undefined)).toBe("/dashboard");
  });
});

describe("client email text", () => {
  const text = buildSigningEmail({
    contactName: "Dana Dummy",
    companyName: "Dummy Test Company",
    link: "https://crm.example/sign/abc",
    expiresAt: "2026-11-25T18:00:00Z",
  });

  it("is addressed to the contact by first name and carries the link", () => {
    expect(text).toMatch(/^Subject: .*Dummy Test Company/);
    expect(text).toContain("Hi Dana,");
    expect(text).toContain("https://crm.example/sign/abc");
    expect(text).toContain("November 25, 2026");
  });

  it("contains no email address", () => {
    expect(text).not.toMatch(/@/);
  });
});

describe("records validation", () => {
  it("requires a company name and a sane website", () => {
    expect(validateCompanyInput({ name: "" }).name).toMatch(/required/);
    expect(validateCompanyInput({ name: "Acme", website: "not a site" }).website).toBeDefined();
    expect(validateCompanyInput({ name: "Acme", website: "acme.com" })).toEqual({});
  });

  it("checks contact email when one is given", () => {
    expect(validateContactInput({ name: "A B", email: "nope" }).email).toBeDefined();
    expect(validateContactInput({ name: "A B", email: "" })).toEqual({});
  });

  it("recognises UUIDs", () => {
    expect(isUuid("44444444-4444-4444-8444-444444444444")).toBe(true);
    expect(isUuid("drop table")).toBe(false);
  });
});

describe("Central Time", () => {
  it("shows standard time in winter and daylight time in summer", () => {
    expect(formatCentralDateTime("2026-11-11T20:30:00Z")).toMatch(/2:30:00 PM CST/);
    expect(formatCentralDateTime("2026-07-01T20:30:00Z")).toMatch(/3:30:00 PM CDT/);
  });

  it("adds whole days", () => {
    const start = new Date("2026-11-11T00:00:00Z");
    expect(addDays(start, 14).toISOString()).toBe("2026-11-25T00:00:00.000Z");
  });
});

describe("drawn signature check", () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  // Real signatures are larger than the 1x1 test image; pad the bytes to the
  // minimum size the server accepts without changing the PNG header.
  const padded = Buffer.concat([png, Buffer.alloc(300)]);

  it("accepts a PNG data URL", () => {
    const bytes = decodeDrawnSignature(`data:image/png;base64,${padded.toString("base64")}`);
    expect(bytes[0]).toBe(0x89);
  });

  it("rejects other image types, non-data URLs, and oversized images", () => {
    expect(() => decodeDrawnSignature(`data:image/jpeg;base64,${padded.toString("base64")}`)).toThrow();
    expect(() => decodeDrawnSignature("")).toThrow();
    const notPng = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(400)]);
    expect(() => decodeDrawnSignature(`data:image/png;base64,${notPng.toString("base64")}`)).toThrow(/not a valid PNG/);
    const huge = Buffer.concat([png, Buffer.alloc(420_000)]);
    expect(() => decodeDrawnSignature(`data:image/png;base64,${huge.toString("base64")}`)).toThrow(/too large/);
  });
});

describe("agreement text", () => {
  it("has the title, the preamble and nine numbered sections", () => {
    expect(AGREEMENT_TITLE).toBe("CLIENT REPRESENTATION AGREEMENT");
    expect(AGREEMENT_PARAGRAPHS).toHaveLength(10);
    expect(AGREEMENT_PARAGRAPHS[1].startsWith("1. Services.")).toBe(true);
    expect(AGREEMENT_PARAGRAPHS[9].startsWith("9. Entire Agreement.")).toBe(true);
    expect(TEMPLATE_VERSION).toBe("v1");
  });
});
