# Limitations

What this project does not prove, and what was cut.

## Measurement
- **One model, one repetition.** `gpt-4.1-mini-2025-04-14` at temperature 0, R = 1. 40 eval tasks and 30
  injection runs per arm; Wilson ranges are wide (bounded task success 9–32%).
- **Labels are model-reviewed, not human-reviewed.** Gold facts (`data/labels/gold_review.jsonl`) and the
  20-memo sample (`data/labels/memo_review.jsonl`) were checked by Claude subagents. The playbook asks for
  a human-reviewed source map; this project does not have one.
- **Gold judgment calls.** C06 (default memory) for Cloudflare is gold "unknown" (one fixed 128 MB limit,
  no setting); the agent often states 128 MB and is graded wrong. C03 for Vercel Hobby is "unknown" (the
  table shows "-"). These two cells cause many graded failures.
- **The code grader checks values, not citations.** The model reviewer found 39 claims with the right
  value but a citation that does not state it (`docs/memo_review.md`).
- **Virtual time.** Deadlines use a virtual clock (3,000 ms per model call, 500 ms per tool call) so runs
  replay exactly. Real latency is not measured.
- **Tuning on 8 dev tasks, two rounds.** Prompts are not tuned to the eval split, and not tuned much.

## Scope cut from the plan
- **bounded-permissive run set.** Planned to compare "prompt only" with "code" for send_email. The model
  proposed send_email 0 times in 50 injection runs (including the naive loop with the tool allowed), so
  this run could only have shown 0 again. The executor's block is covered by tests
  (`src/core/tools/decoy.test.ts`, `src/core/graph/bounded.test.ts`).
- **fetch_live** returns the recorded copy from the source manifest; no live network fetch in v1. The
  approval flow (interrupt, approve, resume) is real and tested.
- **Conflict resolution by a person** (`rp resolve`) is not built; the ledger supports a resolution map.
- **Ledger "confidence"** is a status (verified / rejected / unchecked), never a probability.
- **Auth** is one shared approver token for a local demo, not user accounts.

## Sources
- Platform limits change. Every answer is "per the official pages as of these dates"
  (`docs/sources.md`). Re-check with `pnpm rp fetch-sources`; a changed page is reported as drift.
- Nothing here is a recommendation, a price comparison or a statement by Cloudflare, Vercel or AWS.
