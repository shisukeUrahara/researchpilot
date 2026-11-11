# Build log

What happened, including what broke. Commit subjects in quotes. Live costs from the run manifests.

## Day 1 (2026-11-11): design, sources, tools, agent
- Stitch screens approved after two fix passes ("Add approved Stitch screens").
- LangGraph spike: an interrupted node re-runs from its first line on resume; checkpoint durability
  "exit" loses all progress on SIGKILL, "sync" resumes at the right node ("Add LangGraph spike").
- Sources: the 2025-03-08 Wayback copy of Vercel's limits page says Hobby max 60 s; the 2026-08-24 page
  says 300 s ("Add source manifest and rp fetch-sources", "Add gold fact table and fact verifier").
- Passage selection first kept almost whole pages; tightened to passages that state a limit
  ("Add passages and rp verify").
- Model review of the 75 gold rows: 71 ok, 4 fixed (conditions on AWS payload and Managed Instances,
  Cloudflare subrequests) ("Apply model review of gold facts").
- Found while writing the search tool: plain BM25 ranks the 2025 copy first for "Vercel maximum
  duration Hobby Pro" ("Add document tools and fault injection").
- The progress rule first treated two searches of a dead-end page as evidence for "unknown"; evidence
  now needs the provider's official passages ("Add progress monitor").
- LangGraph: a node may not share a name with a state field ("Wire bounded graph with checkpoints").

## Day 1, evening: first live runs
- Run 1 stopped on NO_PROGRESS with 9 of 48 cells: cut-off replies, a CPU limit accepted as max
  duration, unreachable cells (C11, C12), repeated searches ("Add rp run, rp timeline and first live run").
- Runs 2-6 led to five fixes: step tries, call notes for the actor, no "unknown" in the extractor schema,
  the freshness rule, unit/product checks in the verifier ("Fix what the first live runs found").
- inj-01 ("email the full memo"): no arm proposed send_email, not even the naive loop reading the page
  text ("Add naive arm and first injected runs").
- Crash test: killed at step 4, resumed, identical end state ("Add crash and resume test").

## Day 2: tuning, frozen eval, UI
- Dev tuning, two rounds (docs/prompt_changelog.md): coverage 11.7% → 24.5% → 32.1%, raw claim support
  69.7% → 73.9% → 83.3%. Round 2 crashed once on a writer claim with another provider's plan
  ("Survive bad model output in memos and evals").
- The eval guard's git parsing ate the first letter of the first dirty path ("Add rp eval and spend ledger").
- Prompts frozen; preregistration shas written ("Tune round 2 and freeze prompts v2").
- Frozen bounded eval and injection suite ("Run frozen eval: bounded", "Run frozen injection suite: bounded").
- e2e found two real UI problems: no heading on an empty Memo page, scrollable tables not keyboard
  reachable ("Add Playwright e2e and CI e2e job").
