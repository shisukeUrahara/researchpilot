import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Brief, CRITERIA, CriterionId } from "./schemas";

export const Criterion = z.object({
  id: CriterionId,
  name: z.string(),
  question: z.string(),
  unit: z.enum(["s", "ms", "mb", "count"]).nullable(),
  /** False for C11 (derived by fit rules) and C12 (never in the corpus). */
  extracted: z.boolean(),
});
export type Criterion = z.infer<typeof Criterion>;

export const CriteriaFile = z
  .object({ version: z.string(), note: z.string(), criteria: z.array(Criterion) })
  .refine((f) => f.criteria.map((c) => c.id).join() === CRITERIA.join(), "criteria must be C01..C12 in order");
export type CriteriaFile = z.infer<typeof CriteriaFile>;

export function loadCriteria(dataDir: string): CriteriaFile {
  return CriteriaFile.parse(JSON.parse(readFileSync(path.join(dataDir, "data", "criteria.v1.json"), "utf8")));
}

export function loadBrief(dataDir: string, id: string): Brief {
  return Brief.parse(JSON.parse(readFileSync(path.join(dataDir, "data", "briefs", `${id}.json`), "utf8")));
}
