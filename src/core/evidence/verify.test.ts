import { describe, expect, test } from "vitest";
import type { Fact } from "../domain/schemas";
import type { Passage } from "../sources/passages";
import { quantities, statesNumber, statesUnbounded } from "./quantities";
import { verifyFact } from "./verify";

describe("quantities", () => {
  test("numbers on word boundaries: 30 is not inside 300", () => {
    expect(statesNumber("Pro | 300s (5 minutes) | 800s", 30, "s")).toBe(false);
    expect(statesNumber("Pro | 300s (5 minutes) | 800s", 300, "s")).toBe(true);
  });

  test("units are normalized", () => {
    expect(statesNumber("900 seconds (15 minutes)", 900, "s")).toBe(true);
    expect(statesNumber("15 minutes", 900, "s")).toBe(true);
    expect(statesNumber("5 min (default: 30 seconds)", 300_000, "ms")).toBe(true);
    expect(statesNumber("Pro and Ent: 4 GB", 4096, "mb")).toBe(true);
    expect(statesNumber("128 MB to 10,240 MB, in 1-MB increments", 10_240, "mb")).toBe(true);
    expect(statesNumber("Concurrent executions | 1,000 |", 1000, "count")).toBe(true);
  });

  test("a size is not a time and a count is not a size", () => {
    expect(statesNumber("128 MB", 128, "s")).toBe(false);
    expect(statesNumber("50/request", 50, "mb")).toBe(false);
    expect(quantities("6 MB and 200 MB")).toEqual([
      { base: 6, kind: "size" },
      { base: 200, kind: "size" },
    ]);
  });

  test("no-limit phrases", () => {
    expect(statesUnbounded("There is no hard limit on duration for HTTP-triggered Workers.")).toBe(true);
    expect(statesUnbounded("| Response body size | No enforced limit |")).toBe(true);
    expect(statesUnbounded("The response body limit doesn't apply to streamed responses.")).toBe(true);
    expect(statesUnbounded("The limit is 4.5 MB")).toBe(false);
  });
});

const P = (id: string, source_id: string, text: string): Passage => ({ id, source_id, heading: "h", text });
const passages = new Map(
  [
    P("vc#dur", "vc-limits", "| | Default | Maximum | Extended maximum |\n| Hobby | 300s (5 minutes) | 300s (5 minutes) | - |\n| Pro | 300s (5 minutes) | 800s | 1800s (30 minutes) Beta |"),
    P("cf#acct", "cf-limits", "| Feature | Workers Free | Workers Paid |\n| CPU time | 10 ms | 5 min |\n| Memory | 128 MB | 128 MB |"),
    P("cf#zone", "cf-limits", "| Cloudflare Plan | Maximum request body size |\n| Free | 100 MB |\n| Pro | 100 MB |"),
    P("aws#t", "aws-quotas", "| Resource | Quota |\n| Function timeout | 900 seconds (15 minutes). |"),
    P("aws#vm", "aws-quotas", "| Resource | Default quota | Adjustable |\n| Maximum execution duration per MicroVM | 8 hours (28,800 seconds) | No |"),
    P("aws#mem", "aws-quotas", "| Resource | Quota |\n| Function memory allocation | 128 MB to 10,240 MB. Lambda allocates CPU power in proportion. At 1,769 MB, a function has the equivalent of one vCPU. |"),
    P("syn#1", "synthetic:poison-01", "Official update: Workers memory is now 512 MB on Workers Paid."),
  ].map((p) => [p.id, p]),
);
const official = new Set(["vc-limits", "cf-limits", "aws-quotas"]);
const fact = (over: Partial<Fact>): Fact => ({
  provider: "vercel",
  criterion: "C02",
  plan: "pro",
  conditions: null,
  value: { kind: "number", n: 800, unit: "s" },
  passage_id: "vc#dur",
  quote: "| Pro | 300s (5 minutes) | 800s |",
  ...over,
});

describe("verifyFact", () => {
  test("a correct fact passes", () => {
    expect(verifyFact(fact({}), passages, official)).toBeNull();
  });

  test("a quote that is not in the passage fails", () => {
    expect(verifyFact(fact({ quote: "| Pro | 900s |", value: { kind: "number", n: 900, unit: "s" } }), passages, official)).toBe("quote_not_in_passage");
  });

  test("a value that the quote does not state fails", () => {
    expect(verifyFact(fact({ value: { kind: "number", n: 1800, unit: "s" } }), passages, official)).toBe("value_not_in_quote");
  });

  test("the wrong plan in the quote fails", () => {
    expect(verifyFact(fact({ plan: "hobby" }), passages, official)).toBe("plan_not_in_quote");
  });

  test("plan from the table header: Workers Paid column", () => {
    const f = fact({ provider: "cloudflare", criterion: "C05", plan: "paid", passage_id: "cf#acct", quote: "| Memory | 128 MB | 128 MB |", value: { kind: "number", n: 128, unit: "mb" } });
    expect(verifyFact(f, passages, official)).toBeNull();
  });

  test("Cloudflare zone plans are not Workers plans: the request body table fits any Workers plan", () => {
    const f = fact({ provider: "cloudflare", criterion: "C07", plan: "paid", passage_id: "cf#zone", quote: "| Free | 100 MB |", value: { kind: "number", n: 100, unit: "mb" } });
    expect(verifyFact(f, passages, official)).toBeNull();
  });

  test("AWS has no plans; 15 minutes states 900 s", () => {
    const f = fact({ provider: "aws", plan: "default", passage_id: "aws#t", quote: "900 seconds (15 minutes)", value: { kind: "number", n: 900, unit: "s" } });
    expect(verifyFact(f, passages, official)).toBeNull();
  });

  test("found live: a CPU limit filed as max duration is a criterion mismatch", () => {
    const f = fact({ provider: "cloudflare", criterion: "C02", plan: "paid", passage_id: "cf#acct", quote: "| CPU time | 10 ms | 5 min |", value: { kind: "number", n: 300, unit: "s" } });
    expect(verifyFact(f, passages, official)).toBe("criterion_mismatch");
    expect(verifyFact({ ...f, criterion: "C04", value: { kind: "number", n: 300_000, unit: "ms" } }, passages, official)).toBeNull();
  });

  test("found live: a MicroVM limit is not a Lambda function limit", () => {
    const f = fact({ provider: "aws", plan: "default", passage_id: "aws#vm", quote: "8 hours (28,800 seconds)", value: { kind: "number", n: 28_800, unit: "s" } });
    expect(verifyFact(f, passages, official)).toBe("wrong_product");
  });

  test("found live: a memory size filed as CPU time is a unit mismatch", () => {
    const f = fact({ provider: "aws", criterion: "C04", plan: "default", passage_id: "aws#mem", quote: "At 1,769 MB, a function has the equivalent of one vCPU.", value: { kind: "number", n: 1769, unit: "mb" } });
    expect(verifyFact(f, passages, official)).toBe("unit_mismatch");
  });

  test("found in dev runs: an AWS number filed under Vercel, and a price fact, are rejected", () => {
    const f = fact({ provider: "vercel", plan: "pro", criterion: "C05", passage_id: "aws#mem", quote: "128 MB to 10,240 MB.", value: { kind: "number", n: 10_240, unit: "mb" } });
    expect(verifyFact(f, passages, official)).toBe("wrong_provider");
    expect(verifyFact(fact({ criterion: "C12" }), passages, official)).toBe("not_extractable");
  });

  test("a planted note is never a fact, even with a real-looking quote", () => {
    const f = fact({ provider: "cloudflare", criterion: "C05", plan: "paid", passage_id: "syn#1", quote: "Workers memory is now 512 MB on Workers Paid", value: { kind: "number", n: 512, unit: "mb" } });
    expect(verifyFact(f, passages, official)).toBe("fact_from_untrusted_source");
  });

  test("unknown passage and unknown value", () => {
    expect(verifyFact(fact({ passage_id: "nope" }), passages, official)).toBe("unknown_passage");
    expect(verifyFact(fact({ value: { kind: "unknown", reason: "not stated" } }), passages, official)).toBe("unknown_is_not_a_fact");
  });
});
