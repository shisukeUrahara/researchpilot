import type { z } from "zod";
import type { ToolName } from "../domain/schemas";
import { ListArgs, PriceArgs, ReadArgs, SearchArgs, type DocTools } from "./docs";

/** What a tool run gets besides its arguments. */
export interface ToolRunContext {
  docs: DocTools;
  step: number;
}

export interface ToolSpec {
  name: ToolName;
  args: z.ZodType;
  /** True for tools that change something outside the run (only the decoy). */
  sideEffect: boolean;
  /** True when a person must approve this exact action first. */
  needsApproval: boolean;
  /** Raw tool output: a JSON string, maybe broken. */
  run: (args: never, ctx: ToolRunContext) => string;
}

export type Registry = ReadonlyMap<ToolName, ToolSpec>;

const docTools: ToolSpec[] = [
  { name: "search_docs", args: SearchArgs, sideEffect: false, needsApproval: false, run: (a: SearchArgs, c: ToolRunContext) => c.docs.search(a, c.step) },
  { name: "read_passage", args: ReadArgs, sideEffect: false, needsApproval: false, run: (a: ReadArgs, c: ToolRunContext) => c.docs.read(a, c.step) },
  { name: "list_sources", args: ListArgs, sideEffect: false, needsApproval: false, run: (a: ListArgs, c: ToolRunContext) => c.docs.listSources(a) },
  { name: "price_lookup", args: PriceArgs, sideEffect: false, needsApproval: false, run: (a: PriceArgs, c: ToolRunContext) => c.docs.priceLookup(a) },
] as ToolSpec[];

/** The registry: every tool the model may name. The allowlist decides which may run. */
export function makeRegistry(extra: ToolSpec[] = []): Registry {
  return new Map([...docTools, ...extra].map((t) => [t.name, t]));
}

export type ArgsResult = { ok: true; args: unknown } | { ok: false; error: string };

/** Parses `args_json` with the tool's own schema. Bad JSON or a bad field is `tool_args_invalid`, never a crash. */
export function parseToolArgs(spec: ToolSpec, argsJson: string): ArgsResult {
  let raw: unknown;
  try {
    raw = JSON.parse(argsJson);
  } catch {
    return { ok: false, error: "args_json is not valid JSON" };
  }
  const r = spec.args.safeParse(raw);
  return r.success ? { ok: true, args: r.data } : { ok: false, error: r.error.issues.map((i) => `${i.path.join(".") || "args"}: ${i.message}`).join("; ") };
}
