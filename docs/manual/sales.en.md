# Sales

Orders and quotes: customer, makeups (what a unit is built from), lines with sizes, work and price. This page covers
the price windows people edit most: order surcharges, line services and how a makeup is written.

## Order header: Priority and Due date

Owner, 17 Nov 2026: Priority comes first and sets the due date by itself.

- First **Priority**, then **Due Date \***. Priority sets the date: **Normal — 7, Rush — 3, Critical — 1** business
  day (Monday–Friday, holidays are not counted). The numbers are edited in **Data → Setup → Due date**.
- A new order gets the date at once, from the day it is created. A copied order also counts from the day the copy is made, by its Priority (owner, 18 Nov 2026), not the original's past date. An order
  from a quote — from the conversion day; a future date written in the quote stays.
- The date can be changed by hand. Changing Priority again counts the date anew from today — a hand-set date too.
- **An order without a Due date is not saved**: “Enter the Due Date.” A quote does not need one. An NCR remake order
  has no due date (it is not in On time %) and is saved without one.
- Example: an order created on Friday 20 Nov — Normal → Tuesday 1 Dec, Rush → Wednesday 25 Nov, Critical → Monday 23 Nov.

## Save: limits and questions

- A line takes up to **10,000** units and up to **999″** width and height: above that Save stops and names the line.
  Above 2,000 it asks “Is this right?” (owner, 24 Nov 2026).
- A new order with a PO already on another order of the same customer asks “PO … is already on order …”: most often it
  is a duplicate. The second click of a double Save no longer presses the **Copy** that appears.
- An order open in two tabs: Update in the tab that is not writing takes over and saves on the first click.

## Order note (Notes)

- The **Notes** column in the Sales list stands right after Invoice. Narrow (100 px), two lines of text; if it
  does not fit, hover to see all of it.
- Typing is in its own window: **click the Notes cell** or right-click the order → **Note…**. Save writes the note at
  once without opening the order; the change shows in the order log (Activity log: Edited · notes).
- The same field is **Order Notes** at the bottom of the order form.
- On screens narrower than 1560 px the column hides like other narrow columns (⚙ Columns brings it back).

## Shape opens clean

Owner, 17 Nov 2026: the Shape window should not remember the previous one. Every entry to Shape — from an order line,
a lite, NCR / Recut, the library — opens the Designer tab with all panels closed, Metric detail off and no mark waiting
for a place.

## Selecting rows

Shift+click selects rows from the last ticked one to this one — in order lines, Optimization → To batch and the lists.
There is no hint about it on screen (owner, 17 Nov 2026).

## How a makeup is written

A makeup in the strip above the lines, in an order line, on a sticker, packing slip, invoice and Work order is one
line: lites joined by " / " with the cavity (spacer and gas) between them.

- Plain glass — its name: inside (Sales, shop, drawing) the Short name, to the customer (documents, packing slip,
  sticker) the Name. Documents add the heat treatment: `T`, `T+HST`, `HS`.
- **Laminated** (owner, 8 Nov 2026, variant B1) — `LAM`, total thickness and the build in brackets: glass +
  interlayer + glass. Example: `LAM 12.76 (6CLEAR + 0.76 EVA-CL + 6CLEAR)`; in an IGU the same text stands in place
  of the lite: `6E180ESC / 17/32 Black Warm Edge ARG / LAM 12.76 (6CLEAR + 0.76 EVA-CL + 6CLEAR)`.
  - Thickness is nominal: 6 + 6 + 0.76 = 12.76 (how the glass is called), not measured.
  - A 3–4 glass laminate reads the same way, in order: `LAM 25.14 (6CLEAR + 0.38 EVA-CL + 6CLEAR + … + 6CLEAR)`.
  - Interlayer — the thickness of all its layers (2 × 0.38 = 0.76) and its code; the customer sees its name. The
    drawing says the same: `film: 1.52 mm EVA-UC` — the total, without the layer count.
- **Frit** — patterns 2 x 2 square, 4 x 4 square, 2 x 2 diamond (a 2″ × 2″ diamond: 2″ along a row, rows 1″ apart
  and shifted), 4 x 4 diamond (a 4″ × 4″ diamond) and Custom by the silk screen sheet.
- The makeup code in the strip (A, MU-2…) always stays on one line; a long description ends with an ellipsis.

## Laminated from 3–4 glasses

- A **Laminated** lite is Outer ply, interlayers, Inner ply. **+ Add ply** under the stack adds a middle glass
  (Middle ply) before the inner one: triple — 1a · 1b · 1c, quad — 1a · 1b · 1c · 1d. Four is the limit — the
  button turns grey.
- A new middle glass copies the outer one (glass, heat treatment); its coating faces the interlayer; a middle glass
  has no frit. After every glass there is its own interlayer gap ("INTERLAYER 2 · 1b / 1c") with its own
  **+ Add Film**.
- **×** on a middle glass removes it with its interlayers; the next middle glass takes its place.
- The lite price is the sum of all glasses and interlayers; cutting, route, drawing and sticker go glass by glass.

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
  by itself (OFF), but a number typed into its field goes on that side. **Reset** returns everything to AUTO.
- The border lies on a side of the bounding box (left, right, top, bottom) from the farthest point of the angled
  edge, at 90°. An end of an angled edge that reaches a side of the bounding box pushes that side too: a triangle's
  apex gives a border on top (25 Nov 2026).
- The same border gives the cutting rectangle for billing ("Shape area" above): an edit here changes both the
  layout and the billed shape area.
- Next to it — **Cutting allowance** (CNC stock per side): the piece is larger than finished by the edge removal; it
  is not part of the billed area. Up to 10″.

## Pasting rows from Excel (Paste Excel Rows)

- Columns — Qty | Width | Height | Mark: select a block in Excel, click a cell of the window and paste.
- **Units in | mm** in the window header. In **mm** Width and Height are millimetres: the window converts them to
  inches to 1/16″ with the same formula as in Excel, `=ROUND(mm/25.4*16,0)`. The Result column shows what came
  out: "mm 762 → 30 · 2045 → 80 1/2". A fraction like "30 1/2" in mm is a row error. The choice holds while the
  order is open; a new order starts in inches again.

## Shape from DXF: drawing and stamp

- The **Production Drawing** of a DXF shape is the same drawing as for a regular shape: the length of every edge of
  the file, angles, overall size and the apex offset from the left edge (a triangle's "39 7/16"). Edge processing is
  labelled inside the contour; a click on an edge selects it in Edge processing. **Print / PDF** prints this drawing.
- The **mm** button (next to the tabs) works for DXF too: sizes in mm, inches in grey, angles.
- The **stamp** is text only, no frame, on screen and on paper. Drag it with the mouse right on the drawing (DXF and regular shapes); on
  release the place is written to 1/16″, outside the glass the stamp is not dropped. A new stamp sits at the lower
  right corner so that the whole text is on the glass.

## Surcharges window — order surcharges

The Surcharges button above the lines. Surcharges are Data → Works items with a rule (percent or minimum area).
Numbers in the window apply to this order only: Data → Works, price lists and other orders do not change. Empty —
the catalog number, 0 or the switch — not charged, Reset to Catalog — back to the catalog.

### Minimum area — each item and work has its own

Owner, 17 Nov 2026: what is set in the order wins over Master Data — 1 for the glass means 1 ft², not 4; every
service is billed on its own, not through another item.

- The **Minimum area** table at the top of the window: the makeups of this order and under each its glass (both plies
  for laminated), interlayer, spacer, frit, spandrel and the Works billed per ft² from this makeup's lines. **Card** —
  the item's or work's own minimum, **This order** — a number for this order only: empty — the card, 0 — by the real
  area. **Lines** — how many lines of the makeup are under that minimum.
- Each is billed on its own: glass 4, spandrel 3 — a 2.4 ft² piece pays the glass for 4 ft² and the spandrel for 3.
  Works billed per inch or per piece (Rough Arris etc.) are not affected.
- The area is commercial: sides up to an inch, up to a tenth of ft² (as Spiel). Spiel invoice of 17 Nov 2026, 6 mm
  tempered spandrel, 19 3/4 × 16 5/8 → 20 × 17 = 2.4 ft²: glass 4 × 7.65 = 30.60, Backpainting 4 × 2.95 = 11.80.
- There is no overall minimum any more. An order saved earlier keeps its snapshot: it shows the old Minimum area row
  with “▸ By makeup” instead of the table — the numbers are those of its Save.
- Changes go to the order log (Activity log): “Minimum area · 3CL · 6CLEAR: — → 1 ft²”.
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

## The Gmail email in the order

Orders arrive by email. The order keeps a link to the conversation, so the original opens in one click.

- Next to the **Customer** field, beside the Contact icon, there is an **envelope**; the number on it is how many
  conversations are linked. Click it: a row of emails opens under the header (the contact row closes).
- **Link an email**: open the email in Gmail, copy the address from the browser bar, paste it into **Paste Gmail
  link**, click **Link** or press Enter. The link is written at once, no Save needed. The address of the mail list
  (Inbox with no email open) will not do — the program says "Open the email in Gmail and copy its address."
- A click on the subject opens the conversation in Gmail in a new tab. **Find in Gmail** searches by sender and
  subject — useful when you are signed in to another mailbox.
- **×** removes the link. The email in Gmail is not touched.
- One conversation is one row, however many replies it has. The program never links emails by itself.
- A closed or cancelled order shows its emails right away, as a strip above the header.
- In the **Sales** list the envelope sits in the **PO** cell, right of the number: a click opens the latest
  conversation of the order. Right-click an order → **Open email**. In ⚙ Columns you can turn on the **Email**
  column — the email subject; its filter "Is empty" shows orders without an email.
- **Copy** does not copy the emails. A new quote revision and **Convert** to an order carry them over.
- **Activity log**: "Email linked", "Email removed"; the **Emails** filter shows only emails: the conversation emails,
  templates and documents from the Gmail panel ([gmail.en.md](gmail.en.md)).

## A link to an order

The ERP address ending with `#order=` and a number opens that order or quote right away, for example
`https://marketing-farm.agency/dist/GLASS_ERP.html#order=76012`. You can put such a link into an email to a colleague
or into a note. If you are not signed in yet, the order opens after sign-in. The Sales tick is required. If there is
no such number, the program says "Order 76012 was not found."

## Cancel order and Delete — Finance only

Owner, 13.11.2026: only people with Finance cancel orders; without it — only On Hold, no delete and no cancel.

- **Cancel order** (right click on an order) and **Delete** (above the table and in the right-click menu) work only
  for a user with the **Finance** box ticked in Users. Others get "Ask Finance to cancel or delete this order." and
  the order stays as it was.
- Without Finance there is **On Hold** / **Release** — put the order on hold and ask Finance to cancel it.
- **Cancel units** is an action inside the order and does not need Finance (owner, 14.11.2026).
- A **quote** and a **draft** are not orders: no glass, no money. Sales deletes them as before.
- The command checks the rule, not only the screen: an order cannot be cancelled or deleted without Finance from
  Optimization, Shipping or a second tab either.
