import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * One model role. `spec` is a LangChain "provider:model" string; switching model
 * means editing it in config/models.json (plus a pricing row for a new model).
 */
export const ModelRole = z.object({
  spec: z.string().regex(/^[a-z_-]+:[\w.:-]+$/, 'spec must look like "provider:model"'),
  method: z.enum(["jsonSchema", "functionCalling", "jsonMode"]),
  params: z.object({ temperature: z.number().min(0).max(2), maxTokens: z.number().int().positive() }),
});
export type ModelRole = z.infer<typeof ModelRole>;

export const RoleName = z.enum(["planner", "actor", "extractor", "writer"]);
export type RoleName = z.infer<typeof RoleName>;

export const ModelRoles = z.record(RoleName, ModelRole);
export type ModelRoles = Record<RoleName, ModelRole>;

export function loadModelRoles(dataDir: string): ModelRoles {
  const file = path.join(dataDir, "config", "models.json");
  const parsed = ModelRoles.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`${file}: ${parsed.error.message}`);
  return parsed.data as ModelRoles;
}

/** "openai:gpt-4.1-mini-2025-04-14" -> { provider: "openai", model: "gpt-4.1-mini-2025-04-14" } */
export function splitSpec(spec: string): { provider: string; model: string } {
  const i = spec.indexOf(":");
  return { provider: spec.slice(0, i), model: spec.slice(i + 1) };
}
