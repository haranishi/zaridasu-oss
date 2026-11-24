> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# 2-Week Sprint Plan

Period: 2026-03-11 to 2026-03-24
Sprint objective: Improve reliability and scalability without changing core product scope.

## Sprint goals
1. Build a reliable test safety net for high-risk flows.
2. Fix map bounds filtering semantics for user trust.
3. Start migration of heavy stats aggregation to DB side.

## In-scope backlog items
- M1. Expand regression tests for critical user flows.
- M3. Correct bounds filtering behavior in map/list.
- M2 (phase 1). Design and partially migrate stats aggregation.
- S1 (partial). Documentation alignment draft.

## Out-of-scope
- New product features unrelated to quality/scalability.
- Full analytics/telemetry platform setup.

## Week 1 plan (2026-03-11 to 2026-03-17)
1. Test baseline and framework hardening
- Create shared Supabase mocks and fixtures.
- Add integration tests for auth and post creation.
- Add coverage threshold in test config/CI.

2. Map bounds behavior implementation
- Add server-side bounds query path when bounds mode ON.
- Unify count labels and pagination reset behavior.
- Add integration tests for bounds mode transitions.

## Week 2 plan (2026-03-18 to 2026-03-24)
1. Stats migration phase 1
- Create DB-side aggregation contract (RPC/view) for monthly/species/municipality.
- Wire `useStats` to new endpoint behind a feature toggle.
- Validate against known dataset.

2. Documentation and release prep
- Update README deployment section to match actual environment.
- Add release/rollback runbook draft.
- Run full regression and coverage checks.

## Capacity and ownership
- Frontend owner:
  - M1 tests
  - M3 map/list behavior
  - S2 route regression checks (if capacity)
- Backend owner:
  - M2 DB aggregation migration and indexing
- Shared:
  - S1 docs/deployment consistency

## Risks and mitigations
1. Risk: DB aggregation changes can affect RLS behavior.
- Mitigation: add dedicated migration test queries and verify role access.

2. Risk: Bounds query can increase request frequency.
- Mitigation: debounce bounds events and dedupe repeated requests.

3. Risk: New tests become flaky due to timing/async UI.
- Mitigation: avoid real timers/network, use stable mocks and deterministic waits.

## Definition of sprint done
1. `npm test` and coverage checks are green in CI.
2. Bounds mode returns only in-bounds records and counts are consistent.
3. Stats migration phase 1 is merged with validation evidence.
4. README deployment section is no longer contradictory.

## Demo checklist
1. Show failing-then-passing regression test example.
2. Show map bounds ON/OFF behavior and count consistency.
3. Show old vs new stats result comparison on seeded data.
4. Show updated docs and release steps.
