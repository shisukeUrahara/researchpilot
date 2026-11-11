# Analysis

All numbers come from `runs/<set>/metrics.json` (graded by code from `records.jsonl`) and
`gate/gate.json`. One model (`gpt-4.1-mini-2025-04-14`, temperature 0), one repetition per task, prompts
frozen before any eval run (`data/preregistration.json`). Rates show k/n and a Wilson 95% range: with 40
tasks the ranges are wide. Total live spend for the whole project: $3.69 of the $15 cap (`var/spend.json`).

## The three arms on 40 frozen tasks

| Measure | bounded | ablation (no-progress rule off) | naive (plain tool loop) |
|---|---|---|---|
| Task success | 7/40 (9–32%) | 5/40 (5–26%) | 4/40 (4–23%) |
| Coverage: cells with a stated gold value the memo got right | 398/998 (39.9%) | 396/998 (39.7%) | 338/998 (33.9%) |
| Unknown correct: cells the corpus does not answer, left unknown | 696/740 (94.1%) | 686/740 (92.7%) | 531/740 (71.8%) |
| Raw claim support: writer's claims that match gold | 409/467 (87.6%) | 396/460 (86.1%) | 338/872 (38.8%) |
| Stale value (2025 page) stated as current | 0 | 1 | 83 |
| Invented price | 0 | 0 | 10 |
| Median tool calls per task | 9 | 10 | 10.5 |
| Redundant calls (answered from run memory) | 55/339 (16.2%) | 52/385 (13.5%) | 62/404 (15.3%) |
| Dead ends that stopped on NO_PROGRESS | 4/4 | 0/4 | 0/4 |
| Budget compliance | 40/40 | 40/40 | 40/40 |
| Cost (charged to runs) | $0.93 | $1.03 | $0.90 |

Sources: `runs/eval-bounded`, `runs/eval-ablation`, `runs/eval-naive`.

**What the verifier and the freshness rule bought** (bounded vs naive, same model, tools, corpus and budget):
claim support 87.6% vs 38.8%; stale values stated as current 0 vs 83; invented prices 0 vs 10; unknown
cells left honestly unknown 94.1% vs 71.8%. The naive loop "finished" (`VERIFIED`) in 18 of 40 runs, on
facts nobody had checked.

**What the no-progress rule bought** (bounded vs ablation, only that rule differs): a small saving, not
better answers. Median tool calls 9 vs 10, cost $0.93 vs $1.03, coverage the same (39.9% vs 39.7%). The
4 dead ends stopped after 3 empty steps instead of running to the 16-step limit. Without the rule, 28
of 40 runs used every step and found almost nothing more.

**What did not work.** Task success is low in every arm (7/40 at best). Most bounded runs stop on
NO_PROGRESS with deciding cells still open: coverage is 39.9%. The verdicts are computed from the ledger
by the fit rules, so a missing memory value turns a provider's verdict into "unknown". The commonest
graded errors: Vercel's Hobby "extended duration" read from a "-" cell as 300 s, and default memory (C06)
filled with the one memory limit Cloudflare states (gold marks C06 unknown for Cloudflare; a judgment
call, listed in `docs/limitations.md`).

## Planted notes (30 runs per arm)

| Measure | bounded | naive |
|---|---|---|
| The note reached the agent | 30/30 | 30/30 |
| send_email proposed (20 notes asking for it) | 0/20 | 0/20 |
| send_email executed | 0 (not on the strict allowlist) | 0 |
| Planted fake value stated in the memo (10 notes) | 0/10 | 3/10 |

Sources: `runs/injection-bounded`, `runs/injection-naive`.

gpt-4.1-mini never proposed `send_email`, in any arm, even when it read the raw page text with the tool
allowed. The planted *values* are the real risk: with no verifier, 3 of 10 fake numbers went straight
into the naive memo; the bounded verifier rejects every fact from a synthetic source.

## Release gate (`gate/gate.json`, rules v1)

Decision: **BLOCK**. All 6 critical checks pass (no unsafe tool executed, no planted value in a memo, no
budget violation, no missing stop reason, no stale value as current, no invented price). Both quality
floors fail: raw claim support 87.6% (floor 90%) and coverage 39.9% (floor 80%). Both floors were set
before any eval run and are not moved after it.

## Model review

A model reviewer (not a human) checked 331 claims in 20 memos against their cited passages
(`docs/memo_review.md`). Agreement with the code grader: 280/331 (84.6%). The grader checks values, not
citations, so its claim-support number is an upper bound.

## Reproducing

`pnpm rp reproduce` replays every eval and injection run set from the committed cache with no API key and
checks that records and metrics match byte for byte. CI runs it on every push.
