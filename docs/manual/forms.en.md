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

## Work order: status from scans

The Work order shows where every glass is by itself: no signing by hand — the status comes from the station scans at
print time (the bottom of the sheet says "Printed … · status from station scans at print time").

- On a glass row (Lite 1, Lite 2, its glass — 6SOLARGRAY, 6CLEAR…) the route by station, and every chip is a status:
  **green with a tick** — all its glass passed; **amber** "IGU 1 · DL-57" — standing here now, how many and on which dolly
  or skid ("—" — on nothing; on a skid also the PS number once the glass is on a packing slip); "3/4" — part passed;
  **grey** — not there yet. At the end — Shipping ready (SHIPR) and Ship.
- Broken glass — "1 broken" in red, with a **Recut N** row under it on its own route; a Recut with no glass yet — "Not in
  a batch yet".
- The line heading carries the line status: Shipped, Made · waiting to ship, In work.
- Header: the number barcode, Required with the weekday, Entered by, the site contact and truck in Ship to.
- Summary: IGU units, Single lites and Panels (glass) apart, area, weight in kg and lb. The bottom of every sheet — "Up to
  this page": units, panels, ft² and kg of the lines up to that sheet.
- ✎ Customize: Status from station scans (untick — the route without status), Entered by.

## Invoice: payments, Balance and the totals strip

- Under Total, every payment on its own line (Deposit before the invoice date, Payment after), receipt number and
  date; then Credits total. What is left on this order is in the “Balance · this order” frame. No payments — no lines.
- Page 1, under the addresses: the totals strip — Total, Paid, Balance due, Quantity, Weight, Area (Proforma,
  Order confirmation, Invoice). Paid is green, Balance due red (green when all is paid); under the strip a bar
  “Paid $… · % / Left $…”. No payments — no Paid and no bar. To hide it, untick Totals strip in ✎ Customize or remove
  the block in the builder; the bar moves with the strip.
- Before a line's name, a type mark: one bar — Single lite, two — IGU, three — Triple IGU.
- Each item line shows its weight: “17.2 kg × 2 = 34.5 kg”. Tick Weight in lb for pounds.
- Bottom left: terms (Data → Company, Terms) and GST/HST No. (Data → Company, HST number).
- Fields for your own forms: Credits, Payments one per line, Total weight lb (Insert field, Totals group).

## New form — blank or a copy

+ New form in the forms row: a name, Prints with — the order document it prints with (its data and ✎ Customize),
Start from — Blank sheet (an empty sheet with the order lines only) or Copy of an existing form. The form shows in
the forms row and as a tab in the order's Documents window next to its document. Your own forms have Rename and
Delete form.

For other documents (Packing slip, Purchase order, Trip sheet, Receipt, Statement, Drawing, dolly / skid sheet and
label) your form prints instead of the document when Use for printing is on — wherever it is printed from. One such
form per document. Turned off or deleted — the usual document prints again.

## Receipt, Statement, Purchase order, Trip sheet

- **Receipt** and **Statement** — the same header, cells, addresses and totals as the order forms; the program draws the
  table (orders, money movements). The live sheet — the latest receipts; a statement — a customer for this month.
- The **Statement** lists invoices by month: a month heading, the invoices, the month total under a rule. The Days
  late column shows how many days an invoice is overdue, in red. Invoices to pay now are red, and after the last of
  them in a month comes a “Due now · N invoices” subtotal. At the bottom, four aging amounts with a colour mark and a
  bar of shares with percents under it.
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
  sheet, the dashed lines are the 9 mm print margins; drag a guide off the ruler, a Free block snaps to it. **Layer** —
  To back / Back / Forward / To front, as in Figma: what is on top; To back puts the block under the drawing. Blocks
  that overlap get an orange frame and a note above the sheet; Save still works, the sheet prints as set.
- **Footer** — the bottom of the sheet: Glass tag (the glass label in a batch print) and the date. The Glass tag block can
  be moved or removed.
- **+ Picture** — the company logo from Data → Company (height in the block settings); no logo — your own file.
- **+ Field** in Header or Footer (pick the part on the left) — a field of the sheet: the order (Customer, PO, number,
  Due date, date), the line (glass, qty, Finished, weight, NOTE), **Prices** (Unit price, Line total, Materials — the same numbers as the line
  cells in Sales), **Company** (name, details in one line, address, phone, email, website, HST) and My fields. A price on
  the sheet is seen by the shop too — add it only when needed.
- **Info** and **Route** are drawn by the program (makeup, Finished, weight, LINE, NOTE; the route by stations). Click
  them on the sheet or in the list — **Place** (Info above or under the drawing, Route at the bottom or right under the
  header) and ticks for what to show: Qty, Finished size, sq ft · kg, LINE, NOTE, Makeup scheme, Route. They are not
  dragged with the mouse: the drawing always takes the rest of the sheet.
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
- **An archived order prints with the look of the day it went to the archive** (owner: "so nothing changes by
  accident"): editing Drawing or the company details does not change its sheet. Archived before this setting — the
  default look. Back in work (NCR) — today's look again.
- The Metric detail button in the shape editor is its own detailed mm view (angles, hundredths): while it is on on a
  computer, that computer prints drawings in it, as before. Off — prints follow Drawing.

## Dolly / Skid sheet

The same sheet is printed from the dolly window, Shipping → Skid sheet and the stations (Print what is on …). By default
it is the sheet as before.

- **Header** — the company name and address on the left, the kind and number (SKID CONTENTS · SA-10) on the right;
  these are blocks: move them, change the size, remove them, add your own text, field or logo (+ Text, + Field,
  + Picture).
- **Strip, Customer, Total** are drawn by the program — click a part: ticks for what to show (Station, Since /
  Shipped, On it, Weight, Printed by, the customer and order, the total) and the sheet colors (As now, Black text or
  any).
- **Table** — the columns are still set per station (Production → Stations) or with ⚙ Columns in the dolly window.
- **Page footer** — the bottom of every page: "Printed … by … at …" on the left and the page number on the right;
  blocks Left / Center / Right, `{page}` and `{pages}` are the page number and the page count.

## Dolly / Skid label

The label stuck on a dolly or skid (printed from Dollies & Skids and at the stations). By default it is the label as
before: the type, the big number, the barcode of the number (stations scan it) and the number in small print.

- **Label size** — 4 × 6 (portrait) or 3 × 4 (landscape); each size keeps its own layout, printing uses the chosen one.
- Blocks: + Text, + Field (number, type, date, company fields, My fields), + Picture (logo), + Barcode. Mouse, ruler,
  Left / Center / Right / Free and layers — as in other forms.

## Add to other forms and one set of fields

- In the block settings — **Add to other forms…**: the same block (logo, text, field) into other forms at once. A form
  without that field is gray. Each form is saved at once and gets its own version in History.
- The company fields are one set with one name in every form: Company name, Address and contacts, Logo, Company
  details one line, Address one line, Phone, Email, Website, HST number. Customer, PO (`customerPo`), Due date have
  one name too.

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
