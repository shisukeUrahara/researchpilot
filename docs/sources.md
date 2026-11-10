# Sources

Official pages the agent reads, as saved copies. Full pages stay in the gitignored `cache/raw/`;
committed passages are in `fixtures/sources/passages/`. Re-check with `pnpm rp fetch-sources` (exit 1 on drift).

| Source id | Provider | Kind | Page date | Date kind | Passages | sha256 (first 12) |
|---|---|---|---|---|---|---|
| `cf-limits` | cloudflare | docs | 2026-10-29 | page | 31 | `03ac3b33b9bf` |
| `vc-limits` | vercel | docs | 2026-08-24 | page | 18 | `17b775930ace` |
| `vc-limits-2025` | vercel | archive | 2025-03-08 | page | 12 | `7ce15c9a869f` |
| `vc-cl-30min` | vercel | changelog | 2026-06-15 | page | 6 | `e05231ffdca8` |
| `vc-cl-fluid` | vercel | changelog | 2025-06-25 | page | 7 | `1d91b1dae56b` |
| `aws-quotas` | aws | docs | 2026-11-10 | retrieved | 30 | `20cfa84ad222` |

Retrieved 2026-11-10. The 2025 Wayback copy was readable as HTML, so no fallback source was needed.

## Gold facts

`data/gold/facts.v1.jsonl` has **75 rows**: **66 current** (one per cell: 11 criteria × 6 provider-plan pairs; C11 is derived by the fit rules) and **9 stale**.
- Current rows with a stated value: 44. Current rows whose correct answer is unknown: 22 (price everywhere, plus values the pages do not state).
- Stale rows come from `vc-limits-2025` (the Vercel limits page on 2025-03-08, before Fluid compute became the default). Each has `superseded_by` pointing at the current cell.
- Every row with a value passes the same code verifier the agent uses (`src/core/gold/gold.test.ts`).

## The freshness case

| Cell | 2025-03-08 page | 2026-08-24 page |
|---|---|---|
| `C01:vercel:enterprise` | 15 s | 300 s |
| `C01:vercel:hobby` | 10 s | 300 s |
| `C01:vercel:pro` | 15 s | 300 s |
| `C02:vercel:enterprise` | 900 s | 800 s |
| `C02:vercel:hobby` | 60 s | 300 s |
| `C02:vercel:pro` | 300 s | 800 s |
| `C05:vercel:enterprise` | 3009 mb | 4096 mb |
| `C05:vercel:hobby` | 1024 mb | 2048 mb |
| `C05:vercel:pro` | 3009 mb | 4096 mb |

An agent that reads only the old page would say a 3-minute job does not fit Vercel Hobby (60 s max). The current page says it does (300 s).
