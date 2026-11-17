# Optimization

The order queue between the office and the shop: orders are verified here, sent to a batch and tracked until
the glass is cut.

## The screen

Same look as Sales: one card with a row of actions, a row of pills with counts, then the table.

- **Pills** — All, To verify, To batch, Batches, Stock, Sheets. The number is how many items wait there.
- **Open** — opens the one ticked order.
- **Actions over the ticked orders** appear in the same row once you tick at least one order ("2 selected"):
  Verify, Select glass (All only), Unbatch, **Move back** (one status back, locks stay), **On Hold** (asks for a
  reason; **Release** when all ticked are held), **Cancel order** (payments go to the customer deposit), Delete.
  A button that does not fit the ticked orders is grey. **Cancel order** and **Delete** need the Finance box (owner,
  13.11.2026): without it both are grey with the hint "Ask Finance to cancel or delete this order.", the right-click
  menu does not show them; On Hold stays.
- **Right click** on an order gives the same actions for the ticked orders (the order under the mouse is ticked
  first). A held order has **Release** in its row.
- **Navigation** is its own card with the pills above the table, in the same place on every tab; the gear is left of
  the headers everywhere. Open an order with right click → Open (there is no Open button in the row).
- **Production** has the same look: the switch In production / Stations / Terminals / Dollies & Skids is a row of
  pills in the same place on every tab; the station tiles stay tiles above the table. **Stations**: the route is one
  line (click a step to highlight its stations), **Open screen** and Edit in Master Data on top. **Terminals**: Add
  terminal on top, Edit / Delete for the ticked one. **Dollies & Skids**: filters, pills and Count in the header; the
  board and the window on click are as before.
- **Gear** in the header — Columns. Filters and sorting are in each header, like in Sales; the totals are at the bottom.

## Batch → Optimization: sheets for cutting

Owner, 17 Nov 2026: variant C with the stock column, no hints on screen — the process is written here.

### Steps

1. **Batches → a batch → the Optimization tab.** Glass of the batch on the left, the sheet on the right and the
   **Sheets · glass** table under it. A batch with several glass types has a glass switch above the sheet.
2. **Check the sheets in the table.** The tick on the left — this size may be used. Untouched, the optimizer takes all
   ticked sizes and picks the ones that use fewer square feet.
3. **Build** lays the glass out. To change sheets or edges after Build — **Reset**, edit, Build again (while the layout
   is built the fields are grey and “Reset to change” shows). Leftover kept if can be changed on a built layout too.
4. **After cutting** — the Cut station screen; leftovers that meet the Leftover rule go to stock with To stock or
   Split under the sheet.

### Where sheet sizes come from

- **Glass supply points** (Data → Glass → Supply points) — first.
- **Shop sizes** (Data → Production → Cutting / Inventory → Sheet sizes) — for any glass and every batch.
- **Stock**: a size of this glass that lies in stock (Inventory) joins by itself, even if it is not in supply. Its Qty
  defaults to how many sheets lie there, so the layout does not count on sheets that do not exist; clear Qty for no
  limit.
- **A batch size**: the row at the bottom of the table — length × width, **+ Add sheet size**. It belongs to this batch
  and this glass only, marked **this batch**; it never reaches other batches or Master Data. × removes it while nothing
  is laid on it. Needed in every batch — add it in Data → Cutting.
- **No sheet size** above the sheet — a glass of the batch has no size at all: type a size and **Add and build** — it
  becomes a batch size for every such glass.
- **Rack pieces** (S-…) — at the end of the table, one each; tick to use the piece in this layout.

### Table columns

| Column | Meaning |
|---|---|
| Sheet, in | Sheet size, length × width. “· 2” — a second sheet of the same size with its own edges (**+ same size**). |
| In stock | Free sheets of this size of this glass in stock; after Build — “need N · free M”. “not counted” — the number comes from receipts and cuts, not checked by a count in Inventory. Red — not enough. |
| Qty | How many sheets of this size may be used. Empty (all) — no limit. |
| Offset | Inset from all four edges (Maver table): the sheet is laid smaller — “laid as …” under the size. |
| Trim X, Trim Y | Edge trim: X — bottom edge, Y — left edge (zero at bottom left). |
| Border X, Border Y | Inset from the opposite edges: X — top, Y — right. |
| Min dist | The narrowest waste strip at a cut line that can still be broken off. |
| This batch | After Build: sheets of this size · used % · waste % · waste ft². |

Empty Trim / Border / Min dist — the Master Data value for this thickness; **Reset to Master Data** brings back all
edges and rules of this glass.

### Leftover kept if — which leftover goes to stock

A leftover goes to stock if it is at least **W × H** inches **or** at least the given **ft²**. Smaller — waste.
**Rotate glass** — the optimizer may turn glass by 90°.

### On the sheet

Drag glass onto the sheet, onto a sheet in the strip below or back to the list; double-click or R — rotate; right
click — menu (Rotate, Take off, Lock); click a cut line to turn the cut.
