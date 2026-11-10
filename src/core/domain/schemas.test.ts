import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  Brief,
  cellId,
  Fact,
  MODEL_SCHEMAS,
  parseCell,
  Proposal,
  requiredCells,
  STOP_REASONS,
  StopReason,
  toValue,
  TOOLS,
  Value,
} from "./schemas";

const brief = Brief.parse({
  id: "three-minute",
  question: "Which platform fits a three-minute streaming job?",
  workload: { duration_s: 180, cpu_ms: 20_000, memory_mb: 256, streaming: true, streamed_response_mb: 5, request_body_mb: 1 },
  plans: { cloudflare: ["paid"], vercel: ["hobby", "pro"], aws: ["default"] },
  exclusions: ["C12"],
});

describe("cells", () => {
  test("cell ids round-trip and reject a plan from another provider", () => {
    expect(cellId("C02", "vercel", "pro")).toBe("C02:vercel:pro");
    expect(parseCell("C05:cloudflare:paid")).toEqual({ criterion: "C05", provider: "cloudflare", plan: "paid" });
    expect(() => cellId("C02", "aws", "pro")).toThrow(/does not belong/);
  });

  test("required cells = 11 criteria (C12 excluded) × 4 provider-plan pairs", () => {
    const cells = requiredCells(brief);
    expect(cells).toHaveLength(44);
    expect(cells).toContain("C02:vercel:hobby");
    expect(cells.some((c) => c.startsWith("C12"))).toBe(false);
  });
});

describe("values and facts", () => {
  test("value kinds", () => {
    expect(Value.parse({ kind: "number", n: 900, unit: "s" })).toEqual({ kind: "number", n: 900, unit: "s" });
    expect(Value.parse({ kind: "unbounded" }).kind).toBe("unbounded");
    expect(() => Value.parse({ kind: "unknown", reason: "" })).toThrow();
  });

  test("flat model value converts, mismatched fields give null", () => {
    expect(toValue({ value_kind: "number", n: 128, unit: "mb", unknown_reason: null })).toEqual({ kind: "number", n: 128, unit: "mb" });
    expect(toValue({ value_kind: "number", n: null, unit: "mb", unknown_reason: null })).toBeNull();
    expect(toValue({ value_kind: "unknown", n: null, unit: null, unknown_reason: null })).toBeNull();
    expect(toValue({ value_kind: "unknown", n: null, unit: null, unknown_reason: "not in corpus" })?.kind).toBe("unknown");
  });

  test("fact rejects an unknown provider", () => {
    const ok = { provider: "aws", criterion: "C02", plan: "default", conditions: null, value: { kind: "number", n: 900, unit: "s" }, passage_id: "aws-quotas#timeout", quote: "900 seconds" };
    expect(Fact.parse(ok).provider).toBe("aws");
    expect(() => Fact.parse({ ...ok, provider: "azure" })).toThrow();
  });
});

describe("proposal", () => {
  test("the tool list includes the decoy send_email", () => {
    expect(TOOLS).toContain("send_email");
    expect(Proposal.parse({ tool: "send_email", args_json: "{}", cells: [], reason: "x", done: false }).tool).toBe("send_email");
  });

  test("unknown tool is rejected", () => {
    expect(() => Proposal.parse({ tool: "rm_rf", args_json: "{}", cells: [], reason: "x", done: false })).toThrow();
  });
});

test("stop reasons are the 8 from the plan", () => {
  expect(STOP_REASONS).toHaveLength(8);
  expect(StopReason.safeParse("NO_PROGRESS").success).toBe(true);
});

/** Walk a JSON schema and collect object nodes whose properties are not all required. */
function optionalFields(node: unknown, path = "$"): string[] {
  if (typeof node !== "object" || node === null) return [];
  const n = node as Record<string, unknown>;
  const found: string[] = [];
  if (n.type === "object" && n.properties) {
    const keys = Object.keys(n.properties as object);
    const req = new Set((n.required as string[]) ?? []);
    for (const k of keys) if (!req.has(k)) found.push(`${path}.${k}`);
  }
  for (const [k, v] of Object.entries(n)) found.push(...optionalFields(v, `${path}/${k}`));
  return found;
}

test.each(Object.entries(MODEL_SCHEMAS))("%s fits OpenAI strict mode: every field required", (_name, schema) => {
  expect(optionalFields(z.toJSONSchema(schema as z.ZodType))).toEqual([]);
});
