import { readFileSync } from "node:fs";
import { z } from "zod";
import { splitSpec } from "../llm/config";

export const Pricing = z.object({
  source_url: z.string().url(),
  retrieved_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().optional(),
  models: z.record(z.string(), z.object({ input_per_1m: z.number().nonnegative(), output_per_1m: z.number().nonnegative() })),
});
export type Pricing = z.infer<typeof Pricing>;

export const loadPricing = (file: string): Pricing => Pricing.parse(JSON.parse(readFileSync(file, "utf8")));

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

/** Rates for a model spec. pricing.json is keyed by model name without the provider prefix. */
export function ratesFor(pricing: Pricing, spec: string) {
  const r = pricing.models[splitSpec(spec).model];
  if (!r) throw new Error(`no price for "${spec}" in pricing.json. Add a row before using this model.`);
  return r;
}

/** Real cost from the token counts the provider reported (LangChain usage_metadata). */
export function actualUsd(pricing: Pricing, spec: string, usage: Usage): number {
  const r = ratesFor(pricing, spec);
  return (usage.input_tokens * r.input_per_1m + usage.output_tokens * r.output_per_1m) / 1e6;
}

/** Worst-case cost of one call before it is made: input guessed as characters / 4, full output budget. */
export function worstCaseUsd(pricing: Pricing, spec: string, inputChars: number, maxTokens: number): number {
  const r = ratesFor(pricing, spec);
  return ((inputChars / 4) * r.input_per_1m + maxTokens * r.output_per_1m) / 1e6;
}
