import type { Fact, PlanName, Provider } from "../domain/schemas";
import type { Passage } from "../sources/passages";
import { statesValue } from "./quantities";

/** How each plan is named on its provider's pages. Cloudflare zone plans ("Free", "Pro") are not Workers plans. */
const PLAN_TOKENS: Record<Provider, Partial<Record<PlanName, RegExp>>> = {
  cloudflare: { free: /workers free|free plan/i, paid: /workers paid|paid plan/i },
  vercel: { hobby: /\bhobby\b/i, pro: /\bpro\b/i, enterprise: /\benterprise\b|\bent\b/i },
  aws: {},
};

export type RejectReason =
  | "unknown_passage"
  | "fact_from_untrusted_source"
  | "quote_not_in_passage"
  | "value_not_in_quote"
  | "plan_not_in_quote"
  | "criterion_mismatch"
  | "unit_mismatch"
  | "wrong_product"
  | "unknown_is_not_a_fact";

/** Words that name each kind of limit. A quote's line must not name a different kind and not its own. */
const KIND: Record<string, RegExp> = {
  duration: /duration|timeout|wall time|execution time|maxduration|run for|run up to/i,
  cpu: /\bcpu\b/i,
  memory: /memory|\bram\b/i,
  body: /request body|payload|body size|upload/i,
  response: /response|stream/i,
  concurrency: /concurren|scal/i,
  subrequest: /subrequest|outbound|connection/i,
};
const KIND_OF: Record<string, string> = { C01: "duration", C02: "duration", C03: "duration", C04: "cpu", C05: "memory", C06: "memory", C07: "body", C08: "response", C09: "concurrency", C10: "subrequest" };

/**
 * Is it the right kind of limit? Found in the first live run: Cloudflare's "5 min" CPU limit was filed as
 * max duration; number and plan were right, the kind was wrong. Rule: the passage line(s) holding the
 * quote may not name another kind of limit unless they also name this one. Lines that name no kind
 * (a bare table row like "| Pro | 300s | 800s |") pass; the grader still checks values against gold.
 */
function criterionOk(fact: Fact, passage: Passage): boolean {
  const own = KIND_OF[fact.criterion];
  if (!own) return true;
  const text = linesOf(fact, passage);
  if (KIND[own].test(text)) return true;
  return !Object.entries(KIND).some(([k, re]) => k !== own && re.test(text));
}

/** Unit kind each criterion needs: a duration is a time, memory is a size, concurrency is a count. */
const UNIT_KIND: Record<string, "time" | "size" | "count"> = { C01: "time", C02: "time", C03: "time", C04: "time", C05: "size", C06: "size", C07: "size", C08: "size", C09: "count", C10: "count" };
const unitKind = (u: string) => (u === "s" || u === "ms" ? "time" : u === "mb" ? "size" : "count");

/**
 * Other products on the same official pages. Found live: Lambda MicroVM's "8 hours" became Lambda's max
 * duration. Lambda Managed Instances stay in: they are still Lambda functions (with conditions).
 */
const OTHER_PRODUCTS: Record<Provider, RegExp> = {
  aws: /microvm|web function|durable (execution|function|operation)/i,
  cloudflare: /durable object|workflows?\b|cron trigger|queue consumer|alarm/i,
  vercel: /edge runtime|vercel workflows/i,
};

/** The passage line(s) that hold the quote (the quote itself if it spans lines). */
function linesOf(fact: Fact, passage: Passage): string {
  const q = norm(fact.quote);
  const lines = passage.text.split("\n").filter((l) => norm(l).includes(q) || q.includes(norm(l)));
  return lines.length > 0 ? lines.join("\n") : fact.quote;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

const mentionsAnyPlan = (provider: Provider, text: string) => Object.values(PLAN_TOKENS[provider]).some((re) => re!.test(text));

/**
 * Is the plan right? If the quote names any plan of this provider, it must name this one. If the quote
 * names none, the table header row of the passage decides. If the passage names no plan at all, the
 * value is plan-independent and fits every plan.
 * Ceiling: a row that names two plans with two values ("Hobby: 300s. Pro: 800s") passes for both plans;
 * quoting the shortest span is the extractor's job, and the grader still checks values against gold.
 */
function planOk(fact: Fact, passage: Passage): boolean {
  const re = PLAN_TOKENS[fact.provider][fact.plan];
  if (!re) return true; // AWS: no plans
  if (mentionsAnyPlan(fact.provider, fact.quote)) return re.test(fact.quote);
  const first = passage.text.split("\n")[0];
  if (first.includes("|") && mentionsAnyPlan(fact.provider, first)) return re.test(first);
  return !mentionsAnyPlan(fact.provider, passage.text);
}

/**
 * The code check every fact must pass before the agent may use it. No model is involved:
 * 1. the passage exists and comes from an official source in the manifest;
 * 2. the quote is really in the passage;
 * 3. the quote states the value (number on word boundaries, units normalized, or a no-limit phrase);
 * 4. the plan is right (see planOk).
 */
export function verifyFact(fact: Fact, passages: ReadonlyMap<string, Passage>, officialSourceIds: ReadonlySet<string>): RejectReason | null {
  if (fact.value.kind === "unknown") return "unknown_is_not_a_fact";
  const p = passages.get(fact.passage_id);
  if (!p) return "unknown_passage";
  if (!officialSourceIds.has(p.source_id)) return "fact_from_untrusted_source";
  if (!norm(p.text).includes(norm(fact.quote))) return "quote_not_in_passage";
  if (!statesValue(fact.quote, fact.value)) return "value_not_in_quote";
  if (!planOk(fact, p)) return "plan_not_in_quote";
  if (!criterionOk(fact, p)) return "criterion_mismatch";
  if (fact.value.kind === "number" && UNIT_KIND[fact.criterion] && unitKind(fact.value.unit) !== UNIT_KIND[fact.criterion]) return "unit_mismatch";
  if (OTHER_PRODUCTS[fact.provider].test(`${p.heading}\n${linesOf(fact, p)}`)) return "wrong_product";
  return null;
}
