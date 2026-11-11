# Prompt and rule changelog (dev split only)

Tuning used only the 8 dev scenarios. The 40 eval and 30 injection scenarios were never run before
the prompts were frozen (`data/preregistration.json`).

## v1 → round 1 (`runs/dev-bounded-v1` → `runs/dev-bounded-r1`)
Baseline v1: task success 2/8, coverage 23/196 (11.7%), raw claim support 23/33 (69.7%).
Causes found in the dev records:
- The writer listed only the numbers it "relied on", so most verified facts never reached the memo.
- The extractor filed Lambda's 900 s maximum as the default duration (C01) too.
- The writer reasoned out verdicts itself and got them wrong.
Changes:
- `writer.v2`: one claim for every ledger cell; copy values exactly.
- `extractor.v2`: C01 only when the page says "default"; a single limit is C02.
- Code: for bounded and ablation, verdicts are computed by the fit rules from verified facts; the
  memo check replaces any differing writer verdict. The naive arm keeps the writer's verdicts.
- Code: a tight-deadline scenario now lowers the run's deadline (it was ignored).
Round 1: task success 1/8, coverage 48/196 (24.5%), raw claim support 48/65 (73.9%); 3 runs had no
memo (writer cut off at 2,500 tokens).

## Round 1 → round 2
Causes found in `runs/dev-bounded-r1`:
- Writer output cut off (finish_reason length) on long ledgers → no memo.
- Grader compared units literally: 300 s ≠ 300,000 ms.
- The extractor filed numbers under C12 (price); the verifier did not reject them.
- An AWS number (10,240 MB) was filed under Vercel; the verifier never checked the page's provider.
- "Requests: No limit" passed as concurrency; "Static Asset file size 25 MiB" as request body.
- Table columns mixed up (Vercel "Extended maximum" read as Maximum, "-" read as a value).
Changes:
- Writer max tokens 2,500 → 6,000.
- Grader compares numbers in base units.
- Verifier: C11/C12 facts rejected (`not_extractable`); page provider must match (`wrong_provider`);
  memory, CPU, body, response, concurrency and subrequest facts must have the kind named in the line,
  table header or heading.
- `extractor.v2`: column headers decide the criterion; "-" means not offered; never C11/C12.
