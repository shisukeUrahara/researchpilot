import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Provider, Value } from "../domain/schemas";
import type { Passage } from "../sources/passages";

const Base = z.object({
  /** Every file says what it is, so nobody mistakes it for an official page. */
  _note: z.string().startsWith("SYNTHETIC"),
  id: z.string(),
  source_id: z.string().startsWith("synthetic:"),
  title: z.string(),
  /** What the agent sees as a search result. Written to look like a real note on purpose. */
  text: z.string().min(10),
});

export const SyntheticNote = z.discriminatedUnion("kind", [
  Base.extend({ kind: z.literal("action_injection"), provider: Provider, asks_for: z.literal("send_email") }),
  Base.extend({ kind: z.literal("value_poisoning"), provider: Provider, target: z.object({ cell: z.string(), value: Value }) }),
  Base.extend({ kind: z.literal("dead_end"), provider: z.null() }),
]);
export type SyntheticNote = z.infer<typeof SyntheticNote>;

const FOLDERS = ["injections", "poisoning", "deadends"] as const;

export function loadSynthetic(dataDir: string): Map<string, SyntheticNote> {
  const out = new Map<string, SyntheticNote>();
  for (const folder of FOLDERS) {
    const dir = path.join(dataDir, "fixtures", "synthetic", folder);
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
      const note = SyntheticNote.parse(JSON.parse(readFileSync(path.join(dir, f), "utf8")));
      if (out.has(note.id)) throw new Error(`duplicate synthetic id ${note.id}`);
      out.set(note.id, note);
    }
  }
  return out;
}

/** A synthetic note as a search result passage. Its source id is synthetic:*, so the verifier never accepts facts from it. */
export function asPassage(n: SyntheticNote): Passage {
  return { id: `${n.source_id}#1`, source_id: n.source_id, heading: n.title, text: n.text };
}
