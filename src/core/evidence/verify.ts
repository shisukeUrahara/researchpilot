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
  | "unknown_is_not_a_fact";

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
  return null;
}
