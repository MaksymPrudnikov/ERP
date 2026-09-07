# Stage 3B — Draft Sales Orders / Order-scoped IGU Makeups

Status: implemented 21 Aug 2026; Muntin ownership and UI updated 7 Sep 2026 in PR #54. Current decisions take precedence over the dated verification notes below; see [the handoff](GLASS_ERP_HANDOFF.md).

## Frozen domain boundary

- There is **no global Configuration Library**.
- Every `SalesOrder` owns its own `makeups[]` (A, B, C…). Codes are local to the order and may repeat in another order.
- Every physical order line stores a stable `makeupId` plus qty, exact dimensions on the 1/16″ grid, mark and notes.
- The line references Shape through `shapeRef`. Muntin configuration belongs to `shape.muntin`; it is not a separate saved definition or a Makeup/Cavity property.
- Shape remains the source of Width/Height. The shared Muntin engine computes bar geometry from the Shape through a temporary adapter object.
- There is no separate Muntin configurator, drawing or print flow. Legacy test `muntinDef` and line `muntinRef` / `muntinId` fields are discarded during normalization; orders, Shapes and `shape.muntin` survive. `REFERENCE_VERSION` stays 7.

## Makeup Builder UX

The builder follows the compact operator flow agreed from the IGU Builder reference:

- Unit type: Single Lite / Double / Triple.
- Lite category: Vision / Spandrel / Laminated.
- Vision TYPE: Low-E / Reflective / Frit / Uncoated.
- Glass Product is the concrete catalog product after Manufacturer / Thickness / TYPE filtering.
- Heat Treatment is independent from the stock glass product.
- Lite surfaces are deterministic from exterior to interior:
  - Lite 1 → #1 / #2
  - Lite 2 → #3 / #4
  - Lite 3 → #5 / #6
- Low-E/Reflective coating surface, Frit surface and Spandrel surface are stored independently.
- Frit has product, colour, pattern, dot diameter, reference corner, margins and production marking. The obsolete `coverage` field is not part of the current contract.
- Spandrel has product and color.
- Laminated lite is a real stack: independent outer/inner plies plus repeatable interlayer rows. Each ply has its own Manufacturer, Thickness, TYPE, Glass, Heat Treatment and optional Frit specification.
- Laminated TYPE uses the same `Low-E / Reflective / Frit / Uncoated` buttons as Vision. Frit applies only to the selected ply and supports `Outside film` (default) or `Into film`.
- Interlayer types may be mixed. Each row selects 1–6 layers at 0.38 mm per layer: 0.38 / 0.76 / 1.14 / 1.52 / 1.90 / 2.28 mm.
- Each cavity is selected as Width → compatible Spacer system → Gas → Sealant. PIB is the fixed primary seal and remains in the saved specification without a separate operator field.
- Lite 1 is open initially for Single, Double and Triple. Moving to another Lite/Cavity collapses the previous section; only one section can be open at a time and collapsed rows retain a production summary.
- The left navigation rail remains viewport-sticky while its dark column background continues to the bottom of long Sales Orders.

## Master Data

`src/erp/masterdata/glass.js` introduces prototype Master Data collections for glass, heat treatment, spacer variants, gases, sealants, interlayers, frit and spandrel products.

The current catalog is a **starter seed**, not a complete import of the external IGU Builder catalog. The schema is deliberately ready for later enrichment with:

- stock / order / special order / inactive status;
- supplier and alternative supplier;
- lead time;
- manufacturer and stock sheet sizes;
- quantity on hand;
- purchase cost/currency;
- branch availability and substitutions.

Current selection order is operator-oriented: Clear first, then stocked products, then pre-order products. Low-E/Reflective coatings with stocked variants precede coatings available only by pre-order. A pre-order product remains selectable.

## Sales entry

Every new Sales Order starts with one blank Order Line. Order lines support compact keyboard-first entry and Excel paste. The subsequent Excel-paste redesign is already recorded in the handoff; the original request following the 30 Aug laminated refinement is not a new pending task.

Dimensions are stored canonically as integer sixteenths (`width16`, `height16`) so fractional inch input does not introduce floating point drift.

## Shape / Muntin bridge

- `+ Shape` opens the existing Production Shape UI.
- Saving Shape returns to Sales, records a reference and synchronizes Width/Height from Shape.
- In the Shape editor, `+` in the Muntin header adds the layout and opens its settings; `−` removes the layout and its dimension overrides. The chevron collapses settings without deleting the layout. There is no internal enable checkbox.
- Bars and dimensions appear on the common production drawing and printout. Equal-clear layout places the less frequent gap size near the center, preserving mirrored pairs whenever possible on the 1/16″ grid. Manual axes take precedence.
- A Shape referenced by a Sales Order cannot be deleted. There is no independent Muntin reference to guard.
- The Muntin charge is calculated per order line from the number of sections. The default rate is CAD 4.50 per section (`SALES_SERVICE_RATE_TABLE.muntinSection`), with a line-level override; engineering modules contain no prices.

## Verification

- JavaScript syntax check across source/test/build files.
- Build manifest consistency check.
- Production `dist/GLASS_ERP.html` build.
- Real Chromium smoke of Sales, surfaces, Triple, Shape bridge with embedded Muntin, save and JSON round-trip.
- English UI residue check across active screens.
- 300-line normal-volume render and 900-line reserve/stress render.
- Invalid import with a missing Makeup reference is rejected.

Current candidate PR #54 passed **409/409** checks on each of `src/index.html` and the generated `dist/GLASS_ERP.html` on 7 Sep 2026, using Chromium from Playwright 1.55.0. This includes legacy-data cleanup, header controls, central gap geometry and print consistency. Dense-grid label auto-placement remains a separate open task.

Historical verification: the 30 Aug 2026 refinement passed **222/222** checks on `src/index.html` and **222/222** on the generated `dist/GLASS_ERP.html`. It was merged through PR #28 (`codex/laminated-frit-type`). CI runs on feature-branch pushes and pull requests; only a successful push to `main` is allowed to auto-commit the rebuilt `dist`.
