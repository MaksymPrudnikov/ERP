# Lists — one look everywhere

Every list in the ERP works like Sales: Optimization, Production, Shipping, Finance, Purchasing, Inventory,
Customers, Agents, Users and Data.

## How a list works

- **Top row** — actions on the ticked row (Open, Edit, Hold, Invoice, Terms, + Add, Count…), the period and search
  on the right, the main button (+ New …) last. A button that does not fit the ticked row is grey.
- **Pills** — the sections or quick views of the screen (in the same place on every tab); statuses and the date are
  in the same row.
- **Tick a row** to act on it; right click gives the same actions where the screen has a menu.
- **Gear** (left of the headers) — Columns: tick to show, untick to hide, drag to reorder; Standard view and Reset
  widths.
- **Header** — the ▾ arrow left of the name: filter, condition and sort of the column; drag the edge of a header to
  change its width, drag the header to move the column. Widths and order are kept in this browser, per list.
- **Quick filter** — click a column name: a field takes its place and filters as you type (Starts with — “76” finds
  76025; for dates “Oct” or “2026-10”). Enter or a click elsewhere leaves the typed text in the header in green, ▾ in
  green; clear it to remove the filter. Another condition (greater, less, equal, Contains…) is in ▾, and the header
  shows its sign: “> 1000”. If values are ticked in ▾, clicking the name opens ▾.
- **Freeze** — the pin in the Sort row of the column menu: the column moves to the left and stays when the table
  scrolls sideways; its header shows the pin, the edge of the frozen columns has a shadow (text goes under them).
  Click again to unfreeze; Standard view unfreezes all.
- **The header** of the table stays on top when the list scrolls down.
- **An empty cell** shows a grey dash «–».
- **Rows** have the same height and text size everywhere, as in Sales; a second line of a cell (customer code, legal
  name) is grey on the same line.
- **Total row** at the bottom — the count and the sums of the number columns.
- **Data** — the tree of items is a card on the left; the top row has the ticked row's actions, the search and All
  catalog; the row card opens on the right (Hide preview hides it).
- **Agents** — the people list works like Sales; a row or its tick opens the person below (their orders, + Payout).
  Period and With HST sit in the top row.
- Windows (Activity log, Cut preview), Shipping → Ready, the customer card in Finance (Orders, Payments, Refunds)
  and a person's tables in Agents: column widths drag; the order stays.
- **Every table works like Sales** (owner, 7 Nov 2026): settings in Data too (Trucks, NCR, Stock reasons, Dollies &
  Skids, Setup, Prices, Stations, Data overview), the catalog (glass, Works, Hardware), Production → Stations and
  Terminals, Inventory → Sheet sizes and Consumables, Users. Fields in rows are edited as before. ⚙ Columns also has
  columns the screen did not show (e.g. Manufacturer for glass, Status and At customer for dollies). Windows too (part 2, 7 Nov
  2026): the Packing slip window lines, the dolly / skid window (filter, sort, quick filter; its columns and widths
  stay its own, shared with Columns and the printed sheet), Activity log, the customer card in Finance and Customers,
  Allocate (link rows ▸ under their row), the person tables in Agents, Cut preview, NCR, Skip, Unbatch and sticker
  lines, supplier order and receiving lines, tables in Data cards, Data → Cutting (view only). ⚙ and row checkboxes sit
  in the middle of the first column.
- **Shipping → Ready** is a flat list: a row is an order line with ready units; Customer, Order, PO, Line / Mark,
  Size, Makeup, Skid are columns; the row checkbox ticks its units, Select qty — how many; Create packing slip as
  before. The skid is the Skid column (the link opens the skid window).
- **Sales → ⚙ Columns** also has Account, Contact, Currency, Picked up, Payment due, Days late, Hold reason, Notes.
- Boards and windows keep what they do (the dolly board, the truck day, the window of a dolly or skid); only their
  header follows this look.

Section details: [Optimization](optimization.en.md), [Shipping](shipping.en.md), [Reports](reports.en.md).

## Sales: invoiced or not

The Invoice column is shown right after Status, with a ▾ filter like the other columns: **Invoiced** (green) — the
order's Invoice was printed or emailed; **Not invoiced · N d** — the order is fully picked up and has had no invoice
for N days (yellow from 3 days); a dash — not all picked up (In work in the filter). The Not invoiced tab at the top of
Sales shows only those orders; it appears when there are any.

The status buttons (Draft, New, Verified…) sit on a second row, only on All; Today, Due this week, Needs attention and
Not invoiced keep one row. All again hides and shows the statuses.
