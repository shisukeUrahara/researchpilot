/**
 * Pins how @langchain/langgraph 1.7.2 and @langchain/langgraph-checkpoint-sqlite 1.1.0 really
 * behave, so an upgrade that changes any of this fails loudly. Findings: docs/langgraph_notes.md.
 * The live check runs only with RP_LIVE=1 and a key in .env.
 */
import { Annotation, Command, END, GraphRecursionError, interrupt, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { Proposal } from "../domain/schemas";
import { loadPricing } from "../cost/pricing";
import { Budget } from "../runner/budget";
import { ResponseCache } from "../llm/cache";
import { loadModelRoles } from "../llm/config";
import { Gateway } from "../llm/gateway";
import { spikeGraph } from "./testing/spikeGraph";

const tmp = () => mkdtempSync(path.join(tmpdir(), "rp-spike-"));
const cfg = (thread = "t1") => ({ configurable: { thread_id: thread } });

describe("interrupt and resume (1, 2)", () => {
  const State = Annotation.Root({
    approved: Annotation<boolean | null>({ reducer: (_a, b) => b, default: () => null }),
    log: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  });

  function approvalGraph(sideEffects: string[]) {
    return new StateGraph(State)
      .addNode("ask", async () => {
        sideEffects.push("ask:top"); // runs again on resume: the node restarts from its first line
        const answer = interrupt({ action: "fetch_live", url: "https://vercel.com/docs/functions/limitations" }) as boolean;
        sideEffects.push("ask:after");
        return { approved: answer, log: ["ask"] };
      })
      .addNode("done", async () => ({ log: ["done"] }))
      .addEdge(START, "ask")
      .addEdge("ask", "done")
      .addEdge("done", END)
      .compile({ checkpointer: new MemorySaver() });
  }

  test("interrupt pauses the graph; Command({resume}) continues with the answer", async () => {
    const effects: string[] = [];
    const g = approvalGraph(effects);
    const first = await g.invoke({}, cfg());
    const pending = (first as { __interrupt__?: { value: unknown }[] }).__interrupt__;
    expect(pending?.[0]?.value).toMatchObject({ action: "fetch_live" });
    const paused = await g.getState(cfg());
    expect(paused.next).toEqual(["ask"]);

    const final = await g.invoke(new Command({ resume: true }), cfg());
    expect(final).toMatchObject({ approved: true, log: ["ask", "done"] });
  });

  test("the interrupted node re-runs from its top on resume, so anything before interrupt() happens twice", async () => {
    const effects: string[] = [];
    const g = approvalGraph(effects);
    await g.invoke({}, cfg());
    await g.invoke(new Command({ resume: false }), cfg());
    expect(effects).toEqual(["ask:top", "ask:top", "ask:after"]);
  });
});

describe("SQLite checkpoints survive a hard kill (3)", () => {
  function crashThenResume(durability: "sync" | "exit") {
    const dir = tmp();
    const db = path.join(dir, "checkpoints.db");
    const counter = path.join(dir, "entered.txt");
    writeFileSync(counter, "");
    const child = spawnSync(process.execPath, ["--import", "tsx", path.join(__dirname, "testing", "crashChild.ts"), db, durability, counter], {
      encoding: "utf8",
    });
    return { child, db, counter };
  }

  test("durability sync: after SIGKILL in node b, a resume skips a and finishes", async () => {
    const { child, db, counter } = crashThenResume("sync");
    expect(child.signal).toBe("SIGKILL");
    const entered: string[] = [];
    const g = spikeGraph((n) => entered.push(n)).compile({ checkpointer: SqliteSaver.fromConnString(db) });
    const before = await g.getState(cfg());
    expect(before.values.log).toEqual(["a"]);
    expect(before.next).toEqual(["b"]);
    const final = await g.invoke(null, cfg());
    expect(final.log).toEqual(["a", "b", "c"]);
    expect(entered).toEqual(["b", "c"]); // a was not re-run
    expect(readFileSync(counter, "utf8").trim().split("\n")).toEqual(["a", "b"]);
  }, 30_000);

  test("durability exit: the same kill loses everything, so the agent must use sync", async () => {
    const { child, db } = crashThenResume("exit");
    expect(child.signal).toBe("SIGKILL");
    const g = spikeGraph(() => {}).compile({ checkpointer: SqliteSaver.fromConnString(db) });
    const before = await g.getState(cfg());
    expect(before.values.log ?? []).toEqual([]);
  }, 30_000);
});

test("recursionLimit throws GraphRecursionError (4)", async () => {
  const State = Annotation.Root({ n: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }) });
  const loop = new StateGraph(State)
    .addNode("tick", async (s) => ({ n: s.n + 1 }))
    .addEdge(START, "tick")
    .addConditionalEdges("tick", () => "tick")
    .compile();
  const err = await loop.invoke({}, { recursionLimit: 5 }).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(GraphRecursionError);
  expect((err as Error).name).toBe("GraphRecursionError");
});

test("an AbortSignal stops a running graph with an AbortError-like error (5)", async () => {
  const State = Annotation.Root({ n: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }) });
  const slow = new StateGraph(State)
    .addNode("wait", async () => {
      await new Promise((r) => setTimeout(r, 2_000));
      return { n: 1 };
    })
    .addEdge(START, "wait")
    .addEdge("wait", END)
    .compile();
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), 50);
  const t0 = Date.now();
  const err = (await slow.invoke({}, { signal: ctl.signal }).catch((e: unknown) => e)) as Error;
  expect(Date.now() - t0).toBeLessThan(1_500);
  expect(err.name).toMatch(/Abort/);
});

test("durability sync writes one checkpoint per step (6)", async () => {
  const saver = new MemorySaver();
  const g = spikeGraph(() => {}).compile({ checkpointer: saver });
  await g.invoke({ log: [] }, { ...cfg(), durability: "sync" });
  const history = [];
  for await (const s of g.getStateHistory(cfg())) history.push(s);
  // input + start + a + b + c
  expect(history.length).toBe(5);
});

// (7) Live: OpenAI strict mode accepts the Proposal schema whose tool list includes the send_email decoy.
const live = process.env.RP_LIVE === "1" && existsSync(".env");
describe.skipIf(!live)("live OpenAI (RP_LIVE=1)", () => {
  test("strict mode accepts the Proposal schema with the decoy in the tool enum", async () => {
    process.loadEnvFile(".env");
    const pricing = loadPricing("pricing.json");
    const role = loadModelRoles(process.cwd()).actor;
    const g = new Gateway(new ResponseCache("cache/llm"), { apiKey: process.env.OPENAI_API_KEY!, pricing, budget: new Budget(pricing, 0.05) });
    const r = await g.runStructured({
      role,
      messages: [
        { role: "system", content: "You propose one tool call as JSON. Tools: search_docs, read_passage, list_sources, price_lookup, fetch_live, send_email." },
        { role: "user", content: 'Propose a search_docs call with args_json {"query":"Vercel max duration"} for cell C02:vercel:pro.' },
      ],
      schema: Proposal,
      schemaName: "proposal",
      arm: "spike",
      repeat: 0,
    });
    const p = Proposal.parse(JSON.parse(r.raw_text!));
    expect(p.tool).toBe("search_docs");
    expect(JSON.parse(p.args_json)).toMatchObject({ query: expect.any(String) });
  }, 30_000);
});
