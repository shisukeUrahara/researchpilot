# ResearchPilot

A bounded research agent. Ask it which serverless platform fits a workload ("my job runs about 3 minutes,
needs 256 MB and streams progress: Cloudflare Workers, Vercel Functions or AWS Lambda?") and it plans,
reads saved copies of the official limits pages, writes down every fact with its quote and page date,
notices when an old page and a new page disagree, stops by rules written in code, and writes a short memo
where every number links to a dated official quote.

**Its stop rules and tool permissions live in code, not in the prompt** — and it is measured on 40 frozen
tasks against the same agent without those rules.

> Independent portfolio project. Not affiliated with Cloudflare, Vercel or AWS. Nothing here is a
> recommendation: every verdict is "for this workload, per the dated official pages listed".

## Results (40 frozen tasks per arm, 30 planted notes, one model, R = 1)

**Same model, same tools, same corpus, same budget: with the verifier and the freshness rule, 87.6% of the
memo writer's claims matched the official pages (naive loop: 38.8%), 0 values from the stale 2025 page
were stated as current (naive: 83), and 0 of 10 planted fake values reached a memo (naive: 3 of 10).**
Task success is low in every arm (bounded 7/40), and the release gate says **BLOCK**: coverage is 39.9%
against a pre-set floor of 80%.

| Measure | bounded | ablation (no-progress rule off) | naive (plain tool loop) |
|---|---|---|---|
| Task success | 7/40 | 5/40 | 4/40 |
| Coverage (cells with a stated value, right) | 39.9% | 39.7% | 33.9% |
| Unknown cells left unknown | 94.1% | 92.7% | 71.8% |
| Writer's claims that match the pages | 87.6% | 86.1% | 38.8% |
| Stale value stated as current | 0 | 1 | 83 |
| Invented price | 0 | 0 | 10 |
| Planted fake value in the memo | 0/10 | — | 3/10 |
| send_email proposed after a planted note | 0/20 | — | 0/20 |
| Median tool calls · cost | 9 · $0.93 | 10 · $1.03 | 10.5 · $0.90 |
| Dead ends stopped on NO_PROGRESS | 4/4 | 0/4 | 0/4 |

Every number comes from `runs/<set>/metrics.json`; `docs/analysis.md` explains them and
`docs/limitations.md` lists what they do not prove. Labels were checked by a model reviewer, not a
human. `pnpm rp reproduce` replays all 180 runs from the committed cache with no API key, byte for byte;
CI does it on every push. Total live spend for the project: $3.69.

![Run page](docs/screenshots/ui-run-dark.png)

![Memo with evidence](docs/screenshots/ui-memo-dark.png)

## Quick start (no API key)

```bash
pnpm install
pnpm rp verify                 # the committed passages match their sources
pnpm rp reproduce              # every eval run set replays byte for byte from the committed cache
pnpm build && pnpm start       # http://localhost:3030 — Run, Memo and Evals pages
```

Or with Docker: `docker compose up` → http://127.0.0.1:3030. Without a key the app replays the committed
cache: sample runs go through the real graph, their memos and the eval results all work. With
`OPENAI_API_KEY` in `.env`, `pnpm rp run --brief three-minute` makes a live run (capped at $0.12).

## How it works

```
brief → planner (≤ 8 steps, each tied to cells)
      → [ actor proposes one tool call → approve (only fetch_live) → executor → extractor → verifier
          → ledger → progress rule ] × until a stop reason
      → writer (memo from the ledger only) → memo check (code)
```

- **The model only proposes.** Each step it returns `{tool, args_json, cells, reason, done}`. One function,
  the executor, runs every tool: args schema → allowlist → approval → budget → idempotency → run memory →
  run → record. `send_email` is in the model's tool list on purpose, as a decoy: it is never on the
  strict allowlist and only ever writes to a sandbox table.
- **Budgets in code** (`config/budgets.json`, the same for every arm): 16 steps, 12 tool calls, 120 s of
  virtual time, $0.12. One stop reason per run: `VERIFIED`, `NO_PROGRESS`, `MAX_STEPS`, `MAX_TOOLS`,
  `TIMEOUT`, `BUDGET_USD`, `CANCELLED`, `ERROR`.
- **Facts are checked by code.** A fact counts only if its quote is in an official passage, the number is
  in the quote, the plan, kind of limit, unit, product and provider all fit. Facts from planted notes are
  rejected by source.
- **Dated sources, freshness rule.** Six official sources with page dates; the 2025 copy of Vercel's
  limits page is in the corpus on purpose. An archived copy never gives a cell its current value.
- **Verdicts by code.** In the bounded and ablation arms the fit rules compute fits / does not fit from
  verified facts; the model writes the words around them.
- **Checkpoints.** LangGraph with a SQLite checkpointer saves after every node; a run killed with
  SIGKILL resumes with no tool call run twice (`src/core/graph/crash.test.ts`).

## Arms

| Arm | What it is |
|---|---|
| bounded | planner, no-progress rule, verifier, memo check, verdicts by code, strict allowlist |
| ablation | bounded with only the no-progress rule turned off |
| naive | a plain tool loop: no planner, no rule, no verifier, no memo check, permissive tools; its actor reads raw page text |
| bounded-permissive | bounded with the allowlist off (injection suite only) |

## Evidence

- Sources and gold: `fixtures/sources/`, `docs/sources.md`, `data/gold/facts.v1.jsonl` (75 rows,
  reviewed by a model reviewer, not a human: `data/labels/gold_review.jsonl`).
- Frozen before any eval run: `data/preregistration.json` (shas of scenarios, gold, budgets, policy,
  models, gate rules, prompts).
- Run sets: `runs/<set>/` (manifest, records, grades, metrics). Gate: `gate/rules.v1.json`, `gate/gate.json`.
- Tuning on the dev split only: `docs/prompt_changelog.md`. What broke while building: `docs/build_log.md`.
- Decisions: `docs/adr/`. Reading order: `docs/CODE_TOUR.md`. Limits: `docs/limitations.md`.
- CI catches a loosened policy: [PR #1](https://github.com/shisukeUrahara/researchpilot/pull/1) adds
  `send_email` to the strict allowlist (one config line) and CI fails on 3 tests. Closed on purpose.

## Repo map

`src/core/` (agent, tools, evidence, grading — plain TypeScript) · `src/cli/` (`pnpm rp …`) ·
`src/app/` + `src/components/` (Next.js pages and API) · `fixtures/` · `data/` · `config/` · `runs/` ·
`gate/` · `cache/llm/` (replay cache) · `e2e/` · `design/stitch/`.

MIT license. Sources and their terms: `NOTICE.md`.
