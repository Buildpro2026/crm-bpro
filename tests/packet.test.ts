import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildSigningPacket, computeContentSha256, type PacketInput } from "@/lib/documents/packet";
import { AGREEMENT_PARAGRAPHS, TEMPLATE_VERSION } from "@/lib/agreement";
import { INTAKE_FIELDS, INTAKE_FORM_VERSION } from "@/lib/intake-form";
import { pdfSafe, wrapText } from "@/lib/documents/text";
import { sha256Hex } from "@/lib/crypto";

// A 1x1 transparent PNG, enough to exercise the drawn-signature path.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const TEMPLATE_SHA = sha256Hex("test-template-text");
const SIGNED_AT = new Date("2026-11-11T20:30:00Z"); // 2:30 PM Central, standard time
const GENERATED_AT = new Date("2026-11-11T20:31:00Z");

function answers(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of INTAKE_FIELDS) out[field.key] = `Answer for ${field.key}`;
  out.company_name = "Dummy Test Company";
  out.number_of_openings = "3";
  out.work_arrangement = "Hybrid";
  return out;
}

function baseInput(overrides: Partial<PacketInput> = {}): PacketInput {
  return {
    variant: "client_signed",
    requestId: "44444444-4444-4444-8444-444444444444",
    companyName: "Dummy Test Company",
    templateVersion: TEMPLATE_VERSION,
    templateSha256: TEMPLATE_SHA,
    intakeFormVersion: INTAKE_FORM_VERSION,
    answers: answers(),
    signer: {
      name: "Dana Dummy",
      title: "Director of Operations",
      email: "dana.dummy@example.com",
      signedAt: SIGNED_AT,
      method: "drawn",
      signature: { kind: "drawn", png: new Uint8Array(PNG_1X1) },
      ipAddress: "203.0.113.7",
      userAgent: "TestAgent/1.0",
    },
    countersign: null,
    clientSignedSha256: null,
    generatedAt: GENERATED_AT,
    ...overrides,
  };
}

// Text extraction from the PDF itself, so these tests check what a reader
// would see, not what the code intended to draw.
async function extractText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const doc = await getDocument({
    data: bytes.slice(),
    verbosity: 0,
    useSystemFonts: false,
    disableFontFace: true,
  }).promise;
  let text = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
    }
    text += "\n";
  }
  return { text, pages: doc.numPages };
}

// Whitespace is insignificant for matching: wrapping moves words between lines.
const squash = (s: string) => s.replace(/\s+/g, "");

describe("client-signed packet", () => {
  it("is a PDF whose stored hash is the SHA-256 of its bytes", async () => {
    const { bytes } = await buildSigningPacket(baseInput());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(sha256Hex(bytes)).toMatch(/^[0-9a-f]{64}$/);
    // Deterministic inputs give a deterministic content fingerprint.
    const again = await buildSigningPacket(baseInput());
    expect(again.contentSha256).toBe((await buildSigningPacket(baseInput())).contentSha256);
  });

  it("contains the agreement text verbatim", async () => {
    const { bytes } = await buildSigningPacket(baseInput());
    const { text } = await extractText(bytes);
    const flat = squash(text);
    for (const paragraph of AGREEMENT_PARAGRAPHS) {
      expect(flat).toContain(squash(pdfSafe(paragraph)));
    }
  });

  it("contains every completed form answer", async () => {
    const input = baseInput();
    const { bytes } = await buildSigningPacket(input);
    const { text } = await extractText(bytes);
    const flat = squash(text);
    for (const field of INTAKE_FIELDS) {
      expect(flat, field.label).toContain(squash(input.answers[field.key]));
      expect(flat, field.label).toContain(squash(field.label));
    }
  });

  it("records the signer, the Central Time signing moment, IP and user agent", async () => {
    const { bytes } = await buildSigningPacket(baseInput());
    const { text } = await extractText(bytes);
    const flat = squash(text);
    expect(flat).toContain(squash("Dana Dummy"));
    expect(flat).toContain(squash("Director of Operations"));
    expect(flat).toContain("dana.dummy@example.com");
    // 20:30 UTC on Nov 11, 2026 is 2:30 PM Central Standard Time.
    expect(flat).toContain(squash("2:30:00 PM CST"));
    expect(flat).toContain("203.0.113.7");
    expect(flat).toContain("TestAgent/1.0");
  });

  it("shows the BuildPro countersignature as pending, and the drawn signature image", async () => {
    const { bytes } = await buildSigningPacket(baseInput());
    const { text, pages } = await extractText(bytes);
    expect(squash(text)).toContain("Pendingcountersignature");
    expect(squash(text)).not.toContain(squash("/s/ Lee Chandler"));
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(Buffer.from(bytes).includes(Buffer.from("/Subtype /Image"))).toBe(true);
  });

  it("never prints a BuildPro email address", async () => {
    const { bytes } = await buildSigningPacket(baseInput());
    const { text } = await extractText(bytes);
    expect(text).not.toMatch(/@buildprorecruiters/i);
    expect(text).toContain("214-238-5145");
    expect(text).toContain("buildprorecruiters.com");
  });

  it("supports a typed signature with no image", async () => {
    const input = baseInput({
      signer: {
        ...baseInput().signer,
        method: "typed",
        signature: { kind: "typed", text: "Dana Dummy" },
      },
    });
    const { bytes } = await buildSigningPacket(input);
    const { text } = await extractText(bytes);
    expect(squash(text)).toContain("Typed name adopted as signature".replace(/\s+/g, ""));
  });
});

describe("executed packet", () => {
  it("carries Lee's countersignature, its Central Time, and the client-signed copy hash", async () => {
    const clientSignedSha = sha256Hex("earlier client-signed bytes");
    const { bytes, contentSha256 } = await buildSigningPacket(
      baseInput({
        variant: "executed",
        countersign: {
          name: "Lee Chandler",
          title: "Owner",
          signedAt: new Date("2026-11-12T15:00:00Z"), // 9:00 AM Central
        },
        clientSignedSha256: clientSignedSha,
        generatedAt: new Date("2026-11-12T15:00:00Z"),
      }),
    );
    const { text } = await extractText(bytes);
    const flat = squash(text);
    expect(flat).toContain(squash("/s/ Lee Chandler"));
    expect(flat).toContain(squash("Countersigned by Lee Chandler, Owner"));
    expect(flat).toContain(squash("9:00:00 AM CST"));
    expect(flat).toContain(clientSignedSha);
    expect(flat).toContain(contentSha256);
    expect(flat).not.toContain("Pendingcountersignature");
  });

  it("keeps the same content fingerprint as the client-signed copy", () => {
    const signer = baseInput().signer;
    const forClient = computeContentSha256({
      requestId: "44444444-4444-4444-8444-444444444444",
      templateSha256: TEMPLATE_SHA,
      intakeFormVersion: INTAKE_FORM_VERSION,
      answers: answers(),
      signer,
    });
    const forExecuted = computeContentSha256({
      requestId: "44444444-4444-4444-8444-444444444444",
      templateSha256: TEMPLATE_SHA,
      intakeFormVersion: INTAKE_FORM_VERSION,
      answers: answers(),
      signer: { ...signer },
    });
    expect(forExecuted).toBe(forClient);
  });

  it("changes the content fingerprint when any answer changes", () => {
    const signer = baseInput().signer;
    const changed = answers();
    changed.base_salary_range = "$90,000 to $110,000";
    const original = computeContentSha256({
      requestId: "r",
      templateSha256: TEMPLATE_SHA,
      intakeFormVersion: INTAKE_FORM_VERSION,
      answers: answers(),
      signer,
    });
    const edited = computeContentSha256({
      requestId: "r",
      templateSha256: TEMPLATE_SHA,
      intakeFormVersion: INTAKE_FORM_VERSION,
      answers: changed,
      signer,
    });
    expect(edited).not.toBe(original);
  });
});

describe("text helpers", () => {
  it("folds smart punctuation and drops characters WinAnsi cannot encode", () => {
    expect(pdfSafe("Lee’s “quoted” — dash…")).toBe(`Lee's "quoted" - dash...`);
    expect(pdfSafe("Café ✓")).toBe("Cafe ?");
  });

  it("wraps words to the width and breaks overlong words", () => {
    const width = (s: string) => s.length * 5;
    const lines = wrapText("one two three four five six", 40, width);
    expect(lines.every((l) => l.length * 5 <= 40)).toBe(true);
    expect(lines.join(" ")).toBe("one two three four five six");
    const broken = wrapText("abcdefghijklmnop", 40, width);
    expect(broken.length).toBeGreaterThan(1);
    expect(broken.join("")).toBe("abcdefghijklmnop");
  });
});
