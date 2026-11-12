import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  addDaysToIsoDate,
  centralToday,
  COMPANY_STATUSES,
  DEAL_STAGES,
  formatIsoDate,
  formatUsd,
  isIsoDate,
  parseMoney,
  sumValues,
  taskBucket,
  validateDealInput,
  validateNoteBody,
  validateTaskInput,
} from "@/lib/crm";
import { validateCompanyInput } from "@/lib/records";

const MIGRATION_2 = readFileSync(
  fileURLToPath(new URL("../supabase/migrations/0002_milestone2_crm_core.sql", import.meta.url)),
  "utf8",
);
const COMPANY = "11111111-1111-4111-8111-111111111111";

describe("lists match the database", () => {
  it("every deal stage and company status appears in the 0002 check constraints", () => {
    for (const s of DEAL_STAGES) expect(MIGRATION_2).toContain(`'${s.value}'`);
    for (const s of COMPANY_STATUSES) expect(MIGRATION_2).toContain(`'${s.value}'`);
  });
});

describe("dates", () => {
  it("uses the Central Time calendar day", () => {
    // 03:00 UTC on Jan 2 is still Jan 1 in Chicago.
    expect(centralToday(new Date("2026-01-02T03:00:00Z"))).toBe("2026-01-01");
    expect(centralToday(new Date("2026-07-02T12:00:00Z"))).toBe("2026-07-02");
  });

  it("adds days across month and year ends", () => {
    expect(addDaysToIsoDate("2026-12-28", 7)).toBe("2027-01-04");
    expect(addDaysToIsoDate("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("validates and formats plain dates without shifting them", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("02/03/2026")).toBe(false);
    expect(formatIsoDate("2026-11-12")).toBe("Nov 12, 2026");
  });

  it("buckets tasks by due date", () => {
    const today = "2026-11-12";
    expect(taskBucket({ status: "open", due_date: "2026-11-11" }, today)).toBe("overdue");
    expect(taskBucket({ status: "open", due_date: today }, today)).toBe("today");
    expect(taskBucket({ status: "open", due_date: "2026-11-19" }, today)).toBe("this week");
    expect(taskBucket({ status: "open", due_date: "2026-11-20" }, today)).toBe("later");
    expect(taskBucket({ status: "open", due_date: null }, today)).toBe("no date");
    expect(taskBucket({ status: "done", due_date: "2026-01-01" }, today)).toBe("done");
  });
});

describe("money", () => {
  it("parses common amount formats and rejects junk", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("$45,000")).toBe(45000);
    expect(parseMoney("1250.50")).toBe(1250.5);
    expect(parseMoney("12k")).toBeNaN();
    expect(parseMoney("-5")).toBeNaN();
  });

  it("formats and sums", () => {
    expect(formatUsd(25000)).toBe("$25,000");
    expect(formatUsd(null)).toBe("");
    expect(sumValues([{ estimated_value: 1000 }, { estimated_value: "2500.5" }, { estimated_value: null }])).toBe(3500.5);
  });
});

describe("validation", () => {
  it("accepts a minimal deal and fills defaults", () => {
    const result = validateDealInput({ name: "PM search", company_id: COMPANY });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ stage: "new lead", positions_count: 1, contact_id: null, estimated_value: null });
    }
  });

  it("reports each bad deal field", () => {
    const result = validateDealInput({
      name: "",
      company_id: "nope",
      stage: "maybe",
      positions_count: "0",
      estimated_value: "lots",
      fee_percent: "120",
      expected_close_date: "2026-13-01",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(
        ["company_id", "estimated_value", "expected_close_date", "fee_percent", "name", "positions_count", "stage"].sort(),
      );
    }
  });

  it("validates tasks and notes", () => {
    expect(validateTaskInput({ title: "Call Pat", priority: "high", due_date: "2026-11-20" }).ok).toBe(true);
    const bad = validateTaskInput({ title: "", priority: "urgent", due_date: "soon" });
    expect(bad.ok).toBe(false);
    expect(validateNoteBody("   ")).not.toBeNull();
    expect(validateNoteBody("Met with Pat")).toBeNull();
  });

  it("rejects an unknown company status", () => {
    expect(validateCompanyInput({ name: "Acme", status: "friend" }).status).toBeDefined();
    expect(validateCompanyInput({ name: "Acme", status: "active client" }).status).toBeUndefined();
  });
});
