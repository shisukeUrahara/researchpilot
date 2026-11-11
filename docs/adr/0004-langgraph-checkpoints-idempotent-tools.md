# ADR 0004: LangGraph checkpoints and idempotent tools

## Status
Accepted, 2026-11-11.

## Context
A run takes 10-16 steps and a minute or more. A crash, a deploy or a pause for approval must not lose
the run or repeat its tool calls.

## Decision
- The agent is a LangGraph `StateGraph` (planner → act → approve → execute → extract → … → writer) with a
  SQLite checkpointer (`@langchain/langgraph-checkpoint-sqlite`), `durability: "sync"`: state is saved
  after every node before the next starts. The spike showed `"exit"` loses everything on SIGKILL and the
  default `"async"` can lose the last step.
- LangGraph re-runs an interrupted node from its first line on resume. So: the `approve` node does
  nothing before `interrupt()` but an insert-or-ignore; every app-DB write is insert-or-ignore on a
  natural key; a tool call is keyed `(run, step, args)` and a re-run step returns the stored result and
  charges the same budget.
- The checkpoint is the source of truth; the app DB (`var/researchpilot.db`) is a projection that
  `rp rebuild-db` restores.
- Model calls go through EvalForge's LangChain Gateway (replay cache keyed on everything that can change
  the answer, retries, per-call timeout). Cached calls are charged to the run budget too, so a replay
  stops at the same step as the live run.

## Consequences
- `src/core/graph/crash.test.ts`: a run killed at step 4 and resumed ends with the same ledger, counters,
  stop reason and tool events as an uninterrupted run, with no tool call twice.
- LangGraph gotchas are pinned by `src/core/graph/spike.test.ts` and listed in `docs/langgraph_notes.md`.
