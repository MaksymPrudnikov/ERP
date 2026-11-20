# Production and stations

The shop: where each order's glass is right now, the station route, the scanning screens at the stations, carriers
(dollies and skids) and moving an order by hand from the office (Skip, Unbatch). The section is visible to people with
the Production box ticked in Users.

## How the program knows where glass is

A glass's place is not stored but counted: the last scan + the glass route (the same one as on the sticker) = the
station where the glass waits. Every scan is a log record: who, when, at which station, on which carrier. A glass
number can be typed as digits (“1234” = G-0001234); such a scan is marked “hand”.

The shop sees only optimized glass: glass without a batch does not wait at any station (owner, 19 Oct 2026). An order
whose glass has all left is not shown in Production — it stays in Sales and Shipping (1 Nov 2026).

## The Production screen

Same look as Sales: a filter row and the **Due** period on top, below it the pills **In production**, **Stations**,
**Terminals**, **Dollies & Skids**, **Floor** — in the same place on every tab.

### In production

- **Station tiles**: To batch (in queue), CUT (in batches), then each station — how much glass waits there and on how
  many dollies. Clicking a tile keeps only the orders with glass at that station.
- **Needs attention**: orders on Hold, overdue orders, glass waiting for a pair at IGU, Recut records.
- **Table**: Order, Customer, Priority, Due, Glass, Shipped and a column per station — how much of the order's glass
  waits there. ▸ opens the order by lines and lites. Under a station's number — carriers: “DL-7 5 · DL-8 15 · no dolly
  3”; clicking a code opens the carrier window.
- Filters, sorting, column widths, ⚙ Columns and the total at the bottom work as in Sales ([lists.en.md](lists.en.md)).

### Stations

The route in one line (**How glass moves**): steps in order, parallel stations in one step. Clicking a step highlights
its stations in the table. Table: Step, Code, Name, Machines, In route, Size W × L, Puts on, Dolly / skid sheet, Works, Note. **Machines** —
the station's machines (P1, P2, P3), each with its own scan screen. Tick
a station → **Open screen** opens its screen; **Edit in Master Data** edits stations (manual
[masterdata.en.md](masterdata.en.md)). **Load STATIONS.csv** updates rows with the same codes and adds new ones; rows
missing from the file stay — the import never erases anything silently.

### Terminals

One record per scanning screen in the shop: Code, Name, Stations, Note. **Add terminal**; for the ticked one — **Edit**,
**Delete**. Screen hint: “One account per screen · badge = person” — one screen, each person signs in with their number.

### Dollies & Skids

The carrier board (owner, 15 Oct 2026: “one dolly can hold 10–20 different orders — click and see what is on it”).

- **Tiles**: registered (by type DL · DA · SL · SA), in the shop (loaded / empty), at customers and the oldest, glass
  with no dolly or skid, the last count's result, found without a label, not confirmed yet.
- **Pills**: Loaded, At customers, Empty, All. Filters Order, Customer, Station.
- **Carrier cards** sit under the station where their glass waits. “No dolly / No skid” — glass scanned without a
  carrier.
- **Carrier window** (click a card, a code in In production or in Data): the last piece put on is on top, #1 went on
  first; a summary by order with a “whole order” box; a unit after IGU is one row. Tick → **Move to** (another carrier),
  **Take off** (the glass stays at its station without a carrier), **Empty** (asks first); after each — a line with
  Undo. The carrier sheet can be printed; **Show on floor** — where this carrier is on the floor plan (Floor). A skid at a customer — who, how many days, PS, what left on it; button **Back
  at the shop**. Anyone who sees Production may edit carriers (owner: “everyone”).
- **Count dollies & skids** — a count in place of the board: scan field, place **Shop / Yard**, “found X of Y”, Not seen
  yet on the right. Every scan is a mark; a repeat — “Already counted”; **+ No label** — a carrier without a label.
  **Finish count** remembers what was not found; **Cancel count** drops the marks. A count never moves glass. One count
  open at a time.

### Floor

A top view of the shop: the hall, walls, station machines, objects and waiting zones — in metres. On the right —
stations in alphabetical order, each in its colour, with a status dot; **Not placed** — the station has no machine on
the plan yet. **−** / **+** / **Fit** — zoom; drag — move the view; **Esc** — clear the selection.

**What is happening now**:
- **Working** (green dot) — the station had a scan in the last N minutes; N is the station's own — the **Working,
  min** field in Master Data → Stations (15 by default). **Waiting** (yellow) — glass waits, no scans. **Idle** — the
  rest, the block is dimmed. On a station with machines (P1, P2, P3) each machine shows its own scans; the station is
  working if at least one machine is.
- The label is inside the block: the station code and how many wait — “● HEAT 5” — on the station's thickest block (the
  middle of LAM and IGU), the station's other blocks show only the status dot; a machine shows its own code (P1). If the
  label does not fit the block, only the dot stays; the text appears when you zoom in (**+**, double-click). A waiting
  zone shows only the station code. Hover a block — “machine · status · how many wait · last scan”.
- On top — the summary **● 2 working · ● 1 waiting**: a click keeps only those stations bright, **Show all** brings the
  rest back.
- **Dollies and skids** — icons without numbers: in the waiting zone of the station their glass waits for (zones are
  drawn in Edit); no zone — under the station's machine. A dolly with glass for several stations is one icon, where
  most of its glass goes. Empty carriers are not on the plan. If they do not fit the zone, the last icon reads “+N”.
  Hover — the number and how much glass goes where; click — on the right, what its glass waits for, and **What is on
  it** — the carrier window.

**2D | 3D** (keys **2** / **3**): 3D is the same plan in volume, view only (Edit is always 2D). Drag to turn and tilt,
**Shift** to move; **Top** — from above, **Iso** — at an angle. Walls in 3D are low (1.3 m) so they do not hide the
machines. Labels hide while the plan turns. **Double-click** a station (2D and 3D) to zoom to it; **Fit** (**F**) —
the whole plan.

**HELP from a station**: the station is red and pulses gently, the summary shows “1 help · DRILL” (click — its card).
The card shows a red strip “Help · 4 min”, the machine and who called, and **Resolved**.

**Station card** — click a station on the plan or in the list:
- the period switch **Today · Yesterday · 7 days · 30 days** (the computer remembers the choice);
- **Done** and the station's measures in its own units, as on the station screen: Glass ft², Units, Linear in, Work
  ft², Works, pcs; works by kind — “Holes 34 pcs”, sizes in small print below; **People**;
- for today — **Waiting now** (on how many dollies) and **Last scan**;
- **Broken** — broken at this station; **NCR** — glass in NCRs that name this station as the cause;
- on a station with machines — **Machines running: 2 of 3** and rows P1 / P2 / P3; for a period — on how many days 1,
  2, 3 machines ran;
- bars by hour (one day) or by day and a table by day — working days only: a Saturday or Sunday without work is not
  shown; at most eight dates under the bars, the day's number is in the bar's tooltip; 7 and 30 days with orders that
  went to the archive are counted as in Reports — while the archive is read, a line with a percentage shows;
- the card scrolls on its own: changing the period does not move the page;
- **Dollies here** — carrier numbers (click — Show on floor); **Orders** — the station's orders; **Open screen** — the
  station screen.

**Set up the plan** (needs the Master Data box; without it — “Floor plan is not set up yet”):
- **Start from sketch** — a 65 × 70 m hall, two walls and the sketch blocks numbered 1–17, no stations; **Empty hall** —
  the hall only. Then pick a station for each block, type exact sizes and press **Save**.
- If another computer has already set up a plan, saving the sketch says “Plan already exists on another PC” — there is
  no second plan.

**Edit** — change the plan; until **Save** it is a draft (**Cancel** drops it after asking):
- click a block — the **Inspector** on the right: **Station**, **Label**, **X**, **Y**, **Width**, **Length**,
  **Height**. Sizes are metres; the field takes `6.5`, `650 cm`, `6500 mm`. **Rotate 90°** swaps width and length,
  **Duplicate**, **Delete**;
- drag a block in 0.1 m steps; near a neighbour's edge (closer than 0.5 m) it snaps and a dashed guide shows. The
  bottom-right corner resizes. Width is shown above the block, length beside it, the distance to the wall on the left;
- **Shift+click** adds a block to the selection, a box dragged over empty space selects several; arrow keys move by
  0.1 m, with Shift by 1 m; **Esc** clears the selection; **F** — the whole plan; **Ctrl+Z** / **Ctrl+Shift+Z** — undo /
  redo in the draft (**Undo**, **Redo** at the bottom of the inspector);
- **Add…**: Machine, Wall, Object — appear in the middle of the view; **Waiting zone** — draw a rectangle where the
  station's dollies or skids wait, even outside the hall, and pick the station. One zone per station;
- **Station color** — the station's colour on all its blocks and its zone; it is kept with the station;
- the **Hall … m** button at the bottom selects the hall to change its size;
- blocks overlapping or a machine outside the hall — a yellow **Overlaps …** strip; Save still writes.

Rename a station in Master Data and the plan's blocks follow the new code. A block with a code that no longer exists
shows “Unknown station”.

## The station screen

Opens by its own link (`…#station=CUT`) or with Open screen and shows only itself, without the ERP menu: stations have
weak PCs and tablets. The main rule (owner, 29 Sep 2026): scanning never stops work — the field is always focused,
errors are shown by colour and sound, windows only in rare cases.

### Sign-in

**Your number** — the personal number from Users, then the **PIN** (4 digits). No names on screen: one person works at
different stations (owner, 2 Oct 2026). An error does not say which is wrong — number or PIN. The office gives the PIN.
**Switch** — sign out and let someone else in. The sign-in is kept on this computer, per station.

### Header

Station code and name, tabs **Scan · Queue · Board · Dollies**, on the right **Drawings**, the batch (on CUT), chips
“Putting on DL-2” (✕ — stop putting on it), “No dolly · N”, “N to answer”, the worker, **Switch**, **Dark / Light**,
**ERP** (back to the office). On IGU — **Unit stickers Auto / By button**: the unit sticker prints by itself when all
lites are scanned.

**HELP** — call the office (the production manager): the station lights up red on the floor plan (Production →
Floor). While the call is open, the button becomes a red “Help · 4 min” chip with **Resolved**: press it when help has
come. The office can also close the call from the station card. The HELP button is on the Scan tab; on Queue and Board
an open call shows as a short “Help 4′ ✓” chip.

**Machine** — on a station with machines (the Machines field in Master Data): which machine this screen stands at. It
is picked once on this computer, which remembers it. Not picked — a yellow **Not set**: scanning still works, just
without a machine. The machine is a mark for reports (Reports, the Machine field): where glass goes next and how much
waits is counted by station, as before.

### Scan

- The **SCAN BARCODE** field — a glass sticker, a number as digits, a carrier code, a unit U-.
- The last scan card: which glass, where next, on which carrier. Below it **Last scans** (Time, Glass, Order, Line,
  Next, On, By) and **Undo** — only for the last scan; the record is marked, not deleted.
- **On the right** — what waits here (**Waiting here**) by carrier: code, how many, batches; a click shows the stack
  top to bottom, the number is the stacking order (#1 went on first). “tap a row — no sticker”: a glass row opens actions
  when the sticker does not scan. Below — carriers loaded here and where they go (**Dollies at …**).
- **CUT**: on the right the batch's cutting sheet with its glass, batch choice and **All sheets**; buttons **Print** and
  **Sheet broke** (“cut the same layout again, stickers stay the same”). When the last sheet is cut, the next batch in
  the queue opens.
- **Recut** — on the glass card or in a glass's menu on the sheet: a reason from the NCR list, one tap; the new glass
  waits for the next batch (owner, 29 Sep 2026).
- **Skipped station**: glass arrived without a scan at the previous station — an amber card “EDGES DONE?”. Yes — the
  earlier marks are written back-dated, No — the glass goes back. Not answered — the question moves to the “N to answer”
  chip, work goes on.
- **IGU**: lites join a unit by glass type and size (not necessarily the first with the second). While the unit is open —
  “Waiting for its pair”. A scratched lite — Recut; the other lites come out of the machine and wait for a pair on a
  dolly. After IGU a unit moves with one scan of any of its G- or its U-.
- **SHIPR / SHIP**: skid scans, loading, trips — manual [shipping.en.md](shipping.en.md).

### Carriers at a station

Scan the carrier first, then what goes on it (owner, 29 Sep 2026). Scanning a carrier code: if it holds glass for this
station — “DL-1 arrived”, its stack on the right; otherwise “Putting on DL-2”, and every next glass goes on it. Forgot
to pick a carrier — the scan still counts, the card shows a yellow strip “WHICH DOLLY?”; the next carrier scanned takes
that glass. Nothing is blocked without a carrier (owner, 7 Oct 2026). What a station puts glass on — Dolly, Skid or
nothing — is the Puts on column in Data → Stations.

### Queue

The scan field moves to the header. On CUT — the batch queue in the office's order (▲▼ in Optimization → Batches): glass
to cut, due date, sheets, stock offcut; **View** and **Cut this batch**; “On the table” — the open batch; **Bring to the
table** — which sheets to bring. The office order is advice: the cutter may take another batch and come back. Other
stations show what is coming and what waits here.

### Board

Only its own station (owner, 9 Oct 2026: “each for themselves”): waiting here, done here today by everyone, **You
today** — only the signed-in person, **Hot** — Critical, Rush and due by tomorrow. No other names and no money. A day
is 0:00–24:00. A scan on Board counts and returns to Scan. Reports placed on the station in Reports (Show on) appear as
extra tabs.

### Dollies

All carriers with filters All / Loaded / Empty / At customers, on the right “scan or number” and the chosen carrier's
card. Scanning a carrier here only selects it. **Empty** — two taps, Undo right after; the glass stays at its station
without a carrier. **+ Register new** — the worker registers a new carrier: type as a tile, the number comes from the
system (the next one never issued), then the 4 × 6 label and **Print label**. A carrier in use warns before **Reprint
label**. A number never comes back, not after write-off and not after a lost record.

## Skip and Unbatch — moving an order from the office

Both are in Sales: right-click an order. Only people with Users or Finance ticked in Users see them.

- **Skip…** — move glass forward without scans (owner, 8 Oct 2026: “ABS came and took this order — it has to be
  skipped”). What: quantity by line, **Whole order** or **Glass ID or unit** (scan G- / U-), stock items. **To**: Picked
  up, Delivered or any station from Data. **Date** (not after today), **Picked up by** / **Received by**, **Delivery
  address**, **Reason**. The glass gets manual marks at every station up to the target; Picked up and Delivered create a
  packing slip on that day. An order on Hold — Release it first. **Undo** — in the order's Activity log at the Skipped
  record; if the glass was scanned later, undo those scans first.
- **Unbatch order…** — the reverse (“a negative Skip”, 9 Oct 2026): quantity, G- / U- or **Whole order · glass only**,
  **To** — Not cut · To verify (off the batch) or waiting at a chosen station, **Reason**. Before confirming — a summary:
  units, glass, assemblies, batches, packing slips. Unbatch has no Undo: forward again with a new Skip or scans.

Why: people make mistakes and customers come on Saturday — “as flexible as possible”, no brick walls; whatever was done
is written to the order's log.
