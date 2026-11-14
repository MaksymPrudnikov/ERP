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

## Shape area — by the cutting rectangle

Management, 9 Nov 2026: shape glass is billed to the customer by the rectangle it is cut from, not by the shape's
bounding size.

- The cutting rectangle comes from the shape cutting module: finished size plus the **Safety Border** on its sides.
  The module puts the border where an edge is angled or an arc (by thickness: 3–8 mm — 1″, 8–15 mm — 1 1/2″); a
  side lying on the bounding edge gets none. The border is edited in the shape itself (Shape → Production → Safety
  Border) — billing takes the same number. The CNC grinding allowance (1/4″) lies inside and is not added.
- Each side up to a whole inch, area up to a tenth — the same as a rectangle.
- Example: raked 40 × 60 (short side 54), 6 mm — border on top 1″ → 40 × 61 = **17.0 ft²** (16.7 by the bounding
  size); 10 mm — border 1 1/2″ → 40 × 61 1/2 → 40 × 62 = **17.3 ft²**.
- CNC processing (polish and so on) — by the shape contour, up to a whole inch, as before.
- A shape is anything that is not a rectangle, and DXF. A rectangle with holes, cutouts and radii — by its size.
- In the line, under the Rounded Area number — `cut 40 × 61`; the area window (click the cell) shows the math:
  finished size + border by side → cutting rectangle.
- An order created before 9 Nov 2026 still counts by the bounding size — its amounts do not change.

## Shape: Safety Border — the shape's cutting border

The line's shape editor → Production view → **Safety Border** block. It is spare glass around the shape for safe
cutting and breaking along angled edges and arcs. It is not part of the cut contour: the layout keeps this room on the
sheet.

- **Base** — empty = **AUTO** by thickness: 3–8 mm — 1″, 8–15 mm — 1 1/2″, from 15 mm — 3″. A number in Base is
  an **OVERRIDE** for all angled edges of the shape.
- The field at each edge is that edge's own border, empty — as Base. A straight edge on the bounding edge gets none
  (OFF). **Reset** returns everything to AUTO.
- The border lies on a side of the bounding box (left, right, top, bottom) from the farthest point of the angled
  edge, at 90°.
- The same border gives the cutting rectangle for billing ("Shape area" above): an edit here changes both the
  layout and the billed shape area.
- Next to it — **Cutting allowance** (CNC stock per side): the piece is larger than finished by the edge removal; it
  is not part of the billed area.

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
- Released with a balance ("… anyway" in the balance window) — a **Released with balance due** line in the Activity
  log: amount, button, who pressed ([finance.en.md](finance.en.md), "Release with a balance due").

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
- The window shows the order lines (number, mark, size, units) and under each the glass of the unit (glass code and Lite,
  the glass's own size, how many; in a step unit a size different from the line is highlighted); columns are the route stations. The cell is the same as in Production → In production: a **number** — glass
  waiting at this station now, under it the **dolly or skid** and how many are on it (click — the carrier window: what
  is on it in order, where it stands); **✓** — all passed; **·** — not there yet. The order line is the total of its
  glass.
- An order not in the shop yet (not batched) shows "Not in production yet" and the order status.

## Cancel order and Delete — Finance only

Owner, 13.11.2026: only people with Finance cancel orders; without it — only On Hold, no delete and no cancel.

- **Cancel order** (right click on an order) and **Delete** (above the table and in the right-click menu) work only
  for a user with the **Finance** box ticked in Users. Others get "Ask Finance to cancel or delete this order." and
  the order stays as it was.
- Without Finance there is **On Hold** / **Release** — put the order on hold and ask Finance to cancel it.
- A **quote** and a **draft** are not orders: no glass, no money. Sales deletes them as before.
- The command checks the rule, not only the screen: an order cannot be cancelled or deleted without Finance from
  Optimization, Shipping or a second tab either.
