import { readFileSync } from "node:fs";
import path from "node:path";
import type { Msg } from "../llm/runner";
import { sha256Hex } from "./canonical";

export interface PromptTemplate {
  /** File name without extension, e.g. `planner.v1`. */
  name: string;
  sha: string;
  messages: Msg[];
}

/**
 * A prompt file is markdown with a `## system` and a `## user` section, mustache `{{vars}}` inside.
 * Its sha goes into run manifests, so a prompt edit is visible in every result.
 */
export function parsePrompt(name: string, text: string): PromptTemplate {
  const parts = text.split(/^## (system|user)\s*$/m);
  const messages: Msg[] = [];
  for (let i = 1; i < parts.length; i += 2) messages.push({ role: parts[i] as Msg["role"], content: parts[i + 1].trim() });
  if (messages.length !== 2 || messages[0].role !== "system" || messages[1].role !== "user") {
    throw new Error(`prompt ${name}: needs exactly a '## system' section followed by a '## user' section`);
  }
  return { name, sha: sha256Hex(text), messages };
}

export function loadPrompt(dataDir: string, name: string): PromptTemplate {
  return parsePrompt(name, readFileSync(path.join(dataDir, "data", "prompts", `${name}.md`), "utf8"));
}
