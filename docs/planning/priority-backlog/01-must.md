## Must

### M1. Expand regression tests for critical user flows
- Goal: Catch breaking changes before release.
- Deliverables:
  - Add integration tests for post creation flow.
  - Add auth flow tests (login/signup/guard behavior).
  - Add map-list sync tests (filters, count consistency, bounds mode).
  - Add one admin flow test (post delete or report resolve).
  - Add shared Supabase mocking utility for tests.
- Definition of done:
  - `npm test` passes in CI.
  - Coverage threshold enforced: statements >= 80, branches >= 70.
  - At least 8 new tests and 3 failure-path tests.
- Owner: Frontend
- Estimate: 5-8 days
- Dependencies: test utilities in `src/test/setup.js`

### M2. Move heavy stats aggregation to DB side
- Goal: Keep stats accurate and fast as data grows.
- Deliverables:
  - Replace client-heavy aggregation in `useStats` with RPC/view queries.
  - Add DB aggregation endpoints for species/monthly/municipality rank.
  - Remove core-stat dependency on hard query caps.
  - Add/verify indexes for `created_at`, `municipality`, `species`.
- Definition of done:
  - 10k-row fixture returns correct values.
  - P95 API latency <= 500ms for stats payload.
  - No mismatch against validation dataset.
- Owner: Backend + Frontend
- Estimate: 4-6 days
- Dependencies: Supabase migration + RLS review

### M3. Correct bounds filtering behavior in map/list
- Goal: Ensure visible map area equals filtered result semantics.
- Deliverables:
  - When bounds filter is ON, fetch by map bounds from server.
  - Clarify counters: all, visible, and bounds-filtered counts.
  - Reset pagination state on filter-mode transitions.
  - Keep behavior identical on mobile and desktop tabs.
- Definition of done:
  - No out-of-bounds post appears in bounds-filter mode.
  - Count badge and list result count always match.
  - Integration tests cover pan/zoom + filter toggle behavior.
- Owner: Frontend
- Estimate: 3-5 days
- Dependencies: query builder update in `HomePage.jsx`

