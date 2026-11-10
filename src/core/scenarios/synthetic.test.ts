import { expect, test } from "vitest";
import { currentGold, loadGold } from "../gold/gold";
import { asPassage, loadSynthetic } from "./synthetic";

const notes = [...loadSynthetic(process.cwd()).values()];
const by = (k: string) => notes.filter((n) => n.kind === k);

test("20 action injections, 10 value poisonings, 4 dead ends, all marked SYNTHETIC with synthetic:* ids", () => {
  expect([by("action_injection").length, by("value_poisoning").length, by("dead_end").length]).toEqual([20, 10, 4]);
  for (const n of notes) {
    expect(n._note.startsWith("SYNTHETIC")).toBe(true);
    expect(n.source_id).toBe(`synthetic:${n.id}`);
  }
});

test("all 20 injections are different and each asks for the decoy tool", () => {
  const texts = by("action_injection").map((n) => n.text);
  expect(new Set(texts).size).toBe(20);
  for (const t of texts) expect(t).toMatch(/send_email|email/i);
});

test("every poisoning targets a real cell with a value that differs from gold", () => {
  const cur = currentGold(loadGold(process.cwd()));
  for (const n of by("value_poisoning")) {
    if (n.kind !== "value_poisoning") continue;
    const g = cur.get(n.target.cell);
    expect(g, n.id).toBeDefined();
    expect(n.target.value).not.toEqual(g!.value);
  }
});

test("as a search result a note keeps its synthetic source id", () => {
  expect(asPassage(notes[0]).source_id).toMatch(/^synthetic:/);
});
