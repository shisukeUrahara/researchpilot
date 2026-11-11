# Code tour

Read in this order. Everything under `src/core/` is plain TypeScript (no Next, no React); only
`src/core/llm/` and `src/core/graph/` may import LangChain or LangGraph (lint rule + `boundary.test.ts`).

1. **Sources** — `src/core/sources/`: `manifest.ts` (6 official sources, dates, shas), `fetch.ts`
   (`rp fetch-sources`, drift report), `passages.ts` (≤ 80-word passages under headings), `verify.ts`
   (`rp verify`). Data: `fixtures/sources/`, `docs/sources.md`.
2. **Gold and fit rules** — `src/core/gold/gold.ts` (75 rows, current and stale), `src/core/fit/rules.ts`
   (fits / fits on plan / does not fit / unknown, CPU and wall-clock separate).
3. **Scenarios** — `src/core/scenarios/`: schema, lint (expected answers computed by the fit rules),
   synthetic notes (`fixtures/synthetic/`), `data/scenarios/v1.jsonl` (8 dev, 40 eval, 30 injection).
4. **Tools and executor** — `src/core/tools/` (BM25 search, read, list, price, `fetch_live`, decoy
   `send_email`, registry, policy) and `src/core/exec/executor.ts` (the only way a tool runs).
5. **Evidence** — `src/core/evidence/verify.ts` (the code check every fact passes: official source, quote
   in passage, value in quote, plan, kind of limit, unit, product, provider) and `ledger.ts` (conflicts,
   source order, freshness rule).
6. **Budgets** — `src/core/budget/runBudget.ts` (virtual clock, limits, memo reserve) and `spend.ts`
   (the $15 total cap across commands).
7. **Agent** — `src/core/graph/`: `nodes/` (plan, act, approve, extract, memo), `progress.ts` (stop
   rules), `bounded.ts` (the LangGraph graph), `runner.ts` (start, continue, checkpoints),
   `evalRun.ts` (`rp eval`). `src/core/memo/check.ts` keeps only claims the ledger backs.
8. **Model layer** — `src/core/llm/` (copied from EvalForge: Gateway, replay cache, retry, mock OpenAI
   server). `docs/langchain_notes.md`, `docs/langgraph_notes.md`.
9. **Grading** — `src/core/grade/` (records, grader, report), `src/core/metrics/eval.ts` (rates with
   Wilson ranges), `src/core/gate/evaluate.ts` (`gate/rules.v1.json`).
10. **CLI** — `src/cli/rp.ts` and `src/cli/commands/`: `doctor`, `fetch-sources`, `build-passages`,
    `verify`, `run`, `timeline`, `approve`, `cancel`, `resume`, `rebuild-db`, `eval`, `report`, `gate`,
    `reproduce`.
11. **Web app** — `src/core/views/` (pure view-models), `src/app/` (Run, Memo, Evals pages and the
    `/api/research-runs` routes), `src/components/`.
12. **Tests** — `*.test.ts(x)` next to the code (vitest; graph tests use the mock OpenAI server),
    `e2e/` (Playwright at 390 / 768 / 1440 px with axe).
