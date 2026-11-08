# Sales

Orders and quotes: customer, makeups (what a unit is built from), lines with sizes, work and price. This page covers
the price windows people edit most: order surcharges, line services and how a makeup is written.

## How a makeup is written

A makeup in the strip above the lines, in an order line, on a sticker, packing slip, invoice and Work order is one
line: lites joined by " / " with the cavity (spacer and gas) between them.

- Plain glass — its name: inside (Sales, shop, drawing) the Short name, to the customer (documents, packing slip,
  sticker) the Name. Documents add the heat treatment: `T`, `T+HST`, `HS`.
- **Laminated** (owner, 8 Nov 2026, variant B1) — `LAM`, total thickness and the build in brackets: glass +
  interlayer + glass. Example: `LAM 12.76 (6CLEAR + 0.76 EVA-CL + 6CLEAR)`; in an IGU the same text stands in place
  of the lite: `6E180ESC / 17/32 Black Warm Edge ARG / LAM 12.76 (6CLEAR + 0.76 EVA-CL + 6CLEAR)`.
  - Thickness is nominal: 6 + 6 + 0.76 = 12.76 (how the glass is called), not measured.
  - Interlayer — the thickness of all its layers (2 × 0.38 = 0.76) and its code; the customer sees its name.
- The makeup code in the strip (A, MU-2…) always stays on one line; a long description ends with an ellipsis.

## Surcharges window — order surcharges

The Surcharges button above the lines. Surcharges are Data → Works items with a rule (percent or minimum area).
Numbers in the window apply to this order only: Data → Works, price lists and other orders do not change. Empty —
the catalog number, 0 or the switch — not charged, Reset to Catalog — back to the catalog.

### Minimum area — overall, per makeup and per material

Owner, 8 Nov 2026: the overall minimum is visible, details open on click.

1. **Overall** — the Minimum area row, e.g. 4 ft²: a unit under 4 ft² is billed as 4 ft².
2. **▸ By makeup** under the name opens the makeups of this order (only those used in lines). Each has its own
   field: empty — the overall minimum; 1 — units of this makeup are billed from 1 ft²; 0 — no minimum. This order
   shows how many lines of the makeup were raised to the minimum.
3. **▸** next to a makeup opens its build: glass (both plies for laminated), interlayer, spacer. Each material has
   its own minimum in its sales unit: ft² for what is sold by area, a length unit (in, ft, m) for what is sold by
   length. Empty — as the makeup. Materials sold per piece or by weight are not listed: they have no minimum.

How it is calculated:

- Unit Billable Area = the larger of the rounded area and the makeup minimum (empty — the overall one). All
  materials and per-ft² work use it.
- A material with its own minimum is billed from the unit's rounded area (by length — from its own length), but not
  below its minimum. Example: makeup 4 ft², glass 6CLEAR has its own 2 ft² — a 0.9 ft² unit pays the glass for 2 ft²
  and the rest for 4 ft².
- The catalog minimum on the material card (Data → Materials: Min area, Min charge) works as before while the
  material has no number of its own in the order.
- Changes go to the order Activity log: "Minimum area · 3CL: — → 1 ft²".

## Line Services / Processing window

The services button in a line. Line work: from the drawing (holes, hinges and other hardware, radius corners,
cutouts, notches, sandblasting), edgework, from the makeup (frit, spandrel, Heat Soak) and added by hand
(+ Add service).

Each row has two light icons on the right (owner, 8 Nov 2026, variant E2):

- **↺** — Use order / catalog rate: drop the line rate, back to the order or catalog rate. Grey until the line
  rate is changed.
- **×** — remove the work. For work from the drawing — Remove from drawing: the work leaves the price and the
  drawing of **this line** (all its elements, e.g. all 4 holes of that size). If the drawing is shared with other
  lines or comes from the library, the line gets its own copy; other lines do not change. For work added by hand —
  just remove it.
- Edgework and makeup work have no ×: edges change in Edgework, frit and spandrel in the makeup.
- Red only on hover over ×. A line already in production (glass scanned) cannot be edited.

## Where the product is now — Production window

Owner, 8 Nov 2026: a customer calls the front desk, gives the PO and asks where the product is.

- Find the order by PO: ▾ on the PO column → the number. Tick the order and press the **factory** icon in the header
  next to ✂ (Cut preview) — or right-click the order → **Production**.
- The window shows the order lines (number, mark, size, units) and under each the glass of the unit (glass code, Lite,
  how many); columns are the route stations. The cell is the same as in Production → In production: a **number** — glass
  waiting at this station now, under it the **dolly or skid** and how many are on it (click — the carrier window: what
  is on it in order, where it stands); **✓** — all passed; **·** — not there yet. The order line is the total of its
  glass.
- An order not in the shop yet (not batched) shows "Not in production yet" and the order status.
