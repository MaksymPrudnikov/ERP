# Stage 3B verification report

Date: 21 Aug 2026

Candidate: Draft Sales Orders + order-scoped IGU Makeups.

The current detailed audit is `docs/STAGE3B_FINAL_AUDIT.md`.

## Local checks passed

- 44 JavaScript files pass `node --check`.
- Build manifest: 41 modules registered consistently in build and dev mode.
- `dist/GLASS_ERP.html` builds successfully.
- Sales domain invariants pass local VM checks, including local Makeup A, 1/16″ storage, deterministic surfaces, independent Frit/Spandrel/coating surfaces, explicit Makeup references and import guards.
- Legacy numeric inch migration is separated from canonical `width16`/`height16` ticks.
- Laminated overall thickness includes interlayer thickness.
- 300-line normal domain-volume smoke and 900-line reserve domain-volume smoke pass.
- Shape → Sales and Muntin → Sales bridge logic passes a no-browser integration test using the real engineering modules.
- Make-up accordions start closed and single-open behavior passes a logic test.
- Feature branches now receive CI; rebuilt `dist` auto-commit remains main-only.

## Browser CI note

The full Node/Playwright regression suite cannot be executed in this sandbox because the Playwright dependency/browser environment is unavailable here and direct local browser navigation is policy-blocked. GitHub Actions installs Playwright Chromium and runs `TARGET=dist node test/run.js`; that result is the merge gate.
