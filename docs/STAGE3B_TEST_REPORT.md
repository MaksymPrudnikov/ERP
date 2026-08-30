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

## Follow-up verification — 30 Aug 2026

The earlier sandbox limitation above is historical. The Sales Makeup refinement was verified locally with a real Chromium runtime:

- `src/index.html`: **222 passed, 0 failed**;
- generated `dist/GLASS_ERP.html`: **222 passed, 0 failed**;
- browser walkthrough: new Sales Order starts with Lite 1 open and one blank line;
- glass selection starts with Clear and keeps stocked products before pre-order;
- Cavity follows Width → Spacer → Gas → Sealant with fixed PIB hidden from the operator;
- Laminated renders independent outer/inner plies, independent heat treatment, mixed interlayers and the 1–6 layer thickness selector;
- Frit is selected inside TYPE for one ply, exposes `Outside film` / `Into film`, and does not activate Frit on the other ply;
- the feature branch was merged with current `main`; the generated-dist conflict was resolved by rebuilding from source, not by hand-editing HTML.

Git reference at verification: PR #28, branch `codex/laminated-frit-type`, functional commit `5d04645`, conflict-resolution merge commit `b48309b`.
