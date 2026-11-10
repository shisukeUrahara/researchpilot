/**
 * Child process for the crash spike: runs a 3-node graph on a SQLite checkpointer and
 * SIGKILLs itself inside node "b", after node "a" finished. The parent then resumes.
 * Usage: node --import tsx crashChild.ts <db file> <durability> <counter file>
 */
import { appendFileSync } from "node:fs";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { spikeGraph } from "./spikeGraph";

const [dbFile, durability, counterFile] = process.argv.slice(2);
const saver = SqliteSaver.fromConnString(dbFile);
const graph = spikeGraph((node) => {
  appendFileSync(counterFile, node + "\n");
  if (node === "b") process.kill(process.pid, "SIGKILL");
}).compile({ checkpointer: saver });

void graph.invoke({ log: [] }, { configurable: { thread_id: "t1" }, durability: durability as "sync" | "async" | "exit" });
