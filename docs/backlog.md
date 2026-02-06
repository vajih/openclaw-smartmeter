# Backlog

Items from SPEC Phase 1-3 that are deferred. Each references the SPEC line.

---

## Phase 1 — Deferred Analysis Features

### Classifier enhancements

- **Prompt length as feature** (SPEC line 30)
  Spec says "keyword matching + prompt length + tool usage as features."
  Currently only keyword matching is implemented. Adding prompt length
  as a tiebreaker or weight multiplier would improve classification of
  short config commands vs. long code tasks.

- **Tool usage as feature** (SPEC line 30)
  If session logs include tool invocation records (bash, file read/write,
  web search), these signals could improve classification. Blocked on
  knowing the JSONL format for tool use entries.

### Success rate inference

- **Re-prompt timing analysis** (SPEC line 34)
  Spec says: "infer from: no errors, no user re-prompts within 5min."
  Requires pairing sequential user messages with timestamps and detecting
  rapid follow-ups as failure signals. Currently stubbed as `null`.

- **User satisfaction signals** (SPEC line 37)
  "Explicit positive/negative feedback, task completion." Requires
  parsing user messages for sentiment or explicit feedback patterns
  (e.g. "thanks", "that's wrong", "try again").

### Skill analysis

- **Skill co-occurrence patterns** (SPEC line 42)
  "Which skills are used together." Requires skill parsing first (currently
  stubbed), then building a co-occurrence matrix.

- **Skill parsing from logs** (SPEC line 40)
  Stubbed — awaiting sample of skill invocation format in JSONL logs.

---

## Phase 3 — Deferred CLI Commands

- **`smartmeter diff [v1] [v2]`** — Compare two config versions. Needs config versioning infrastructure.
- **`smartmeter costs --by-project`** — Per-project cost breakdown. Needs project-level data in session logs.
- **`smartmeter config set KEY VALUE`** — Directly set config keys. Needs settings infrastructure.
- **`smartmeter history`** — Show config change history. Needs version tracking.
- **`smartmeter iterate`** — Re-run analysis (alias for `analyze`).
- **`smartmeter learn`** — Phase 4+ ML-based optimization.

---

## Phase 4+ — Future Phases (not in scope)

- OpenRouter API integration (SPEC Phase 4, lines 324-356)
- Telegram alerts (SPEC Phase 5, lines 358-412)
- Chrome extension (SPEC Phase 6, lines 415-434)
- ML model training (SPEC lines 575-578)
- Team features (SPEC lines 580-582)
- Enterprise features (SPEC lines 584-586)
