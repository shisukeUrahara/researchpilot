# Memo review (model reviewer vs code grader)

A model reviewer (Claude subagents, not a human) checked every material claim of 20 memos against the
passage each claim cites, without seeing the arm, the grade or the gold value. Sample: 8 bounded,
6 ablation, 6 naive memos, spread over scenario kinds (`scripts/memo-review-sample.ts`). Rubric:
`docs/review_protocol.md`. Rows: `data/labels/memo_review.jsonl`.

**Agreement with the code grader: 280/331 claims (84.6%).**

| Code grader → reviewer | Claims |
|---|---|
| supported → supported | 185 |
| unsupported → unsupported | 89 |
| supported → unsupported | 39 |
| stale → unsupported | 8 |
| stale → stale | 6 |
| unsupported → supported | 2 |
| unsupported → stale | 2 |

The grader compares a claim's VALUE with the gold table; the reviewer checks whether the CITED PASSAGE
states it for that criterion and plan. The biggest gap (39 claims): the value matches gold, but the
passage the memo cites does not state it, or the claim's text names a different criterion. So the code
grader's claim-support number is an upper bound; the reviewer is stricter. The reviewer's 3 most common
reasons for "unsupported": the cited passage holds no value (an intro line, a note), a real value filed
under another criterion (Cloudflare's 128 MB as default memory), and claim text naming another criterion
than its cell. 8 claims from the 2025 Vercel page were flagged stale by both or by the reviewer only.

Reviewer judgment calls (kept as written): Vercel's 1800 s from the changelog counts as unsupported
(the changelog names no plan); AWS's 5,400 s counts as supported although it only applies to Managed
Instances.

## Disagreements

| Claim | Cell | Value | Grader | Reviewer | Reviewer note |
|---|---|---|---|---|---|
| memo-02#5 | C03:vercel:pro | 1800 s | supported | unsupported | passage ties 1800s/300s to opt-in, not async |
| memo-02#12 | C06:vercel:hobby | 2048 mb | supported | unsupported | passage gives maximum memory only, not default/min |
| memo-02#16 | C10:cloudflare:paid | 10000 count | supported | unsupported | text calls it concurrency; passage gives subrequests |
| memo-03#8 | C10:cloudflare:paid | 10000 count | supported | unsupported | text calls it concurrency; passage gives subrequests |
| memo-04#3 | C02:vercel:hobby | 300 s | supported | unsupported | text calls it CPU time; passage gives wall duration |
| memo-04#4 | C02:vercel:pro | 800 s | supported | unsupported | text calls it CPU time; passage gives wall duration |
| memo-04#12 | C06:vercel:hobby | 2048 mb | supported | unsupported | passage gives maximum memory only, not default/min |
| memo-04#15 | C09:aws:default | 1000 count | supported | unsupported | text calls it a request count; passage gives another limit |
| memo-05#5 | C04:cloudflare:paid | 300 s | supported | unsupported | text calls it duration; passage gives CPU time |
| memo-06#3 | C02:vercel:hobby | 300 s | supported | unsupported | text calls it CPU time; passage gives wall duration |
| memo-06#4 | C02:vercel:pro | 800 s | supported | unsupported | text calls it CPU time; passage gives wall duration |
| memo-06#6 | C04:cloudflare:paid | 300 s | supported | unsupported | text calls it duration; passage gives CPU time |
| memo-08#2 | C02:vercel:hobby | 300 s | supported | unsupported | text calls it CPU time; passage gives wall duration |
| memo-08#3 | C02:vercel:pro | 800 s | supported | unsupported | text calls it CPU time; passage gives wall duration |
| memo-08#11 | C06:vercel:hobby | 2048 mb | supported | unsupported | passage gives maximum memory only, not default/min |
| memo-09#2 | C02:vercel:hobby | 300 s | supported | unsupported | text calls it CPU time; passage gives wall duration |
| memo-09#3 | C02:vercel:pro | 800 s | supported | unsupported | text calls it CPU time; passage gives wall duration |
| memo-09#18 | C10:cloudflare:paid | 10000 count | supported | unsupported | text calls it concurrency; passage gives subrequests |
| memo-10#6 | C03:vercel:pro | 1800 s | supported | unsupported | passage ties 1800s/300s to opt-in, not async |
| memo-10#15 | C08:cloudflare:paid | no limit | supported | unsupported | text claims request body unbounded; passage limits it |
| memo-10#16 | C09:vercel:hobby | 30000 count | supported | unsupported | text calls it a request count; passage gives another limit |
| memo-10#17 | C09:vercel:pro | 30000 count | supported | unsupported | text calls it a request count; passage gives another limit |
| memo-10#18 | C10:cloudflare:paid | 10000 count | supported | unsupported | text calls it a request count; passage gives another limit |
| memo-11#10 | C10:cloudflare:paid | 10000 count | supported | unsupported | text calls it a request count; passage gives another limit |
| memo-12#2 | C02:vercel:hobby | 300 s | supported | unsupported | text calls it CPU time; passage gives wall duration |
| memo-12#3 | C02:vercel:pro | 800 s | supported | unsupported | text calls it CPU time; passage gives wall duration |
| memo-13#14 | C09:aws:default | 1000 count | supported | unsupported | 1,000 envs per 10 s is scaling rate, not concurrency limit |
| memo-15#0 | C01:vercel:hobby | 10 s | stale | unsupported | cited passage is an intro line with no values |
| memo-15#4 | C02:vercel:hobby | 60 s | stale | unsupported | cited passage is an intro line with no values |
| memo-16#0 | C01:vercel:hobby | 10 s | stale | unsupported | cited passage is an intro line with no values |
| memo-16#4 | C02:vercel:hobby | 60 s | stale | unsupported | cited passage is an intro line with no values |
| memo-16#9 | C03:vercel:pro | 1800 s | supported | unsupported | 1800s beta stated but passage names no plan |
| memo-16#26 | C08:vercel:pro | no limit | supported | unsupported | about Edge runtime duration, not streamed response size |
| memo-17#0 | C01:vercel:hobby | 10 s | stale | unsupported | cited passage is an intro line with no values |
| memo-17#4 | C02:vercel:hobby | 60 s | stale | unsupported | cited passage is an intro line with no values |
| memo-17#9 | C03:vercel:pro | 1800 s | supported | unsupported | 1800s beta stated but passage names no plan |
| memo-17#11 | C04:cloudflare:paid | 300000 ms | supported | unsupported | text calls it a timeout; passage gives CPU time |
| memo-17#26 | C08:vercel:pro | no limit | supported | unsupported | about Edge runtime duration, not streamed response size |
| memo-17#30 | C10:cloudflare:paid | 10000 count | supported | unsupported | text calls it a request count; passage gives another limit |
| memo-18#0 | C01:cloudflare:paid | no limit | supported | unsupported | states no hard max; no default duration stated |
| memo-18#2 | C03:cloudflare:paid | 30 s | unsupported | supported | waitUntil() extends up to 30 s |
| memo-18#15 | C03:vercel:pro | 1800 s | supported | unsupported | text labels a duration as memory |
| memo-18#20 | C06:vercel:hobby | 1024 mb | unsupported | stale | old page 1024 MB default; current 2 GB |
| memo-18#21 | C06:vercel:pro | 1769 mb | unsupported | stale | old page 1769 MB default; current 2 GB |
| memo-18#24 | C08:vercel:hobby | no limit | supported | unsupported | cited passage not found |
| memo-18#25 | C08:vercel:pro | no limit | supported | unsupported | cited passage not found |
| memo-18#38 | C09:aws:default | 1000 count | supported | unsupported | passage states no value |
| memo-19#2 | C02:vercel:hobby | 60 s | stale | unsupported | cited passage is an intro line with no values |
| memo-19#3 | C03:cloudflare:paid | 30 s | unsupported | supported | waitUntil() extends up to 30 s |
| memo-19#7 | C05:vercel:hobby | 1024 mb | stale | unsupported | passage only gives 250 MB bundle size |
| memo-19#11 | C08:cloudflare:paid | no limit | supported | unsupported | states no duration limit, not response size |
