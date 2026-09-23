# Real-history regression correction, 2026-09-23

This iteration uses the existing private interview corpus and the identical current-decision input. No additional biographical answers were requested. Original source text, sealed histories, baseline answers and previous retrieval sessions were not rewritten.

## Implemented

- `content-overlap-v2`: filters conversational filler and standalone character fragments; preserves exact compound words independently of host ICU segmentation; keeps the existing eight-field weights. A subject, goal or option must have common content to qualify. A shared media platform alone is insufficient.
- Each displayed result is a candidate, not a predicted outcome. Single-field hits explicitly say the available conditions are insufficient. Current and historical source sentences are shown side by side. Historical outcomes and later evaluations are not used for ranking.
- Timeline groups date-uncertain past records separately before T0. Only valid year/month/day representations are used as date keys. Comparison bounds never become fabricated persisted dates. Date/type conflicts are shown separately.
- All historical planes can be selected for comparison; the interface no longer silently restricts comparison to the oldest plane. All ten original baseline answers are available for inspection.
- Local calendar dates replace UTC substring display. The administrator's local-only test scenario separates the decision viewpoint from actual collection timestamps. No normal registration/API request can choose a historical T0 date.
- Simulated retrieval filters events after the scenario cutoff and ambiguous intervals crossing it. Undated events require an explicit past-plane relation; no date is inferred from their titles.
- Recall provenance is derived from the stored source, not a client-supplied sourceKind label.
- Latest result replay survives reload and does not issue another write or rerank old sealed sessions.

## Local-only test scenario

An administrator can explicitly create the ignored `.data/local-test-scenario.json` with `enabled: true`, `scope: local-personal-test`, a unique id, asOfDate, timeZone, t0PlaneId and recordIds. It is read only for the personal view when `TMM_STORAGE=local-demo`; no UI or request parameter can enable it. It does not change the OS clock, the normal T0 creation rule, or recordedAt. Sanity/production and synthetic-demo views do not load it. Disable through the local configuration, not by editing sealed records.

## Verification

- 35 automated tests passed: 16 existing constitution tests, 17 content/time regressions, 2 service-boundary tests.
- Type checking, lint, and optimized production build passed.
- Real browser run used the same stored question and private corpus. All ten histories remain stored; three content-supported candidates were returned rather than ten filler-word matches.
- Browser checked: 8 dated past planes + 2 date-uncertain past planes + 1 T0; all 10 past planes selectable; original baseline answers unchanged; scene viewpoint and local acquisition date separate; result replay does not duplicate writes; no horizontal overflow at 390px; no page errors.
- All 178 pre-existing local documents compared equal after this iteration. The only added archive document was a new empowermentSession with algorithmVersion and scenario metadata.
- No private content uploaded to public Sanity production; schema additions are source changes only, not a production deployment.

Private logs, before/after verification, and browser screenshots are kept under `.data/product-fix-20260923/` and excluded from Git. Private corpus contents are not copied into committed tests or this document.

## Explicit remaining limitation

This is conservative, explainable lexical candidate retrieval, not a validated semantic decision model. The three candidates have single-field evidence and are labelled accordingly. General semantic extraction of a free interview is not proven by this test; the existing imported classification was assistant-assisted. Cross-event cognitive conclusions, causal findings, personality judgements, probabilities of success, and a global product PASS are not claimed.
