# Stitch designs

All ResearchPilot screens are designed in Google Stitch before any UI code is written. The owner approves them first.

The look follows [DESIGN.md](DESIGN.md): the Afterglow family from EvalForge, Atlas and PromptFlight.

Model: `GEMINI_3_5_FLASH_LITE` (the default model timed out on earlier projects).

## Pages
Three pages hold all five playbook screens (research brief, plan board, live run, evidence ledger, decision memo).

| Page | What it shows |
|---|---|
| Run (home) | Left (7/12): research brief form. Question text; workload fields (duration, CPU time, memory, streaming, streamed size, request body); plan per provider (Cloudflare free/paid, Vercel hobby/pro/enterprise, AWS default); criteria chips C01–C12 (click to exclude); budget control (max steps 16, max tool calls 12, deadline, cost cap). Sample brief chips ("Three-minute job", "Dead end", "Injected note"). Start button. Right (5/12): budget meter (4 bars) and stop banner once the run ends. Below: plan board (planned / running / verified / blocked) and the live timeline (one row per node event, blocked rows in coral). |
| Memo | The decision memo for one run. Verdict table: one row per provider, verdict pill (`fits`, `fits on pro`, `does not fit`, `unknown`), reasons with underlined numbers, plan and snapshot date on every limit. Disclaimer line under the table. Unknowns section (cell + reason). Click a number → claim drawer: quote, passage id, source, page date + date kind, tool event id, cache key. Tab "Evidence ledger": sortable table of facts (provider, criterion, plan, value, status: verified / conflicted / unknown, source, date); conflicts shown as side-by-side pairs with "used" / "superseded" pills. Export memo as `.md`. |
| Evals | Four arms (bounded, ablation, naive, bounded-permissive) as columns. Rows: task success n/40 with Wilson range, coverage, raw claim support, median tool calls, redundant calls, budget compliance, no-progress stops n/4, injection: email attempts n/20, executions, injected values in memo n/10. Every number links to its run row. Stop-reason breakdown per arm as a small stacked bar. Version strip: scenario set sha, source manifest sha, prompt versions, model spec, run ids. |

## States
Running (timeline grows, meter fills), awaiting approval (amber banner: "fetch_live wants to re-download vercel.com/docs/functions/limitations. Approve with `pnpm rp approve <id>`"), partial/unknown (dashed cells), stale (a superseded value, amber), cancelled (steel banner with the step it stopped at), error (coral banner + the command to retry), live mode needs key ("This brief is not in the replay cache. Live mode needs OPENAI_API_KEY.").

## 90-second storyboard
| Time | Screen id | What the viewer learns |
|---|---|---|
| 0:00–0:12 | run-dark: brief and 6 dated sources | the problem and where the data comes from |
| 0:12–0:30 | run-dark: sample brief → plan board → steps → stop `VERIFIED` | it is a real end-to-end app |
| 0:30–0:48 | memo-dark: click a number → drawer (quote → passage → date → tool event); ledger tab with Vercel old vs new | why each claim was accepted; freshness |
| 0:48–1:05 | run-dark: injected run (`send_email` proposed, then blocked; poisoned value rejected); dead end → `NO_PROGRESS` | failures are tested |
| 1:05–1:20 | evals-dark: bounded vs ablation vs naive (calls, coverage, supported claims, N) | honest numbers |
| 1:20–1:30 | memo-dark export, README, `pnpm rp reproduce` | someone else can run it |

## Screens to make
| Screen id | Page | Variant |
|---|---|---|
| run-dark | Run | desktop, dark |
| run-light | Run | desktop, light |
| run-phone-dark | Run | phone, dark |
| memo-dark | Memo | desktop, dark |
| memo-light | Memo | desktop, light |
| evals-dark | Evals | desktop, dark |
| evals-light | Evals | desktop, light |

## Copy rule
Every Stitch prompt carries exact text. Numbers in the designs are **sample data** and are labeled "sample". The built pages read only real runs. No avatars, no vendor logos, no invented customer claims, no "winner" badges. Every verdict line ends with: "For this workload, per the dated official pages listed. Not a recommendation. Independent project, not affiliated with Cloudflare, Vercel or AWS."

## Project
Owner approved 2026-11-11.

- Stitch project: `projects/6847605314973702490` ("ResearchPilot", private to the owner), made 10 Nov 2026 with `GEMINI_3_5_FLASH_LITE`.
- The EvalForge design systems could not be reused: the first prompt that named `assets/2132799dc50047c2bae19a7f9cf28581` timed out and its screen came back on a new design system, so Stitch made one per theme from the first prompt:
  - dark: `assets/714a93e5597f41b599914068ddc3787f` ("ResearchPilot")
  - light: `assets/a1eb196413f34bfaac719637360d0bf5` ("ResearchPilot")

Fixed on 2026-11-11 after owner review (owner: 'screens look decent, fix the issues'). Two edit passes.

PNGs in `screens/`, desktop shrunk to 1280 px wide, phone kept at 780 px (2x of 390).

| Screen id | Stitch screen id | PNG |
|---|---|---|
| run-dark | `f2732b33f6234954909ed63b7b56e297` | `screens/run-dark.png` |
| memo-dark | `9e575ee99bb84add883dce3adcfd680f` | `screens/memo-dark.png` |
| evals-dark | `947fd4d21a9243b58f6bd45aac9fd9a0` | `screens/evals-dark.png` |
| run-light | `1bd13aebe9b04280b4b9c2edc40b4619` | `screens/run-light.png` |
| memo-light | `38c2c46eb42b42d1a2b04194b6e5a89c` | `screens/memo-light.png` |
| evals-light | `2dfedb2a101349fcad46ed29fe5ebeff` | `screens/evals-light.png` |
| run-phone-dark | `a0b8934713d5464c8799e0f210e88f4c` | `screens/run-phone-dark.png` |

Earlier versions left in the project (not used): `b38bd027bec94be9996eddaea017851b`, `9caabdfc7118423aa63e11cf65a7039c`, `a57431b5d1f94fa391b7dd20e712e2ca`, `660b8506c15742ad9a5637d35b8c5f84`, `3b9b16a47b814dd2a205421230ba5692`, `9bf00aa1933f4e1296c5dd9d8e3f0f36`, `d7f6535e367647428a7b581a68e1e14c`, `9995158aed6f4b838b88ed02eb092734`, `0deced5246814ba58bea1c2b32442f87`, `26a62d6856a248b0a3b7961b1fb26911`, `a0cfa5920a5c40e0bfd5c13b4b1b40fe`, `46e15a36b9a94683bc10b946542d3f09`, `fdf3eac5cf4b4f5598c14a4ee5f1bd7c`. Duplicates left by timed-out calls (not used): `904e2b9ee685406db1dbdf3d9f7155b5` (run, dark), `9f76d1a858b246eb9971a598de70b40a` (run, light), `b7ba836cdc7b4639b67f1dff7e470f13` (run, phone), `4a14576901374540b1c08fcfb4093115` (run, dark, stuck on "Generating").

Still off-spec after the fixes, not used in the build (every number is sample data; real values come from runs):
- run-dark: a faint violet haze with a hard top edge still starts at the budget row on the left (spec: soft corner haze only, plain canvas). Three edits did not remove it; this version has the weakest band.
- memo-dark: none found.
- evals-dark: none found.
- run-light: two source dates wrap in the middle ("2026-" / "09-02") instead of staying on one line.
- memo-light: none found (claim source and freshness URLs truncated with an ellipsis; minor).
- evals-light: none found.
- run-phone-dark: none found.

Note on sample content: the screens' words and numbers are Stitch's sample text, not facts. For example memo-dark blames Cloudflare's CPU time; the real blocker for a 256 MB job is the 128 MB memory per isolate (`docs/sources.md`). The built pages show only real run data. The leftover violet band on run-dark is fixed in the build (plain night canvas).
