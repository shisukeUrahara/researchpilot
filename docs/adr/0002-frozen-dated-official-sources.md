# ADR 0002: Frozen, dated official sources

## Status
Accepted, 2026-11-11.

## Context
Platform limits change: Vercel's Hobby max duration was 60 s on the 2025-03-08 copy of its limits page
and is 300 s on the 2026-08-24 page. An agent that reads live pages gives answers nobody can reproduce;
one that reads an old copy gives wrong answers with confidence.

## Decision
- The agent reads saved copies of 6 official sources (`fixtures/sources/manifest.json`): 3 limits pages,
  2 Vercel changelogs and one Wayback copy of the old Vercel page. Each has a page date and a date kind
  (`page`, or `retrieved` when the page states none, like AWS).
- Only short passages (≤ 80 words, limit tables and plan notes) are committed; full pages stay in the
  gitignored `cache/raw/`. `rp verify` checks every passage line against the raw page and its sha.
- Every search result shows its source kind and page date.
- Conflict rule: current docs beat a changelog (which only feeds the extended-duration cell), which beats
  an archive; within a kind the newer page date wins. With the verifier on, an archived copy never gives
  a cell its current value: it only appears as the superseded side of a conflict.
- `rp fetch-sources` reports drift and keeps the frozen copy unless told `--accept`.

## Consequences
- Answers are dated: "per the official pages as of these dates", never "the limit is".
- Found while building: plain keyword search ranks the 2025 copy first for "Vercel maximum duration Hobby
  Pro". The freshness rule is what keeps that from reaching the memo.
