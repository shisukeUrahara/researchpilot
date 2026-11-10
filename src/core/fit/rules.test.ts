import { expect, test } from "vitest";
import { loadBrief } from "../domain/criteria";
import type { Brief } from "../domain/schemas";
import { currentGold, loadGold, type GoldRow } from "../gold/gold";
import { fitVerdicts, type CellLookup } from "./rules";

const dir = process.cwd();
const gold = loadGold(dir);
const cur = currentGold(gold);
const fromGold: CellLookup = (cell) => cur.get(cell);
const brief = loadBrief(dir, "three-minute");
const v = (b: Brief, get = fromGold) => Object.fromEntries(fitVerdicts(b, get).map((x) => [x.provider, x]));
const withWorkload = (over: Partial<Brief["workload"]>, plans?: Partial<Brief["plans"]>): Brief => ({
  ...brief,
  workload: { ...brief.workload, ...over },
  plans: { ...brief.plans, ...plans },
});

test("three minutes, 256 MB: Cloudflare does not fit (128 MB per isolate); Vercel and Lambda fit", () => {
  const r = v(brief);
  expect(r.cloudflare.verdict).toBe("does_not_fit");
  expect(r.cloudflare.reasons).toContain("memory: need 256 mb, limit 128 mb");
  expect(r.vercel.verdict).toBe("fits");
  expect(r.aws.verdict).toBe("fits");
});

test("128 MB is the boundary: at 128 MB Cloudflare fits, at 129 MB it does not", () => {
  expect(v(withWorkload({ memory_mb: 128 })).cloudflare.verdict).toBe("fits");
  expect(v(withWorkload({ memory_mb: 129 })).cloudflare.verdict).toBe("does_not_fit");
});

test("CPU time and wall-clock time are separate: a 40-minute I/O job fits Cloudflare Paid, a CPU-heavy one does not", () => {
  expect(v(withWorkload({ duration_s: 2400, memory_mb: 64, cpu_ms: 20_000 })).cloudflare.verdict).toBe("fits");
  expect(v(withWorkload({ duration_s: 2400, memory_mb: 64, cpu_ms: 400_000 })).cloudflare.verdict).toBe("does_not_fit");
});

test("12 minutes: Vercel fits only on Pro (800 s), Hobby is out (300 s) → fits_on pro, plan-dependent", () => {
  const r = v(withWorkload({ duration_s: 720 }));
  expect(r.vercel).toMatchObject({ verdict: "fits_on", plan: "pro", planDependent: true });
  expect(r.aws.verdict).toBe("fits");
});

test("20 minutes: Vercel Pro needs the extended beta (1800 s); Lambda's 5,400 s is async-only, so it does not fit", () => {
  const r = v(withWorkload({ duration_s: 1200 }));
  expect(r.vercel.verdict).toBe("fits_on");
  expect(r.vercel.reasons.join(" ")).toMatch(/extended duration.*beta/);
  expect(r.aws.verdict).toBe("does_not_fit");
});

test("with the stale 2025 Vercel page, the 3-minute job would not fit Hobby (60 s)", () => {
  const stale = new Map<string, GoldRow>(cur);
  for (const r of gold.filter((x) => !x.current)) stale.set(r.key, r);
  expect(v(brief, (c) => stale.get(c)).vercel).toMatchObject({ verdict: "fits_on", plan: "pro" });
});

test("an essential unknown gives unknown, not a guess", () => {
  const missing: CellLookup = (c) => (c.startsWith("C05:aws") ? undefined : fromGold(c));
  expect(v(brief, missing).aws.verdict).toBe("unknown");
});

test("streaming a response bigger than Lambda's 200 MB streamed limit does not fit", () => {
  expect(v(withWorkload({ streamed_response_mb: 300 })).aws.verdict).toBe("does_not_fit");
  expect(v(withWorkload({ streamed_response_mb: 300 })).vercel.verdict).toBe("fits");
});
