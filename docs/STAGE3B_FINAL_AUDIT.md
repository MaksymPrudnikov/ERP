# Stage 3B — Final pre-upload audit

> **Historical snapshot (21 Aug 2026).** The acceptance criteria below describe
> the original Stage 3B candidate and must not be used as the current UI
> contract. Since 30 Aug 2026 Lite 1 opens initially, the first blank Order Line
> is created automatically, and laminated film thickness is selected as 1–6
> layers × 0.38 mm. Current behavior and verification are documented in
> `docs/STAGE3B_SALES_MAKEUPS.md` and `docs/GLASS_ERP_HANDOFF.md`.

Date: 21 Aug 2026
Candidate: Draft Sales Orders + order-scoped IGU Makeups
Base: `main`
Recommended branch: `stage3b-order-makeups`

## Result

Local pre-upload audit passed for syntax, module registration, production build, Sales domain invariants and the Shape/Muntin bridge. The authoritative full browser regression remains GitHub Actions (`TARGET=dist node test/run.js`).

## Code audit — fixes made in the final pass

1. **Accordion state**
   - Lite/Cavity sections are closed by default.
   - Only one Makeup section can remain open at a time.
   - The selected section survives internal re-renders while the operator edits it.
   - Switching Makeup or Unit Type resets the accordion to the compact closed state.
   - Collapsed cavity summary now includes spacer, gas and seals.
   - Collapsed Lite summary includes coating/Frit/Spandrel surface information; Frit/Spandrel color is visible in the summary.

2. **Sidebar / long Sales Orders**
   - Shell uses a fixed navigation grid column with the nav color as the column background.
   - The actual navigation remains `position: sticky; height: 100vh; overflow-y: auto`.
   - The dark left column therefore continues visually to the bottom of long orders instead of ending as a rectangular "cut-off".

3. **Visual compactness / color hierarchy**
   - Sales page heading reduced.
   - Lite/Cavity summary rows reduced to 32 px minimum height.
   - Neutral UI surfaces moved from warm beige to cleaner cool neutrals.
   - Orange remains the Makeup/selection accent; dark navy is used for selected surface/category controls.
   - Order-lines table minimum width reduced from 1280 px to 1120 px so a 1440-class desktop does not need unnecessary horizontal scrolling.

4. **Dimension correctness**
   - Fixed an ambiguity where a legacy numeric `width: 34` could be interpreted as 34 sixteenth-ticks instead of 34 inches.
   - `width16` / `height16` remain canonical integer ticks.
   - Legacy `width` / `height` values are parsed as physical inch dimensions.
   - Invalid manual dimension input now clears the stored dimension instead of silently retaining the previous value.

5. **Laminated thickness**
   - Overall Makeup thickness now includes the laminated interlayer thickness.
   - Seed interlayers carry physical thickness: PVB .030 = 0.762 mm, PVB .060 = 1.524 mm, structural .035 = 0.889 mm.

6. **Reference safety / import integrity**
   - Sales entity IDs are normalized to safe identifier syntax.
   - Imported Sales lines must explicitly contain a valid `makeupId`.
   - Imported `width16` / `height16` values are checked as positive integer ticks.
   - Sales editor title now escapes the business number.

7. **Shape / Muntin revision behavior**
   - Existing Production Shape and Adaptive Muntin configurators remain unchanged as engineering engines.
   - Sales bridge was rechecked without a browser: Shape save returns to Sales and synchronizes dimensions; Muntin save returns to Sales and points at the same Shape.
   - A Muntin binding is now visibly `stale` when its pinned Shape revision differs from the line's current Shape revision, not only when the Shape ID differs.

8. **CI safety**
   - GitHub Actions now runs build/test on feature-branch pushes and pull requests.
   - Automatic commit of rebuilt `dist/GLASS_ERP.html` is restricted to successful pushes to `main` only.
   - This lets `stage3b-order-makeups` receive a real green/red CI result before merge without changing the live version.

## Local checks passed

- 44 JavaScript files: `node --check` passed.
- Build manifest: 41 modules registered consistently in build and dev mode.
- Production build: `dist/GLASS_ERP.html` generated successfully (about 416.5 KB in this candidate).
- No `DB.salesConfiguration` / global Sales Configuration store.
- No Makeup Lite/Cavity `<details>` element is emitted open by default.
- Accordion logic test: after opening two sections sequentially, exactly one remains open.
- New Sales Order creates local Makeup A (Double: two lites, one cavity).
- Dimension conversion: 34 in → 544 sixteenth-ticks.
- Stored 544 ticks remain 544 ticks after normalization.
- Legacy numeric width 34 migrates to 544 ticks.
- Surface mapping remains Lite 1 #1/#2, Lite 2 #3/#4, Lite 3 #5/#6.
- Laminated 6 mm + .030 PVB + 6 mm overall thickness = 12.762 mm.
- Import rejects missing Makeup reference.
- Import rejects invalid `width16`.
- Unsafe Sales entity IDs normalize to safe IDs.
- Domain normalization smoke: 300 lines and 900 lines complete correctly (900 is reserve, not the normal operator target).
- Shape bridge integration: saved Shape returns to Sales, line becomes 48 × 36 = 768 × 576 ticks.
- Muntin bridge integration: saved Muntin returns to Sales and references the same Shape.

## Visual audit basis

The visual pass was performed against the previously rendered compact Stage 3B screen plus the final HTML/CSS structure. The final changes specifically address the two user-identified visual problems: the left navigation "cut-off" on long pages and the excessive vertical height caused by all Lite/Cavity forms being open at once.

A full real-browser screenshot of the **final delta** could not be regenerated inside this sandbox because direct browser navigation to local/file/data content is blocked by the environment administrator. This does not affect the production build; GitHub Actions remains the authoritative browser regression environment.

## Merge gate

Do **not** merge directly on upload. Upload the patch to `stage3b-order-makeups` and wait for GitHub Actions. Merge only after:

1. CI is green.
2. Open a new Sales Order manually.
3. Verify all Lite/Cavity accordions start closed.
4. Open Lite 1, then Cavity 1 — confirm Lite 1 closes.
5. Scroll below the viewport — confirm the dark left column continues to the bottom while the menu remains sticky.
6. Configure one line Shape → Save → verify return to Sales and locked dimensions.
7. Configure Muntin on that line → Save → verify return to Sales.
8. Save Draft, reload, and reopen the order.
