# ADR 0001: Stop rules and budgets live in code

## Status
Accepted, 2026-11-11.

## Context
A research agent that loops until the model says "done" can run forever, repeat searches, or stop early
with a confident memo. Prompt instructions ("do not repeat a search", "stop when you have enough") are
suggestions the model may ignore.

## Decision
- Every run has the same budget (`config/budgets.json`): 16 steps, 12 tool calls, 120 s of virtual time,
  $0.12. Steps are checked in the `act` node, tool calls and per-tool rate limits in the executor, time
  and money before every model call. The memo's time and money are held back from the start.
- Time is virtual (3,000 ms per model call, 500 ms per tool call), so `TIMEOUT` happens at the same step
  live, in replay and in CI.
- The run ends with exactly one stop reason: `VERIFIED`, `NO_PROGRESS`, `MAX_STEPS`, `MAX_TOOLS`,
  `TIMEOUT`, `BUDGET_USD`, `CANCELLED` or `ERROR`. The model never picks it.
- `NO_PROGRESS`: 3 steps in a row with no new value for a cell and no new candidate fact.
- An "unknown" resolves a cell only with evidence: 2 distinct lookups that returned that provider's
  official passages, an unavailable source, or (price) the price tool saying it has no data.

## Consequences
- A stuck run stops cheaply (dead ends: 3 tool calls, about $0.01).
- The rule can stop a run that would have found more with more tries: in the eval most bounded runs end
  on `NO_PROGRESS` with cells still open. The ablation arm (rule off, everything else the same) measures
  that trade.
