import { parseArgs } from "node:util";
import { fetchSources as run, httpFetcher } from "@/core/sources/fetch";
import { loadManifest, saveManifest } from "@/core/sources/manifest";
import type { Command } from "../deps";
import { EXIT } from "../exit";

/** Downloads the official pages into cache/raw/ and fills or re-checks the manifest. Exit 1 on drift. */
export const fetchSources: Command = async (argv, deps) => {
  const { values } = parseArgs({ args: argv, options: { accept: { type: "boolean", default: false } } });
  const { manifest, reports } = await run(loadManifest(deps.dataDir), deps.dataDir, httpFetcher, deps.now(), values.accept);
  saveManifest(deps.dataDir, manifest);
  for (const r of reports) deps.out(`${r.id.padEnd(16)} ${r.status.padEnd(6)} page date ${r.page_date ?? "none (retrieved date used)"}  sha ${r.new_sha.slice(0, 12)}`);
  const drift = reports.filter((r) => r.status === "drift");
  if (drift.length > 0 && values.accept) {
    deps.out(`accepted new versions of ${drift.map((d) => d.id).join(", ")}; rebuild passages with pnpm rp build-passages`);
    return EXIT.OK;
  }
  if (drift.length > 0) {
    deps.err(`drift in ${drift.map((d) => d.id).join(", ")}: the frozen copy is kept. New text is in cache/raw/<id>.drift.txt. Use --accept to move to it.`);
    return EXIT.CHECK_FAILED;
  }
  deps.out("no drift");
  return EXIT.OK;
};
