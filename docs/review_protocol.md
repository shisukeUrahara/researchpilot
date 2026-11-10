# Review protocol

Some data in this repo is checked by a **model reviewer**: Claude subagents, not a human. Every row they
write says `"reviewer": "model"`. Nothing here is presented as a human label.

## What is reviewed

| Item | When | Sample | Output |
|---|---|---|---|
| Gold facts (`data/gold/facts.v1.jsonl`) | before any eval run | every row | `data/labels/gold_review.jsonl` |
| Decision memos | after the frozen eval | 20 memos, spread over arms and scenario kinds | `data/labels/memo_review.jsonl` |

## How a reviewer works

1. It gets the item, the passages it cites (full passage text), and this rubric. It does not see the
   grader's verdict or which arm wrote a memo.
2. It answers one row per item in JSONL.
3. A fix is applied by a person-run command (`git diff` shows it), never silently.

## Rubric: gold facts

For each gold row (provider, criterion, plan, conditions, value, passage_id):
- `ok`: the passage states exactly this value for exactly this plan and conditions.
- `fix`: the passage states a different value, plan or condition; `fix` holds the corrected row.
- `drop`: the passage does not state this at all.
- `stale`: the value is from an older page and a newer official page replaces it (`superseded_by` must be set).

## Rubric: memos

For each material claim in a memo (a number or "no limit" for a provider, criterion and plan):
- `supported`: the cited passage states it for that plan.
- `unsupported`: no cited passage states it, or it states something else.
- `stale`: it uses a superseded value without saying a newer page differs.
For each memo also: `verdicts_ok` (true/false) against the fit rules' expected verdicts, and a one-line note.

## JSONL fields

```json
{"item": "<gold row key or memo run id>", "verdict": "ok|fix|drop|stale|supported|unsupported", "fix": null, "note": "one line", "reviewer": "model"}
```

## Agreement

The memo review is compared with the code grader (`src/core/grade/`). The agreement rate and every
disagreement are published in `docs/memo_review.md`. A disagreement is never resolved by editing the
reviewer's row.
