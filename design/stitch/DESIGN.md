# Design System: ResearchPilot

Same family as EvalForge, Atlas "Evidence" and PromptFlight "Afterglow". Palette and type are copied from EvalForge.

## 1. Visual Theme & Atmosphere
A research instrument that shows its work. Calm night canvas, one restrained violet accent, and evidence that reads like a lab notebook. The faint afterglow lives only in the page background, never on buttons or text.
- Density 7 (timelines and evidence tables are data-dense; the memo is airy)
- Variance 6 (asymmetric splits; nothing centered for the sake of it)
- Motion 4 (new timeline rows fade in; no theatrics)
The signature idea: **every number in the memo is one click from its quote, its page date and the tool call that fetched it**.

## 2. Color Palette & Roles
Dark
- **Night Canvas** (#0b0c12) with a soft violet haze top-left at 12% and a blue haze bottom-right at 8%
- **Panel** (rgba(255,255,255,0.035)) with **Hairline** (rgba(255,255,255,0.08))
- **Inset** (rgba(255,255,255,0.025)) — quotes, source passages
- **Paper Ink** (#ecedf3) primary text · **Steel Ink** (#9ba1b4) metadata
- **Afterglow Violet** (#9b8cf2) — the only accent: active tab, focus ring, selected row, passage-id chips
Light
- **Mist Canvas** (#f6f6fa), **Paper** (#ffffff), **Hairline** (#e4e4ee), **Inset** (#f3f3f8)
- **Ink** (#14151d), **Steel Ink** (#5a5f72), **Violet ink** (#5b45d1) on **Violet wash** (#efecff)
Verdict and status (ink tones on 14% tints, never solid fills)
- **Verified / supported / used** teal (#2dd4bf dark / #0f766e on #e6f7f4 light)
- **Awaiting approval / superseded / near limit** amber (#f2b84b dark / #8a5300 on #fdf3dc light)
- **Blocked / rejected / limit hit** coral (#f87171 dark / #b4232a on #fde8e8 light)
- **Unknown** steel ink with a dashed outline (an unknown never looks like a fact)
- Arms: **bounded** violet, **ablation** sky (#38bdf8 / #0369a1), **naive** steel, **bounded-permissive** coral — small dot + mono name

## 3. Typography Rules
- **Display:** Geist 300–500, tracking -0.02em, tabular numerals for counts.
- **Body:** Geist 15px, line-height 1.6, max 68 characters per line.
- **Mono:** Geist Mono for passage ids (`vc-limits@2026-08-24#max-duration`), cell ids (`C02·vercel·pro`), shas, run ids, tool names, stop reasons (`NO_PROGRESS`).
- **Micro labels:** 11px uppercase, letter-spacing 0.08em, Steel Ink.
- Banned: Inter, serif, gradient text, all-caps headlines.

## 4. Component Stylings
- **Stop banner:** wide card; left: the stop reason as a big word (`VERIFIED`, `NO_PROGRESS`, `TIMEOUT`, ...) in its status ink; right: steps used / max, tool calls / max, cost / cap, run id in mono.
- **Budget meter:** 4 thin bars (steps, tool calls, virtual time, cost), each "used / max". Turns amber at 80%, coral at the limit.
- **Plan board:** 4 columns: planned, running, verified, blocked. Cards show the cell ids they target (mono chips).
- **Timeline row:** step number · node (`act`, `execute`, `verify`...) · tool icon + tool name in mono · safe args (short) · result pill (`ok`, `tool_not_allowed`, `tool_unavailable`, `tool_malformed`) · duration in virtual ms.
- **Blocked row:** coral left rule, "Blocked by executor: send_email is not on this run's allowlist", attempt counted.
- **Claim:** memo number underlined; click → drawer: quote (inset block), passage id chip, source + page date + date kind pill (`page` / `retrieved`), tool event id, cache key.
- **Conflict pair:** two inset blocks side by side, each with its source, kind pill (`docs`, `changelog`, `archive`) and date; the winner gets a teal "used" pill, the other an amber "superseded" pill.
- **Unknown cell:** dashed outline, text "unknown" + reason (`price not in corpus`, `source unavailable`, `deadline reached`).
- **Buttons:** flat. Primary = violet fill, dark ink text, 10px radius. Secondary = hairline outline. Approve and cancel = outline + confirm dialog. No glows.
- **Cards:** 20px radius, hairline border, no shadow in dark, whisper shadow in light. Long lists use hairline dividers, not cards.
- **Pills:** fully rounded, 11px mono, 14% tint + matching ink.
- **Loading:** skeletons shaped like the content. **Empty:** one sentence + the exact next command (for example `pnpm rp run --brief three-minute`).

## 5. Layout Principles
- Max width 1400px, 12-column grid, 24px gutters.
- Top bar: wordmark "ResearchPilot" left; pill tabs (Run, Memo, Evals); right: mode chip ("replay · no key" or "live"), sun/moon toggle.
- Version strip under the top bar: source manifest sha · scenario set sha · prompt versions · model spec · run id (mono, steel ink, wraps on phone).
- No centered hero. No row of three equal cards. Use 8/4 or 7/5 splits.
- Below 768px: single column, tabs become a bottom tab bar with 3 icons, drawers become bottom sheets, touch targets 44px, wide tables scroll inside their card.

## 6. Motion & Interaction
- 150ms fades for pills and new timeline rows; panels use ease-out springs.
- Clicking a memo number opens the claim drawer with the quote highlighted.
- Animate only transform and opacity. Respect reduced motion.

## 7. Anti-Patterns (Banned)
- No invented metrics, confidence scores or latencies; every number in a mock is labeled "sample".
- No avatars, photos, emojis, stock illustrations, vendor logos.
- No neon, outer glows, gradient text, purple button glow, pure black.
- No three equal feature cards, no centered hero.
- No marketing copy ("seamless", "elevate", "unleash", "next-gen", "AI-powered").
- No overlapping panels that hide text.
- No provider "winner" badges: verdicts are per workload, with dates.
