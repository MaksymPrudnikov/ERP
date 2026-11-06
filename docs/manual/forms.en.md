# Forms · form builder

Data → Company & print → **Forms**. A form is built from blocks, like in Word, and printing takes it right away. The
builder has every form: Packing slip (with its skid sheet), Quote, Proforma invoice, Order confirmation, Invoice,
Work order, Receipt, Statement, Purchase order (and Delivery request) and Trip sheet. Stickers keep their own builder.

## The screen

On top — the forms (pills), on the right **Preview** (a real packing slip to see how the form lands), **Undo**,
**Redo**, **History**, **Reset to default**, **Save**. Until Save, printing uses the previous form; unsaved work is marked "Unsaved
changes".

- On the left **Add** — a new block: **Text** (any words), **Field** (data of the form), **Picture** (JPEG or PNG),
  **Line**, **Frame**, **Barcode**. The block goes to the bottom of the chosen part of the sheet; the part grows.
- Below — **Parts of the sheet**: top of every page, top of the first page, the table, totals, the skid sheet, bottom
  of the page. Click a part — new blocks go there; click a block — its settings.
- In the middle — the live sheet with a thin ruler (inches) and the page margins dashed. Click a block to select it;
  drag to move (Left, Center, Right — up and down only, **Free** — anywhere); the right handle sets the width, the
  bottom one the height of a frame or line. Blocks under a growing one (address, skids list) move down by themselves.
- On the right — the block settings: field or text, **Place on sheet** (Left, Center, Right, Free), X, Y, width and
  height in mm, **Font** (Helvetica, Times, Courier), size, line spacing, **B**, **I** (italic), alignment, colour,
  wrap lines; a line or frame has colour, width and
  fill. **Delete** removes the block, ready-made blocks too.

## Table columns

Click **Columns** in the tree (for the table and the skid sheet) — the columns list opens on the right: the tick shows
or hides a column, ⋮⋮ drags it to change the order, the heading and the width in mm edit right in the row. A click on a
row, or on a column on the sheet, opens it: **Heading**, **Shows** (Line / Mark, Mark, Size, Makeup, Ordered, Before,
Now, Back order, Weight kg, Skid; on the skid sheet #, Qty, kg), width, size, **B**, alignment, **Hide this column**,
**Remove column**. **+ Column** adds a column that is not there yet.

## Page margins and guides

The green triangles on the ruler are the page margins: drag them, Left / Right blocks and the table follow. Drag from
the ruler onto the sheet for a pink guide (the tip shows where it is in inches); a Free block sticks to guides and
margins. Drag a guide off the sheet to remove it. Guides do not print.

## A field — the Insert field window

**+ Field**, or a click on a block's field, opens the window: groups on the left (Company, Customer, Packing slip,
Skids, Page), the fields with their value on the chosen packing slip in the middle, **Format** on the right (a date:
Oct 2, 2026 / 2026-10-02 / 02/10/2026 / October 2, 2026) and **Before the value** — words before the value ("Date: "),
printed only when the field is not empty. Search looks in all groups. Text blocks can hold fields too: `{number}`,
`Page {page} of {pages}`.

## Fonts

Helvetica, Times and Courier are the standard PDF fonts: they are not embedded, every viewer and printer knows them,
no fee. Windows may show a look-alike of the same width instead of Helvetica — lines land the same. Line breaks are
the same on screen, in print and in the PDF.

## Order forms: Quote, Proforma, Order confirmation, Invoice, Work order

All five print from their forms in Forms; by default the sheet is exactly what it was. The live sheet uses the latest
quotes (Quote) or orders (the rest).

- Parts of the sheet: **Page 1 header** (top of the first page: logo, company, QUOTE and its number, the Date / Valid
  until… cells, addresses), **Page header** (top of the next pages), **Lines table** (order lines — the ✎ Customize
  window sets how they look), **After lines** (totals and payment, order summary, notes, terms, customer approval),
  **Page footer**.
- **Section** — a part the program draws: Header cells, Addresses, Totals and payment, Order summary, Customer
  approval. Move it (Y), give it Show if or remove it; what it shows — the ✎ Customize ticks.
- The ✎ **Customize** window of a form on the builder builds its ticks from the form blocks: remove the Header cells section and
  the Date, Valid until, Customer PO… ticks go; your own block (say "Thank you, {customer}!") is a tick of its own in
  **Added blocks**, ticked by default. **Save as default** keeps it too.
- Order form fields (Insert field): Company, Document (number, dates, PAID stamp, terms), Order (PO, payment terms,
  currency), Customer (addresses, contact), Totals (units, area, weight, Subtotal, HST, Total, paid, balance),
  My fields.

## Receipt, Statement, Purchase order, Trip sheet

- **Receipt** and **Statement** — the same header, cells, addresses and totals as the order forms; the program draws the
  table (orders, money movements). The live sheet — the latest receipts; a statement — a customer for this month.
- **Purchase order** — the top of every page (PURCHASE ORDER and the number), the first page (company details, dates,
  supplier, contacts, terms — each line a block with its own PO Customize tick), the lines (drawn by the program),
  then the total, notes, supplier invoices and payments, company terms. A blank line between parts is a frame without
  an outline. **Delivery request** prints with this form under its own title.
- **Trip sheet** — the top of every page (company, TRIP SHEET, date, truck and driver) and the bottom; the program draws
  the stops and the total. The live sheet — the latest days with trucks.

## Drawing — the glass drawing sheet

The **Drawing** form is the drawing sheet printed from Sales (Print / PDF), the Drawings window, the stations and the
batch print. One setting works everywhere; by default the sheet is exactly what it was. The office or the owner sets it
— the shop has no access to Data. The live sheet is a real drawing of an order line (Preview: order · line · shape).

- **Header** — the line above the drawing: Customer left, PO center, Order Number right. **+ Text** and **+ Field**
  blocks, places Left / Center / Right (a column of the line, blocks in it go top down; Y moves down) and Free (its own
  place, drag with the mouse). Size, B, I, font, color, Show if — as in other forms. A ruler in inches runs along the
  sheet, the dashed lines are the 9 mm print margins; drag a guide off the ruler, a Free block snaps to it.
- **Footer** — the bottom of the sheet: Glass tag (the glass label in a batch print) and the date. The Glass tag block can
  be moved or removed.
- **Info** and **Route** are drawn by the program (makeup, Finished, weight, LINE, NOTE; the route by stations). Click
  them on the sheet to select the part.
- **Drawing** — click the drawing or the part in the list to open the drawing look on the right:
  - **Paper** — Portrait (default) or Landscape: the print dialog opens this way on every computer.
  - **Units** — inches in 1/16 fractions (as before), decimal inches (hundredths) or mm (tenths: 844.6).
    **Second units** — a second smaller gray label next to the number: "844.6 (33 1/4″)". The Finished line uses these
    units too. The route (CUT …) stays in inches — the sticker prints the same route.
  - **Drawing size** — 75 %, 90 % or Fill (all the room, as before).
  - Under the units — an example number in the chosen units.
  - **Text size** — dimensions (18), slope labels (16), edge work and radius, service labels and sizes (holes,
    hinges, clamps, cutouts); − and + or a number. **White under numbers** — the white patch under a number.
  - **Lines** — Thinner / As now / Bolder for all lines at once, then − and + for the glass edge, dimension lines and
    service marks (px).
  - **Colors** — As now or All black in one click; every element has its own color (any color, click it): edge,
    dimension lines, arrows, service marks, numbers, edge work, service labels, second units. × — as now.
  - Empty or × — as now (lines gray, text black).
- The Metric detail button in the shape editor does not change prints from the Drawings window, stations or batches:
  they follow Drawing. Print / PDF in the editor itself prints what is on the screen.

## My fields, totals and Show if

- **My fields** — at the bottom of Data → Company: a name and a value (WSIB No., Warranty…), **+ Add field**, × removes.
  In the Insert field window they are in the **My fields** group; the form prints what Company holds now.
- **Totals** — simple sums over the packing slip lines: Units on this slip, Ordered, Back order, Weight kg, Lines, Skids.
- **Show if** in the block settings: Always, A field is filled, A field is… (e.g. Packing slip · Method = Delivery),
  A field is not…. While the condition is false the block does not print and takes no room — blocks below move up.

## Saving

**Save** — the form is stored in the database and prints this way from now on (Print in Shipments, the trip pack).
**Reset to default** brings back the program's form — it prints exactly what it did before the builder; nothing
changes without Save.

## History — the Versions window

**History** opens the window: versions on the left — every **Save** (date, who saved and what changed: "1 block added
· 2 changed"), the last 20 per form, and the program's form (Default) at the bottom. On the right — the chosen version
on the same packing slip. **Restore this version** puts it into the builder; printing changes only after Save.
**Download this version** — a form file (`.json`) to keep, send, or load on another computer with **Load form
file…**. A file of another form, or not a form file, is refused with the reason.
