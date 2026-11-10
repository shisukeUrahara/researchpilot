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
Filled in when the screens are generated.
