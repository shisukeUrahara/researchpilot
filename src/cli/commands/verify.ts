import { mkdirSync } from "node:fs";
import path from "node:path";
import { readRaw } from "@/core/sources/fetch";
import { loadManifest } from "@/core/sources/manifest";
import { selectPassages, splitPassages, writePassageFile } from "@/core/sources/passages";
import { verifySources } from "@/core/sources/verify";
import type { Command } from "../deps";
import { EXIT } from "../exit";

/** Cuts the raw pages in cache/raw/ into the committed passage files. */
export const buildPassages: Command = async (_argv, deps) => {
  const m = loadManifest(deps.dataDir);
  mkdirSync(path.join(deps.dataDir, "fixtures", "sources", "passages"), { recursive: true });
  for (const s of m.sources) {
    const raw = readRaw(deps.dataDir, s.id);
    if (raw === null) {
      deps.err(`${s.id}: no raw page in cache/raw/. Run pnpm rp fetch-sources first.`);
      return EXIT.CHECK_FAILED;
    }
    const all = splitPassages(s, raw);
    const kept = selectPassages(all);
    writePassageFile(deps.dataDir, s.id, kept);
    deps.out(`${s.id.padEnd(16)} ${String(kept.length).padStart(3)} of ${all.length} passages kept`);
  }
  return EXIT.OK;
};

/** Checks manifest, passage files and (when present) the raw pages. Exit 1 on any problem. */
export const verify: Command = async (_argv, deps) => {
  const { issues, checkedRaw, passages } = verifySources(loadManifest(deps.dataDir), deps.dataDir);
  for (const i of issues) deps.err(`${i.source_id} ${i.passage_id ?? ""} ${i.problem}: ${i.detail}`);
  deps.out(`${passages} passages; raw pages checked: ${checkedRaw}${checkedRaw === 0 ? " (cache/raw/ not present, sha checks only)" : ""}`);
  if (issues.length > 0) return EXIT.CHECK_FAILED;
  deps.out("sources ok");
  return EXIT.OK;
};
