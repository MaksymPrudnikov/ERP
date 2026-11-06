# Forms · form builder

Data → Company & print → **Forms**. A form is built from blocks, like in Word, and printing takes it right away. The
Packing slip (with its skid sheet), the Quote and the Proforma invoice are on the builder; the other order forms move
here one at a time.

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

## Order forms: Quote, Proforma

The Quote and the Proforma invoice print from their forms in Forms; by default the sheet is exactly what it was.
Order confirmation, Invoice and Work order come next. The Proforma live sheet uses the latest orders.

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
