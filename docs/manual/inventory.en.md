# Inventory

The stockroom: glass sheets on the racks, S- stock offcuts, IGU consumables, Stock items (doors, kits, supplies), counts
and the movement journal. The section is visible to people with the Inventory box ticked in Users.

## How stock is counted

Balances are not stored as numbers — everything is counted from facts (receipts, cutting, breakage, counts), so a
figure cannot be “knocked off” by editing one cell.

- **On rack** — sheets on the rack: + receipt (arrived minus broken), − a cut sheet, − a sheet that broke on the table
  (Sheet broke), ± counts, write-offs and additions.
- **Free** — On rack minus sheets of built cutting plans not cut yet. **Reserved** = On rack − Free (batches shown next
  to it).
- **On order** and **At supplier** — from purchase orders (Purchasing): not arrived yet, and bought but stored at the
  supplier (Held).
- **A cut sheet is used for good**: it is taken off with the first CUT scan of any of its glass and stays taken off
  after a cutting Reset, Unbatch or deleting the order. Only Undo of that scan brings it back.
- **Negative is allowed** and shown in red: stock never stops cutting (owner, 14 Oct 2026 — Build only warns when sheets
  are short).

## The screen

On top **+ Glass on rack** and the sections as buttons in a row: **Sheets**, **Sheet sizes**, **Consumables**, **Stock
items**, **Offcuts**, **Count**, **Journal**. Tables work as in Sales: filter and quick filter in the header, sorting,
width, ⚙ Columns, total at the bottom ([lists.en.md](lists.en.md)). Tiles count what is visible — what is left after
column filters.

### Sheets — glass sheets

- **Tiles**: Glass × size, On rack, Free, Below minimum, Negative, Not counted, Size missing, **Enter sheets** (receipts
  where glass came in blocks without a sheet count — opens Purchasing → Receipts). A status tile sets the same filter as
  the status pill.
- **Table**: Glass, Code, mm, Size, On rack, On order, At supplier, Reserved (with batches), Free, Status, **Minimum**
  (edited in the row), Last count (when and who). The glass name opens its journal.
- **Status**: Not counted → Negative → Below minimum → OK (the first that fits).
- **Rows**: glass marked “Kept in stock” in Data — always; the rest (Pre-order) appears with its first movement: a
  receipt, a cutting plan, a purchase order, a count, a minimum. The sheet size comes from the glass's supply rows.
- **On the left of a row**: **+** — add sheets (reason: Opening stock, Found, Returned, Other), **−** — write off,
  **Count** — “there are exactly N”.
- **+ Glass on rack** — the glass is picked as in Sales (manufacturer → thickness → coating), the sheet from supply and
  can be corrected; it also adds glass that is not in the list.

### Sheet sizes

“Supply sizes of a glass go first; shop sizes work for any glass.” Columns Sheet, Glass, From (Supply · Shop). The glass
code of a supply size opens its supply row in Data. **+ Add sheet size** — a shop size for any glass; × removes a shop
size. Sheet trim and border — Data → Cutting.

### Consumables — IGU materials

Spacers (ft), sealants, gas and IGU parts — all active items of those Data catalogs. Screen hint: “Reserved on Save,
used on IGU scan.” — an order reserves material on Save, and it leaves stock on the IGU assembly scan (owner, 23 Oct
2026).

- Columns: Item, **Bought in**, Received, Used, Count adj., On hand, Reserved, Free, Status, **Counted**.
- **Bought in** — purchase units: “1 box = N ft” and so on; metres, inches and feet, pounds and kg convert by
  themselves. A unit without a conversion shows “Pack size missing”, and such a receipt does not count until the
  conversion is entered.
- Free below zero — **Short**, nothing is blocked. A unit assembled without a scan is not taken off — a count fixes it.
- **Counted** and **Save count** — the count; the difference is real waste, with a reason and a note.

### Stock items

Items sold or fitted from stock: doors, kits, supplies (created in Data → Stock items). Tiles On hand, Reserved,
Available, Short, Not counted; columns Item, Code, Kind, Measurements, On hand, Reserved, Available, Status, Last count.
**Count** right in the row, with a reason; under the table — today's counts and **Full journal** (owner's choice, 30 Oct
2026: “there is a reason and there is a journal”).

### Offcuts — S- stock pieces

A piece appears on the rack after the sheet it comes from is cut. Its place is counted too: **Coming** (the sheet is not
cut yet), **On rack**, **In batch** (taken into a cutting plan), **Used**, **Broken**, **Written off**, **Back to
waste**.

- Tiles: On rack (pieces and ft²), Coming, In a batch, Oldest (days).
- Columns: Stock, Glass, mm, Size, ft², From (batch and sheet — a link), Age (days), Where.
- Pieces that are gone are hidden until **Show used and written off** is ticked.
- Counting pieces: the **Not found** box in a row and **Write off N not found** — one command. A written-off piece turns
  up — **Found**; the write-off stays in the journal. Coming and gone pieces cannot be written off.

### Count — counting sheets

“Enter sheets on the rack. Only filled rows are saved.” A **Counted** field in every row, the difference shows at once;
when there is one — a reason and a note (the list is Data → Production → Stock reasons; optional, a count is never
blocked). **Save count · N** writes only the filled rows, as one record: “Was 10 → 8 · Broken on rack”, who and when.
**Write off** — write sheets off with a reason.

### Journal

All stock movements for a period (**When**, 30 days by default): When, Glass, Code, Size, What, Reference, On rack, Who,
Note. Receipts GR- (“18 arrived · 1 broken”), cutting plans, cuts, **Sheet broke** with Undo (the record is not deleted —
who and when undid it is shown next to it), counts, write-offs, additions, S- piece movements, consumable counts.

## Links to other sections

- **Optimization**: in the cutting plan's SHEETS table, under a sheet size — “free N” before Build and “need N · free M”
  after; a shortage in red; a Short line above the sheet. Without the Inventory box there are no hints.
- **Purchasing**: a receipt raises On rack; a glass row that came in blocks without a sheet count asks for **Enter
  sheets**.
- **Data**: “Kept in stock” on glass, count reasons (Stock reasons), Stock items, consumable purchase units.
