## Should

### S1. Unify deployment and docs configuration
- Goal: Prevent onboarding/deploy confusion.
- Deliverables:
  - Align `README.md` with actual deployment target.
  - Clarify role of `vercel.json` and `public/_redirects`.
  - Add release + rollback runbook section.
- Definition of done:
  - New member can run locally in <= 30 minutes from README.
  - Build/deploy steps reproduce in CI and manual run.
- Owner: Infra/Frontend
- Estimate: 1-2 days

### S2. Resolve React Router v7 future-flag warnings
- Goal: Reduce upgrade risk.
- Deliverables:
  - Audit route behavior impacted by v7 flags.
  - Enable and validate future flags or document defer policy.
  - Add route regression tests for top/detail/admin/404 paths.
- Definition of done:
  - Warning removed or explicitly tracked with migration rationale.
  - Route regression tests pass.
- Owner: Frontend
- Estimate: 1-3 days

