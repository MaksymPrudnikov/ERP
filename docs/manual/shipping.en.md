# Shipping

Everything that leaves the shop: what is ready, packing slips, trucks, skids at customers, backorders.

## The screen

On top — the navigation card: only the tab pills Awaiting readiness, Ready, Shipments, Delivery, Skids, Backorders,
Done. Below — the table card: one row with the tab's buttons (Open and actions on the ticked rows), the **Order / PO**
lookup and **Open a trip** on the right; the table, the total at the bottom. In Shipments the signed packing slip scan is in the row above the list.

- **Lookup** — **Order / PO**, the number and a small button in the field: **=** exact, **≈** contains, **a…** starts
  with (click to change). By default an order number is exact, a PO contains.
- **Awaiting readiness, Done** — tick orders: Close order (Done), On Hold / Release, Cancel order. Right click gives
  the same.
- **Ready** — one list: a customer row (address, skids — tick a skid to take its units, click the code for the skid
  sheet), under it the orders and their lines with **Queue** and **Select qty**. Tick a customer, order or skid and press
  **Create packing slip**.
- **Shipments** — packing slips of a day: pick the day with **Date** on the right of the filter row (Pick a date, All
  time). Columns include **ft²**, **Weight kg**, **Glass** and **Balance**.
- **Delivery** — all stops of the day in one list; pills by truck, Not on a truck, Pickups. Tick a stop: Move up /
  down, Off the truck. The truck of the pill or of the ticked stop shows its load, **Driver**, **Trip sheet**, **With
  packing slips** and km. Km remember the route: change a packing slip or shop address, the order or the set of stops —
  "stops changed" appears, press **Recalculate km**. A packing slip without a truck has **Choose truck** in its row.
- **Skids** — skids at customers, one row each; the customer is faded when repeated. Tick a row: **Checked**, **Skid
  from …**. Click a skid code to see what went on it. **Over 30 days** pill.
- **Backorders** — what is left of each line, its glass (**Order Items**) and where it is in the shop.
- **Done** — one row per order, as in Sales; the **Order Items** column is on by default (in Awaiting readiness turn it on in Columns).

Skids, Backorders and Delivery have the gear (Columns: add, remove, order), a filter in every header, width and order
by dragging the header, and the total at the bottom — like Sales.

The dolly / skid window: **#1** (put on first) is on top; widths and order of its columns drag in the header; Columns
adds or removes them.

## The packing slip form

The sheet is built from a template in parts: the top of every page (company, PACKING SLIP, the number with its barcode,
customer, date and method, address), the top of the first page (corrections after Unbatch), the table by order (Line /
Mark, Size, Makeup, Ordered, Before, Now, Back order, Skid), the totals (skids and weight, the note, Received by /
Signature, Date and time, skids remain ours) and the bottom of the page (number · page / pages). The default template
prints the same as before. The form is edited in the
form builder: Data → Company & print → **Forms** (manual `forms`).

## The skid sheet

After the packing slip — one sheet per skid. On top **SKID CONTENTS · packing slip number**, the skid code large with
the units and weight beside it; the top right corner keeps a place for a QR code (empty for now). Below, two panels:
**From** (us) and **To** (customer, address, date). Then the table by order: orders in the order they started going on
the skid, lines by their place on it. Column **#** — the places (#1 went on first, "#6–9" — four units in a row), then
Line / Mark, Size, Makeup, Qty, kg; at the bottom **Total** and "#1 went on first.". Places come from the scans onto
the skid at print time; if a unit has no scan, the # column stays empty and lines follow the order.
