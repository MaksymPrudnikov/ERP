# Reports — manual

Reports is a report builder like Looker Studio: you build a report from pages and charts and choose the data,
dimensions, metrics, filters and period yourself. A report counts everything in the database, including orders
moved to the archive, for any number of years. Nothing is cut: all rows, all values, all days. Only what you set
yourself (Top N) limits a chart.

---

## 1. The screen

- **Left — catalog.** Search, Pinned (★), Recent and folders as a tree: "Production / Cutting" is a folder and a
  sub-folder. "‹" hides the catalog so the report uses the full width; "☰ Reports" brings it back.
- **Centre — the report.** Name, page tabs, the filter row (Date and filter buttons), then the charts.
- **Right, in Edit — Chart setup** for the selected chart. In Edit the catalog hides so the sheet is wider.
- **Chart buttons are icons in its title row:** in view only CSV; in Edit also edit (pencil), duplicate, up, down and
  × (remove). The corner at the bottom right (Edit) drags: up and down for the table or chart height, sideways for
  half the row or the whole row.

Report buttons: ☆ Pin, Edit (your report, or you are an administrator), Copy (your own copy of any report), Print.
Starter reports are edited by an administrator; everyone else uses Copy and edits the copy.

## 2. Period and viewer filters

- **Date** — the report period: Today, Yesterday, This week, Last week, Last 7/30/90 days, This month, Last month,
  This quarter, Last quarter, This year, Last year, All time or Custom dates.
- **Filter buttons** (Glass, Thickness, Customer…) — pick one or more values. Clicking a value in a table or chart
  (row, bar, slice) filters the whole report too.
- Your period and filters stay in this browser. **Reset** returns the report's own period and filters. **Save as
  default** writes them into the report for everyone (if you can edit it).
- "Not filtered by …" under a chart means a report filter was not applied: this data source has no such field.

## 3. Loading and the archive

- An order moves to the archive a month after it is shipped and fully paid. A report over past months and years
  reads the archive by itself: "Reading N archived orders · 42%", then the charts. Rows of a closed month are kept on
  this computer's disk and on the server: the second opening and any other computer are instant, without reading
  the archive.
- The main tab prepares the months by itself after sign-in (server on): missing and changed ones, in the background,
  in parts, while you are not typing. There is no button.
- The past in a report is not recounted: a new agent for a customer, a new price list or catalogue leaves archived
  orders in the report as they were. An order brought back from the archive gets its month recounted by itself.
- Ready months come from the server for people with Reports and access to all tables; everyone else counts them
  on their own computer.
- Long calculations (years of data) run in the background: "Building report · 42%". The screen never freezes; you
  can go to another section.
- After a change in another tab (a station scan, for example) the previous charts stay on screen and the header
  shows "Updating · 42%" while the new ones are counted.

## 4. Building your own report

1. **+ New** (or Copy a starter) → Edit opens.
2. Name, folder ("Production / Cutting"), who sees it: Only me or Everyone with Reports.
3. **+ Page** — pages. Page name, ← → order, Portrait or Landscape — how this page prints.
4. **+ Add chart** — a chart. Click a chart to set it up on the right.
5. **+ Control** — a filter button above the report (Glass, Thickness, Customer…).
6. **Save** writes the report. **Cancel** returns it as it was. ERP asks before you leave unsaved changes.

### 4.1 Chart setup

| Field | What it is |
|---|---|
| Chart type | Number (totals), Table, Bars, Columns, Combo, Line, Pie. One click to change. |
| Title | Your own title; empty — a title from the data. |
| Data | The data source (list in section 5). |
| Dimension | What rows are split by (Glass, Thickness, Batch, day, month…). Dates: Day, Week, Month, Quarter, Year, Weekday, Hour. |
| + Row dimension | Table only: more row dimensions, each its own column, e.g. Thickness → Glass → Batch. Rows go by name; a value repeated from the row above is faded, so groups are easy to see. |
| Breakdown | The second dimension: columns in a table, colours (stacked) on a chart. All values, no "Other". |
| Metrics | What to count. A number field — Sum, Average, Min, Max; a text field — count and distinct. As many metrics as you need. |
| + Calculated | A quick two-part formula: metric ÷ × + − another metric or a number. |
| + Custom metric | Your own formula of any length (section 6). |
| Filter / + Add filter | Filter rows by a field: Is any of, Contains, >, Between… |
| + Metric filter | Filter by a metric (section 7). |
| Date range | Report period or the chart's own period; the date field when there are several (Created, Due, Shipped…). |
| Comparison | Previous period or Same period last year: the previous number and ▲▼ % next to it. |
| Sort · rows | Row order; Top N keeps the first N, Other row shows the rest as one row. By default everything is shown. |
| Layout | Full width or Half width; Totals — the totals row of a table. |

### 4.2 Tables, bars, pies, Combo

- A table shows every row: it scrolls inside its card, the header and Total stay in place. The row count is under it.
- **Tables work like Sales:** the gear at the left of the header is Columns (which columns show); the header edge
  drags the width, the header itself moves the column; the icon by a header sorts and hides the column. The view is
  yours in this browser (Standard view in Columns returns the report's view); in Edit it is the report's view for
  everyone. An empty cell shows a grey "–".
- **Sorting:** click a column header to sort by it (▼ biggest first, click again for ▲). The order is yours, in this
  browser; Reset returns the report's order.
- **CSV** in the corner of every chart — all its rows and columns as a file for Excel, plain numbers, with Total.
- **Combo** — two metrics on one chart: the column is the first metric, a narrow inner column is the second on its
  own scale. For example "sheets cut per month" with "batches" inside. Hover to see both numbers.
- Bars and the pie legend show every value and scroll inside the card. The pie sits left, its labels right in columns.
- **Columns:** a number above every column; hover — the column is outlined and the number is large.
- Days over years become a dense histogram: every day is visible; hover for the date and number.

## 5. Data sources

Each source has its own rows and fields. Fields of one source never share a name: "Glass" is the glass type,
"Glass pcs" is pieces.

Every field and metric explains itself. Under the Dimension and Metrics lists a line says what the chosen item is
(e.g. "Glass · distinct — how many different Glass values"); each option and each field button under the formula
has the same text as a tooltip, and pointing at a button shows it under the buttons. Kinds: **list** (group or
filter by it), **text**, **date**, **number** (sum, average, min, max). **Glass · count** counts rows where Glass is
filled; **Glass · distinct** counts different glass types.

| Source | A row is | Main use |
|---|---|---|
| Station work | a station scan of a glass | glass, ft², units, $ by price list, who, where, when |
| Cutting | a cut at CUT | glass and ft² cut, cutter, batches |
| Sheets | a sheet of a batch cut plan | sheets, sheet ft², used, waste, Used % — by the cut plan |
| Sheets cut | a sheet by the cutter's scan | sheets cut, broken (Broken is separate — broken sheets are not cut sheets) |
| Edgework · Drilling & CNC · All operations | a work on a glass | linear inches, pieces, work ft², $ |
| Tempering · IGU & lamination · Shipping handout | a scan at that station | glass, ft², units |
| Batches | batch × glass × order | sheets, offcuts, Used %, days to cut |
| Plan vs actual | batch × glass | cut plan against reality: planned and cut sheets, broken, planned and actual waste (section 5.1) |
| Orders & due dates | an order | on time / late, days at each stage, total |
| Ordered glass · Products sold | an order line | what was ordered and sold, by measures and money |
| Breaks & recuts | broken glass, Recut, NCR | where, why, who, what it cost |
| Deliveries & pickups | a packing slip | trips, trucks, km, skids |
| Quotes | a quote | won, sent, value |
| Payments · Payments by order · Refunds · Balances & overdue · Agent commissions | money | Finance / Commissions access only |
| Stock counts · Sheet moves · IGU materials used · Offcuts in stock | stock | counts, sheet moves, IGU consumption |
| Stock now | a stock line now | everything on the shelves in one table: sheets, offcuts, consumables, stock items (section 5.2) |
| PO lines · Supplier receipts · Supplier bills | purchasing | Purchasing access only |
| Shop now | a glass in the shop now | where it is, days waiting, overdue |
| Customers | a customer | last order, new customers, sales |

### 5.1 Plan vs actual

A row is a batch and a glass. It compares what the cut plan intended with what really happened in the shop.

| Field | How it is counted |
|---|---|
| Plan sheets, Plan sheet ft² | sheets and their area in the batch cut plan |
| Plan glass ft², Plan waste ft² | used glass and waste by the plan |
| Sheets cut, Cut sheet ft² | sheets cut by the cutter's scan (first cut from a sheet) |
| Sheets broken, Broken sheet ft² | broken sheets — separate: a broken sheet is not a cut sheet and is not in actual waste |
| Good glass ft² | glass of the batch that was cut and not broken |
| Recut ft², Recut pcs | glass that was cut and then broken (went to Recut) |
| Actual waste ft² | Cut sheet ft² − Good glass ft² − Recut ft² |
| Plan waste %, Actual waste % | waste ÷ sheet area × 100 — by plan and in fact |
| Sheets over plan | Sheets cut − Plan sheets; negative for a batch still being cut |
| Cutter | who cut most sheets of the batch |

Starter report **Cutting · plan vs actual** (Production / Cutting): totals, sheets per month with batches inside
(Combo), by cutter, by thickness and glass, and a Batches page with every batch.

### 5.2 Stock now

A row is a stock line now: a sheet size, an offcut on the rack or in a batch, a consumable, a stock item. On hand,
Free, Reserved, On order and Minimum are in the row's unit (sheets, pieces, kg, ft); a total adds up one unit only.
Starter report **Stock now · everything on the shelves** (Inventory).

## 6. Custom metric

Your own formula, like a calculated field in Looker Studio. Create it once; it then appears in the Metrics list of
every chart of this source in the report.

1. In Chart setup, **+ Custom metric**.
2. **Name** — your name, e.g. `Waste %`.
3. **Formula** — the formula. Below it you see "Formula is OK" or what is wrong, in words.
4. Format: Number, Money or Percent; decimals.
5. **Save metric** — the metric is added to this chart and appears in the Metrics list.

### Writing a formula

- A field or metric goes in square brackets, named as in the list: `[Sheets]`, `[Waste ft²]`, `[Used %]`. The
  buttons under the formula insert them for you.
- **Field as** — how a field button inserts the field: Auto (a number as a sum, text as Count distinct), Sum,
  Average, Min, Max, Count, Count distinct. For example, Count + Glass → `COUNT([Glass])`.
- Operations: `+  -  *  /` and brackets `( )`.
- Functions: `SUM`, `AVG`, `MIN`, `MAX`, `COUNT`, `COUNT_DISTINCT`. `COUNT()` with no field counts rows.
- A number field without a function is a sum: `[Sheets]` is the same as `SUM([Sheets])`.
- A custom metric can use another one by name: `[Waste %] * 2`.
- Division by zero gives an empty value, not an error.

### Shop examples

| Name | Formula | Source |
|---|---|---|
| Waste % | `[Waste ft²] / [Sheet ft²] * 100` | Sheets |
| Waste % (from batch sheets) | `([Sheet ft²] - [Used ft²]) / [Sheet ft²] * 100` | Batches |
| Sheets per day | `SUM([Sheets]) / COUNT_DISTINCT([Batch day])` | Batches |
| ft² per day | `[Glass ft²] / COUNT_DISTINCT([Batch day])` | Batches |
| Glass per batch | `[Glass pcs] / COUNT_DISTINCT([Batch])` | Batches |
| Broken per 100 sheets | `[Broken] / [Sheets cut] * 100` | Sheets cut |

## 7. Metric filter

Like a metric filter in Looker: a chart row stays if its metric fits.

1. **+ Metric filter** in Chart setup.
2. A metric (any, your own too), a condition `>  ≥  <  ≤  =  Between`, a number.

Examples: in a table by batch `Used % < 60` — only batches with a poor cut; by cutter `Waste % > 35`; by day
`Sheets broken > 0`. The filter works on chart rows (batch, day, cutter); the total below counts the remaining rows.
With no row dimension the filter checks the whole total.

## 8. Colours

- 24 saturated colours, for reports only, in two rows of 12. A report uses them in order.
- Your own colour for a value: in Edit, click the value in the legend (e.g. "6CLEAR") → swatches → pick. The colour is
  kept in the report and is the same on all its charts. **Automatic** returns to the order.
- Filters never recolour: a value keeps its colour whatever you select.

## 9. Printing

- **Print** prints every page of the report, each on its own Letter sheet. Need two sheets — make two pages.
- Orientation belongs to the page: Portrait or Landscape (in Edit, next to the page name).
- **One report page = one sheet of paper.** A sheet is the report as on screen, scaled only to the paper width.
- The red dashed **End of page · Letter portrait** line (in view and in Edit) is the paper edge. Anything below does
  not print: blocks and rows below fade with hatching, and the line says "N rows won't print". Nothing is shrunk for
  you: make it fit with a block's corner or a second page (+ Page).
- On paper a table is what shows in its card above the edge: whole rows, then "+ N more rows — CSV" and Total for
  all rows. All rows — use CSV.
- Charts print in colour; the browser's site address and date are not on the sheet.
- The print window has "Save as PDF".

## 10. The manual as one PDF

`node tools/manual-pdf.js` builds the whole manual (every section of `docs/manual/`) into a PDF in Russian and
English: cover, contents, chapters, page numbers. The files go to Downloads.

## 10.1 Reports on people's and stations' screens

**Show on** (administrator or the Screens tick): the report becomes a tab on the Board of chosen stations and in the
Overview of chosen people. Filters "This station" and "Me" use the screen's station and the signed-in person.

## 11. Why it works this way

- "Do not limit anything, load everything" (owner, 3 Nov 2026) — so rows, values and days are never cut; speed comes
  from scrolling, drawing on demand and background counting with a percentage.
- The archive is read in parts and kept per closed month: a 5–7 year report never holds every year's records in
  memory.
- Month closing, as in large ERPs (owner, 4 Nov 2026): a month is counted once for everyone and kept on the server;
  the past in reports is not recounted (the owner's option A).
- Custom metrics and metric filters let you find problems yourself: plan versus actual, waste, breaks, who and where.

## 12. All fields and metrics (from the code)

Generated by `node tools/manual-fields.js --write`; a test checks it against the code.

<!-- fields:start -->

### Station work

Glass through every station.

| Field | Kind |
|---|---|
| Scan time | Date |
| Station | List |
| Person | List |
| Customer | List |
| Order | Text |
| Glass | List |
| Thickness | List |
| Temper | List |
| Unit type | List |
| Priority | List |
| Batch | Text |
| Scan | List |
| Glass ID | Text |
| Dolly / skid | List |
| Original or recut | List |
| Due | Date |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Glass ft² | Number |
| $ by price list | Number |

| Metric | How |
|---|---|
| Glass pcs | Count of rows |
| Glass ft² | Sum of Glass ft² |
| Units | Distinct unitKey |
| Orders | Distinct Order |
| $ by price list | Sum of $ by price list |

### Cutting

Glass cut at CUT.

| Field | Kind |
|---|---|
| Scan time | Date |
| Station | List |
| Cutter | List |
| Customer | List |
| Order | Text |
| Glass | List |
| Thickness | List |
| Temper | List |
| Unit type | List |
| Priority | List |
| Batch | Text |
| Scan | List |
| Glass ID | Text |
| Dolly / skid | List |
| Original or recut | List |
| Due | Date |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Glass ft² | Number |
| $ by price list | Number |

| Metric | How |
|---|---|
| Glass cut | Count of rows |
| ft² cut | Sum of Glass ft² |
| Orders | Distinct Order |
| Batches | Distinct Batch |

### Sheets

Sheet sizes used and waste.

| Field | Kind |
|---|---|
| Built | Date |
| Batch | Text |
| Glass | List |
| Thickness | List |
| Sheet size | List |
| Sheet or offcut | List |
| Status | List |
| Manufacturer | List |
| Sheets | Number |
| Broken | Number |
| Sheet ft² | Number |
| Glass ft² | Number |
| Waste ft² | Number |
| To stock ft² | Number |

| Metric | How |
|---|---|
| Sheets | Sum of Sheets |
| Sheet ft² | Sum of Sheet ft² |
| Glass ft² | Sum of Glass ft² |
| Waste ft² | Sum of Waste ft² |
| Used % | Glass ft² ÷ Sheet ft² × 100 |
| Broken | Sum of Broken |

### Edgework

Linear inches by operation.

| Field | Kind |
|---|---|
| Scan time | Date |
| Station | List |
| Person | List |
| Customer | List |
| Order | Text |
| Glass | List |
| Thickness | List |
| Temper | List |
| Unit type | List |
| Priority | List |
| Batch | Text |
| Dolly / skid | List |
| Original or recut | List |
| Due | Date |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Operation | List |
| Unit | List |
| Quantity | Number |
| Linear in | Number |
| Work ft² | Number |
| Pieces | Number |
| $ by price list | Number |

| Metric | How |
|---|---|
| Linear in | Sum of Linear in |
| Operations | Count of rows |
| Glass pcs | Distinct piece |
| $ by price list | Sum of $ by price list |

### Drilling & CNC

Holes, notches, cutouts, hardware.

| Field | Kind |
|---|---|
| Scan time | Date |
| Station | List |
| Person | List |
| Customer | List |
| Order | Text |
| Glass | List |
| Thickness | List |
| Temper | List |
| Unit type | List |
| Priority | List |
| Batch | Text |
| Dolly / skid | List |
| Original or recut | List |
| Due | Date |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Operation | List |
| Unit | List |
| Quantity | Number |
| Linear in | Number |
| Work ft² | Number |
| Pieces | Number |
| $ by price list | Number |

| Metric | How |
|---|---|
| Pieces | Sum of Pieces |
| Glass pcs | Distinct piece |
| $ by price list | Sum of $ by price list |

### All operations

Every priced work at every station.

| Field | Kind |
|---|---|
| Scan time | Date |
| Station | List |
| Person | List |
| Customer | List |
| Order | Text |
| Glass | List |
| Thickness | List |
| Temper | List |
| Unit type | List |
| Priority | List |
| Batch | Text |
| Dolly / skid | List |
| Original or recut | List |
| Due | Date |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Operation | List |
| Unit | List |
| Quantity | Number |
| Linear in | Number |
| Work ft² | Number |
| Pieces | Number |
| $ by price list | Number |

| Metric | How |
|---|---|
| Quantity | Sum of Quantity |
| Linear in | Sum of Linear in |
| Work ft² | Sum of Work ft² |
| Pieces | Sum of Pieces |
| $ by price list | Sum of $ by price list |

### Tempering

Glass through the furnace.

| Field | Kind |
|---|---|
| Scan time | Date |
| Station | List |
| Operator | List |
| Customer | List |
| Order | Text |
| Glass | List |
| Thickness | List |
| Temper | List |
| Unit type | List |
| Priority | List |
| Batch | Text |
| Scan | List |
| Glass ID | Text |
| Dolly / skid | List |
| Original or recut | List |
| Due | Date |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Glass ft² | Number |
| $ by price list | Number |

| Metric | How |
|---|---|
| Glass pcs | Count of rows |
| Glass ft² | Sum of Glass ft² |
| Orders | Distinct Order |

### IGU & lamination

Units assembled.

| Field | Kind |
|---|---|
| Scan time | Date |
| Station | List |
| Assembler | List |
| Customer | List |
| Order | Text |
| Glass | List |
| Thickness | List |
| Temper | List |
| Unit type | List |
| Priority | List |
| Batch | Text |
| Scan | List |
| Glass ID | Text |
| Dolly / skid | List |
| Original or recut | List |
| Due | Date |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Glass ft² | Number |
| $ by price list | Number |

| Metric | How |
|---|---|
| Units | Distinct asmDone |
| Glass pcs | Count of rows |
| Glass ft² | Sum of Glass ft² |

### Shipping handout

Glass and units handed out at SHIP.

| Field | Kind |
|---|---|
| Scan time | Date |
| Station | List |
| Handed out by | List |
| Customer | List |
| Order | Text |
| Glass | List |
| Thickness | List |
| Temper | List |
| Unit type | List |
| Priority | List |
| Batch | Text |
| Scan | List |
| Glass ID | Text |
| Dolly / skid | List |
| Original or recut | List |
| Due | Date |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Glass ft² | Number |
| $ by price list | Number |

| Metric | How |
|---|---|
| Units | Distinct unitKey |
| Glass pcs | Count of rows |
| Glass ft² | Sum of Glass ft² |
| Orders | Distinct Order |

### Deliveries & pickups

Packing slips, trips, skids.

| Field | Kind |
|---|---|
| Date | Date |
| Method | List |
| Status | List |
| Truck | List |
| Driver | List |
| Customer | List |
| Packing slip | Text |
| City | List |
| Departs | List |
| Stop # | Number |
| Units | Number |
| Skids | Number |
| Weight kg | Number |
| Km | Number |

| Metric | How |
|---|---|
| Packing slips | Count of rows |
| Trips | Distinct trip |
| Units | Sum of Units |
| Skids | Sum of Skids |
| Weight kg | Sum of Weight kg |
| Km | Sum of Km |
| Km per trip | Km ÷ kmDone |

### Orders & due dates

On time, late, days at each stage.

| Field | Kind |
|---|---|
| Due | Date |
| Created | Date |
| Shipped | Date |
| Ready for pickup | Date |
| Verified | Date |
| Batched | Date |
| All ready | Date |
| Done | Date |
| Order | Text |
| Customer | List |
| Priority | List |
| Delivery | List |
| Status | List |
| On time | List |
| On hold | List |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Units | Number |
| Glass pcs | Number |
| Area ft² | Number |
| Lines | Number |
| Shapes | Number |
| Weight kg | Number |
| Weight | List |
| Days late | Number |
| Lead time, days | Number |
| Days new → verified | Number |
| Days verified → batched | Number |
| Days batched → ready | Number |
| Days ready → done | Number |
| Order total | Number |

| Metric | How |
|---|---|
| Orders | Count of rows |
| Late orders | Sum of late |
| On time % | onTimeN ÷ judgedN × 100 |
| Units | Sum of Units |
| Glass pcs | Sum of Glass pcs |
| Area ft² | Sum of Area ft² |
| Order total | Sum of Order total |

### Ordered glass

Glass, thickness and ft² ordered.

| Field | Kind |
|---|---|
| Created | Date |
| Due | Date |
| Order | Text |
| Customer | List |
| Glass | List |
| Thickness | List |
| Temper | List |
| Unit type | List |
| Status | List |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Glass pcs | Number |
| Glass ft² | Number |
| Units | Number |

| Metric | How |
|---|---|
| Glass pcs | Sum of Glass pcs |
| Glass ft² | Sum of Glass ft² |
| Units | Sum of Units |
| Orders | Distinct Order |

### Breaks & recuts

Recut and NCR glass.

| Field | Kind |
|---|---|
| Date | Date |
| Kind | List |
| Station | List |
| Reason | List |
| Person | List |
| Customer | List |
| Order | Text |
| Glass | List |
| Thickness | List |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Glass pcs | Number |
| Glass ft² | Number |
| $ by price list | Number |

| Metric | How |
|---|---|
| Glass pcs | Sum of Glass pcs |
| Glass ft² | Sum of Glass ft² |
| $ by price list | Sum of $ by price list |
| Records | Count of rows |

### Time at stations

First to last scan per person and day.

| Field | Kind |
|---|---|
| Day | Date |
| Person | List |
| Station | List |
| First scan hour | Number |
| Last scan hour | Number |
| Hours between scans | Number |
| Glass pcs | Number |
| Glass ft² | Number |

| Metric | How |
|---|---|
| Hours | Sum of Hours between scans |
| Glass pcs | Sum of Glass pcs |
| Glass per hour | glassTimed ÷ hoursTimed |
| Person-days | Count of rows |

### Quotes

Won, sent, expired, value.

| Field | Kind |
|---|---|
| Created | Date |
| Sent | Date |
| Valid until | Date |
| Quote | Text |
| Customer | List |
| Status | List |
| Won order | Text |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Revisions | Number |
| Units | Number |
| Area ft² | Number |
| Quote value | Number |
| Won value | Number |

| Metric | How |
|---|---|
| Quotes | Count of rows |
| Won | Sum of won |
| Win rate % | won ÷ one × 100 |
| Quote value | Sum of Quote value |
| Won value | Sum of Won value |
| Area ft² | Sum of Area ft² |

### Payments · finance

Receipts by date, customer, method.

| Field | Kind |
|---|---|
| Date | Date |
| Receipt | Text |
| Customer | List |
| Method | List |
| Currency | List |
| Sales rep | List |
| City | List |
| Customer type | List |
| Amount | Number |
| Applied to orders | Number |
| On account | Number |
| Orders paid | Number |

| Metric | How |
|---|---|
| Amount | Sum of Amount |
| Receipts | Count of rows |
| Applied to orders | Sum of Applied to orders |
| On account | Sum of On account |
| Customers | Distinct Customer |

### Balances & overdue · finance · now

What customers owe and how late.

| Field | Kind |
|---|---|
| Payment due | Date |
| Billed | Date |
| Order | Text |
| Customer | List |
| Status | List |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Order total | Number |
| Paid | Number |
| Balance | Number |
| Overdue | Number |
| Days overdue | Number |

| Metric | How |
|---|---|
| Balance | Sum of Balance |
| Overdue | Sum of Overdue |
| Overdue orders | Sum of overdueN |
| Orders | Count of rows |
| Paid | Sum of Paid |
| Order total | Sum of Order total |

### Products sold

Every product, work and service sold.

| Field | Kind |
|---|---|
| Order date | Date |
| Due | Date |
| Shipped | Date |
| Order | Text |
| Customer | List |
| Category | List |
| Type | List |
| Product | List |
| Unit | List |
| Thickness | List |
| Temper | List |
| Station | List |
| Unit type | List |
| Makeup | Text |
| Charged | List |
| Status | List |
| Priority | List |
| Delivery | List |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Quantity | Number |
| Amount | Number |
| Price per unit | Number |
| By price list | Number |
| Units | Number |
| Unit ft² | Number |
| Glass ft² | Number |
| Film ft² | Number |
| Laminate ft² | Number |
| Spacer ft | Number |
| Linear in | Number |
| Pieces | Number |
| Work ft² | Number |

| Metric | How |
|---|---|
| Amount | Sum of Amount |
| Quantity | Sum of Quantity (one unit only) |
| Avg price per unit | Amount ÷ Quantity (one unit only) |
| Orders | Distinct Order |
| Customers | Distinct Customer |
| Units | Sum of Units |
| Unit ft² | Sum of Unit ft² |
| Glass ft² | Sum of Glass ft² |
| Film ft² | Sum of Film ft² |
| Laminate ft² | Sum of Laminate ft² |
| Linear in | Sum of Linear in |
| Pieces | Sum of Pieces |
| Work ft² | Sum of Work ft² |
| Spacer ft | Sum of Spacer ft |
| By price list | Sum of By price list |

### Shop now · now

Where every glass is, days waiting, overdue.

| Field | Kind |
|---|---|
| Where | List |
| Stage | List |
| Due state | List |
| Due | Date |
| Waiting since | Date |
| Order | Text |
| Customer | List |
| Priority | List |
| Delivery | List |
| On hold | List |
| Status | List |
| Came from | List |
| Dolly / skid | List |
| Glass | List |
| Thickness | List |
| Batch | Text |
| Glass ID | Text |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Glass pcs | Number |
| Glass ft² | Number |
| Days waiting | Number |
| Days overdue | Number |
| Overdue glass | Number |

| Metric | How |
|---|---|
| Glass pcs | Sum of Glass pcs |
| Glass ft² | Sum of Glass ft² |
| Orders | Distinct Order |
| Overdue orders | Distinct overOrder |
| Overdue glass | Sum of Overdue glass |

### Sheets cut

Sheets cut and broken by cutter.

| Field | Kind |
|---|---|
| Date | Date |
| Cutter | List |
| Cut or broke | List |
| Glass | List |
| Thickness | List |
| Sheet size | List |
| Sheet or offcut | List |
| Batch | Text |
| Sheets cut | Number |
| Broken | Number |
| Sheet ft² | Number |

| Metric | How |
|---|---|
| Sheets cut | Sum of Sheets cut |
| Broken | Sum of Broken |
| Sheet ft² | Sum of Sheet ft² |
| Batches | Distinct Batch |

### Offcuts in stock · now

Sheet offcuts kept, used, removed.

| Field | Kind |
|---|---|
| Booked | Date |
| Offcut | Text |
| Glass | List |
| Thickness | List |
| Manufacturer | List |
| Size | List |
| Batch | Text |
| Status | List |
| Area ft² | Number |

| Metric | How |
|---|---|
| Offcuts | Count of rows |
| Area ft² | Sum of Area ft² |

### Batches

Glass, sheets and days to cut by batch.

| Field | Kind |
|---|---|
| Built | Date |
| First cut | Date |
| Last cut | Date |
| Batch day | List |
| Batch | Text |
| Status | List |
| Glass | List |
| Thickness | List |
| Order | Text |
| Customer | List |
| Glass pcs | Number |
| Glass ft² | Number |
| Glass cut | Number |
| Sheets | Number |
| Offcuts used | Number |
| Sheet ft² | Number |
| Used ft² | Number |
| Sheets broken | Number |
| Days to first cut | Number |
| Days to last cut | Number |

| Metric | How |
|---|---|
| Batches | Distinct Batch |
| Glass pcs | Sum of Glass pcs |
| Glass ft² | Sum of Glass ft² |
| Orders | Distinct Order |
| Sheets | Sum of Sheets |
| Offcuts used | Sum of Offcuts used |
| Sheet ft² | Sum of Sheet ft² |
| Used % | Used ft² ÷ Sheet ft² × 100 |
| Sheets broken | Sum of Sheets broken |
| Days to first cut · avg | Average of Days to first cut |
| Days to last cut · avg | Average of Days to last cut |

### Stock counts · inventory

Was → counted, difference, reason.

| Field | Kind |
|---|---|
| Count time | Date |
| Count day | List |
| Counted by | List |
| Kind | List |
| Material | List |
| Glass | List |
| Sheet size | List |
| Thickness | List |
| Unit | List |
| Short or over | List |
| Reason | List |
| Note | Text |
| Was | Number |
| Counted | Number |
| Difference | Number |
| Sheets | Number |
| Sheet ft² | Number |
| Spacer ft | Number |
| Sealant kg | Number |
| Gas kg | Number |
| IGU parts kg | Number |
| Stock items, pcs | Number |

| Metric | How |
|---|---|
| Lines counted | Count of rows |
| With difference | Sum of off |
| Short | Sum of short |
| Over | Sum of over |
| Days counted | Distinct Count day |
| Difference | Sum of Difference (one unit only) |
| Sheets | Sum of Sheets |
| Sheet ft² | Sum of Sheet ft² |
| Spacer ft | Sum of Spacer ft |
| Sealant kg | Sum of Sealant kg |
| Gas kg | Sum of Gas kg |
| IGU parts kg | Sum of IGU parts kg |
| Stock items, pcs | Sum of Stock items, pcs |

### Sheet moves · inventory

Received, cut, broke, written off, counted.

| Field | Kind |
|---|---|
| Date | Date |
| Move | List |
| In or out | List |
| Sheet | List |
| Glass | List |
| Sheet size | List |
| Thickness | List |
| Person | List |
| Reason | List |
| Reference | Text |
| Batch | Text |
| Note | Text |
| Sheets moved | Number |
| Sheets in | Number |
| Sheets out | Number |
| Net sheets | Number |
| ft² moved | Number |
| ft² in | Number |
| ft² out | Number |
| Net ft² | Number |

| Metric | How |
|---|---|
| Sheets in | Sum of Sheets in |
| Sheets out | Sum of Sheets out |
| Net sheets | Sum of Net sheets |
| Sheets moved | Sum of Sheets moved |
| ft² in | Sum of ft² in |
| ft² out | Sum of ft² out |
| Net ft² | Sum of Net ft² |
| Moves | Count of rows |

### IGU materials used · inventory

Spacer, sealant, gas by IGU scan.

| Field | Kind |
|---|---|
| Assembled | Date |
| Assembled by | List |
| Kind | List |
| Material | List |
| Unit | List |
| Record | List |
| Norm | List |
| Quantity | Number |
| Spacer ft | Number |
| Sealant kg | Number |
| Gas kg | Number |
| IGU parts kg | Number |
| Units built with it | Number |
| Units without norm | Number |

| Metric | How |
|---|---|
| Quantity | Sum of Quantity (one unit only) |
| Spacer ft | Sum of Spacer ft |
| Sealant kg | Sum of Sealant kg |
| Gas kg | Sum of Gas kg |
| IGU parts kg | Sum of IGU parts kg |
| Units built with it | Sum of Units built with it |
| Units without norm | Sum of Units without norm |
| Days | Distinct Assembled |

### PO lines · purchasing

Ordered, received, waiting, amount.

| Field | Kind |
|---|---|
| PO date | Date |
| Expected | Date |
| Sent | Date |
| PO | Text |
| Supplier | List |
| Currency | List |
| Account | List |
| Status | List |
| Held | List |
| Price unit | List |
| Kind | List |
| Item group | List |
| Item | List |
| Glass | List |
| Thickness | List |
| Sheet size | List |
| Unit | List |
| Ordered | Number |
| Received | Number |
| Waiting | Number |
| Replacement due | Number |
| Sheets ordered | Number |
| Sheet ft² ordered | Number |
| Price | Number |
| Amount | Number |

| Metric | How |
|---|---|
| PO lines | Count of rows |
| POs | Distinct PO |
| Amount | Sum of Amount (one unit only) |
| Lines waiting | Sum of waiting |
| Waiting past expected | Sum of overdue |
| Lines without price | Sum of unpriced |
| Sheets ordered | Sum of Sheets ordered |
| Sheet ft² ordered | Sum of Sheet ft² ordered |
| Suppliers | Distinct Supplier |

### Supplier receipts · purchasing

Arrived, broken, late.

| Field | Kind |
|---|---|
| Received on | Date |
| Expected | Date |
| Receipt | Text |
| PO | Text |
| Supplier | List |
| Received by | List |
| Packing slip | Text |
| New or replacement | List |
| On time | List |
| Broken · reason | List |
| Broken · resolution | List |
| Kind | List |
| Item group | List |
| Item | List |
| Glass | List |
| Thickness | List |
| Sheet size | List |
| Unit | List |
| Received | Number |
| Broken | Number |
| Sheets | Number |
| Sheet ft² | Number |
| Days late | Number |

| Metric | How |
|---|---|
| Receipt lines | Count of rows |
| Receipts | Distinct Receipt |
| Late lines | Sum of late |
| On time % | onTimeN ÷ judgedN × 100 |
| Lines with broken | Sum of brokenLines |
| Broken | Sum of Broken (one unit only) |
| Sheets | Sum of Sheets |
| Sheet ft² | Sum of Sheet ft² |

### Supplier bills · purchasing

Invoices, payments, balance, overdue.

| Field | Kind |
|---|---|
| Date | Date |
| Due | Date |
| Invoice or payment | List |
| Document | Text |
| Supplier | List |
| Currency | List |
| Account | List |
| Status | List |
| POs | Text |
| Payment method | List |
| Invoiced | Number |
| Paid | Number |
| Balance | Number |
| Invoice balance | Number |
| Overdue | Number |
| Days overdue | Number |
| Days to pay | Number |

| Metric | How |
|---|---|
| Invoiced | Sum of Invoiced (one unit only) |
| Paid | Sum of Paid (one unit only) |
| Balance | Sum of Balance (one unit only) |
| Overdue | Sum of Overdue (one unit only) |
| Invoices | Sum of invoices |
| Invoices overdue | Sum of overdueN |
| Amount needed | Sum of amountNeeded |
| Documents | Count of rows |

### Payments by order · finance

What each order got, when, how late.

| Field | Kind |
|---|---|
| Paid | Date |
| Order date | Date |
| Billed | Date |
| Payment due | Date |
| Receipt | Text |
| Order | Text |
| Customer | List |
| Method | List |
| Currency | List |
| When paid | List |
| Sales rep | List |
| City | List |
| Customer type | List |
| Amount | Number |
| Paid late | Number |
| Days to pay | Number |
| Days late | Number |

| Metric | How |
|---|---|
| Amount | Sum of Amount (one unit only) |
| Payments | Count of rows |
| Orders | Distinct Order |
| Paid late | Sum of Paid late (one unit only) |
| Days to pay · avg | Average of Days to pay |
| Customers | Distinct Customer |

### Refunds · finance

Money back: amount, reason.

| Field | Kind |
|---|---|
| Refund date | Date |
| Refund | Text |
| From payment | Text |
| Customer | List |
| Method | List |
| Currency | List |
| Reason | List |
| Sales rep | List |
| Amount | Number |
| Days after payment | Number |

| Metric | How |
|---|---|
| Refunded | Sum of Amount (one unit only) |
| Refunds | Count of rows |
| Customers | Distinct Customer |

### Agent commissions · commissions · now

Earned, paid out, owed by agent.

| Field | Kind |
|---|---|
| Order date | Date |
| Agent | List |
| Customer | List |
| Order | Text |
| Percent | List |
| Order total | Number |
| Paid by customer | Number |
| Paid without HST | Number |
| Earned | Number |
| Earned with HST | Number |
| Paid out | Number |
| To pay | Number |
| To pay with HST | Number |

| Metric | How |
|---|---|
| Earned | Sum of Earned |
| Paid out | Sum of Paid out |
| To pay | Sum of To pay |
| Earned with HST | Sum of Earned with HST |
| To pay with HST | Sum of To pay with HST |
| Paid by customers | Sum of Paid by customer |
| Paid without HST | Sum of Paid without HST |
| Orders | Count of rows |
| Orders to pay | Sum of owed |
| Agents | Distinct Agent |

### Customers · customers · now

Last order, days since, new by month.

| Field | Kind |
|---|---|
| Last order | Date |
| First order | Date |
| Customer since | Date |
| Customer | List |
| Last order · how long ago | List |
| Sales rep | List |
| Customer type | List |
| City | List |
| Province | List |
| Status | List |
| Terms | List |
| Currency | List |
| Days since last order | Number |
| Orders | Number |
| Sales total | Number |

| Metric | How |
|---|---|
| Customers | Sum of customers |
| With orders | Sum of buying |
| Ordered in 90 days | Sum of active |
| No order 180+ days | Sum of lapsed |
| Orders | Sum of Orders |
| Sales total | Sum of Sales total (one unit only) |
| Average order | Sales total ÷ Orders (one unit only) |
| Days since last order · avg | Average of Days since last order |

### Plan vs actual

Cut plan against what was really cut.

| Field | Kind |
|---|---|
| Built | Date |
| First cut | Date |
| Batch | Text |
| Glass | List |
| Thickness | List |
| Cutter | List |
| Status | List |
| Plan sheets | Number |
| Sheets cut | Number |
| Sheets over plan | Number |
| Sheets broken | Number |
| Plan sheet ft² | Number |
| Cut sheet ft² | Number |
| Broken sheet ft² | Number |
| Plan glass ft² | Number |
| Good glass ft² | Number |
| Recut ft² | Number |
| Recut pcs | Number |
| Plan waste ft² | Number |
| Actual waste ft² | Number |

| Metric | How |
|---|---|
| Plan sheets | Sum of Plan sheets |
| Sheets cut | Sum of Sheets cut |
| Sheets over plan | Sum of Sheets over plan |
| Sheets broken | Sum of Sheets broken |
| Plan waste % | Plan waste ft² ÷ Plan sheet ft² × 100 |
| Actual waste % | Actual waste ft² ÷ Cut sheet ft² × 100 |
| Recut ft² | Sum of Recut ft² |
| Batches | Distinct Batch |

### Stock now · inventory · now

Everything on the shelves now.

| Field | Kind |
|---|---|
| Kind | List |
| Material | List |
| Glass | List |
| Thickness | List |
| Size | List |
| Unit | List |
| Status | List |
| On hand | Number |
| Free | Number |
| Reserved | Number |
| On order | Number |
| Minimum | Number |
| Sheet ft² on hand | Number |
| Pieces | Number |

| Metric | How |
|---|---|
| On hand | Sum of On hand (one unit only) |
| Free | Sum of Free (one unit only) |
| Reserved | Sum of Reserved (one unit only) |
| On order | Sum of On order (one unit only) |
| Sheet ft² on hand | Sum of Sheet ft² on hand |
| Pieces | Sum of Pieces |
| Lines | Count of rows |

<!-- fields:end -->
