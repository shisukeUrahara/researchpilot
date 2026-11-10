import { writeFileSync } from "node:fs";
import { goldPath, loadGold } from "@/core/gold/gold";
import { applyGoldReview, loadGoldReview } from "@/core/gold/review";
import type { Command } from "../deps";
import { EXIT } from "../exit";

/** Applies data/labels/gold_review.jsonl (model review) to the gold file it was written for (each line names its row). */
export const applyGoldReviewCmd: Command = async (_argv, deps) => {
  const { rows, counts } = applyGoldReview(loadGold(deps.dataDir), loadGoldReview(deps.dataDir));
  writeFileSync(goldPath(deps.dataDir), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  deps.out(`gold review applied (reviewer: model): ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}; ${rows.length} rows`);
  return EXIT.OK;
};
