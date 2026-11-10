# Notice

ResearchPilot is an independent portfolio project. It is not affiliated with, endorsed by, or a partner of
Cloudflare, Vercel or Amazon Web Services. Nothing it outputs is a recommendation.

## Third-party sources

The agent reads saved copies of public documentation pages. Full pages are downloaded to the gitignored
`cache/raw/` folder and are **not** in this repository. Only short passages (at most 80 words each, limit
tables and plan notes) are committed in `fixtures/sources/passages/`, with their source, date and sha256 in
`fixtures/sources/manifest.json`.

| Source id | Page | License / terms |
|---|---|---|
| `cf-limits` | developers.cloudflare.com/workers/platform/limits/ | Cloudflare docs, CC BY 4.0 (github.com/cloudflare/cloudflare-docs). Passages quoted with attribution. |
| `vc-limits` | vercel.com/docs/functions/limitations | © Vercel, Inc. Short quotations with attribution. |
| `vc-limits-2025` | web.archive.org/web/20250308002203/https://vercel.com/docs/functions/limitations | © Vercel, Inc.; copy held by the Internet Archive. Linked, not re-hosted; short quotations. |
| `vc-cl-30min` | vercel.com/changelog/vercel-functions-can-now-run-up-to-30-minutes | © Vercel, Inc. Short quotations with attribution. |
| `vc-cl-fluid` | vercel.com/changelog/higher-defaults-and-limits-for-vercel-functions-running-fluid-compute | © Vercel, Inc. Short quotations with attribution. |
| `aws-quotas` | docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html | © Amazon Web Services, Inc. Short quotations with attribution. |

Page dates are the pages' own dates where they state one. The AWS page states none, so its date is our
download date and is marked `retrieved`.

## Synthetic material

Files under `fixtures/synthetic/` (planted notes, fake values, dead-end pages) are written for testing.
Each starts with `SYNTHETIC` and is never presented as an official source.
