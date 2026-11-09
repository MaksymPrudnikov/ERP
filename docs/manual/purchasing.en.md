# Purchasing

Buying from suppliers: supplier cards, purchase orders (PO), receipts, stock held at the supplier, supplier invoices and
payments, what we owe. The section is visible to people with the Purchasing box ticked in Users. Customer money is in
Finance ([finance.en.md](finance.en.md)), stock in Inventory ([inventory.en.md](inventory.en.md)).

## The screen

Top left — the section picker **Purchase orders ▾**: Purchase orders, Receipts, Backorders, Held at supplier, Delivery
requests, Invoices, Payments, We owe, Suppliers, History. On the right — the section's main button (+ New Purchase
Order, + Receipt, + Request, + Invoice, + Payment record, + Supplier). Lists work as in Sales: status pills, the **Date**
period, filter and sorting in the header, ⚙ Columns, total at the bottom ([lists.en.md](lists.en.md)). Deleted and
cancelled records stay hidden until **Include deleted** / **Include undone / cancelled** is ticked.

The section's general rule: almost nothing is required, warnings never stop Save. Supplier, price, unit and date may be
empty; an empty amount means “unknown”, not zero. Every record and its history are saved as one command; a stale draft
(someone saved first) never overwrites the newer record.

## Purchase orders

- List: pills All, Today, Due this week, Needs attention; columns PO, Supplier, Date, Expected, Currency, Amount,
  Status (Columns also offers Pricing, Held at supplier, Created by).
- **The number PO-0001** is given only on a successful save. A PO can be edited after Sent, Closed, Cancelled.
  **Delete** keeps receipts, requests and their history; Restore brings back the same number.
- **Status** — Draft, Sent, Partially received, Received, Closed (Cancelled). Partially received and Received follow the
  receipts by themselves; Closed and Cancelled set by hand win. The status history is read only.

### The PO card

On top **Close**, **Save**, **Documents**, **Delete**. Fields: Supplier (+ — a new supplier), Order date, Expected date,
Currency (CAD, USD), Status, Email / notes.

- **Glass / purchase items** — the PO's glass by letter (A, B…), **+ Glass**. Glass is picked **From supply points**
  (manufacturer → thickness → glass, then a supply row: supplier, sheet size, price) or **From customer order** — a whole
  Sales line, one lite or a laminate ply. The PO keeps a snapshot of that part (glass, processing, sizes, shape, holes):
  a later edit of the order does not change what was ordered. The Sales line shows a link to the PO.
- **Order lines** — + Line: Glass, Qty, Width, Height, Unit (sheet, block, each), **Sheets / block** (per line, no fixed
  ratio), Price, Price per, Line total, Held. A line note and expected date. **+ Material** (from the Data catalog) and
  **+ Other item** (a free line). At the bottom — **Known subtotal** and how many lines lack a price, quantity or
  conversion.
- **Deliveries** — **Receive** (a receipt for this PO), **Request delivery** (ask for part of the held goods); per line —
  purchased, received, outstanding; links to GR- receipts.
- **Supplier invoices** — **+ Invoice** (an invoice for this PO). **History** — who changed what and when.
- **Documents** — the PO form for PDF and print; **Customize** shows and hides ready fields, Save as default. **Open Gmail
  + PDF** downloads the file and opens an email with To / CC and text — the attachment is added by hand; the Sent status
  is set only with the separate **Mark sent** button. The program sends no email by itself.

## Receipts

A receipt **GR-0001** is what actually arrived. It can be without a PO, without a supplier, with other goods, more than
ordered and against a closed PO.

- Fields: Purchase order (optional), Supplier, Received date, Received by, Supplier packing slip, Notes.
- **What arrived** — + Glass, + Material, + Other item: Item, Width, Height, Waiting, Arrived, Unit, **Sheets**,
  **Broken**, Reason, Resolution. Each row has its own actual size and sheet count (owner, 13 Oct 2026: sheet sizes
  vary too). A size different from the PO is flagged. Empty rows are not saved.
- Glass that came in blocks without a sheet count shows **Enter sheets** under the row and on the receipt in the list;
  stock does not count it until the sheets are entered.
- A unit different from the PO is never added silently: the warning “unit differs from the PO; quantities need review”
  and a note in the Backorders Review column stay until someone brings the row to the PO's unit.
- **Undo / Restore** of a receipt keep the history and recount what arrived and the stock.

## Backorders and Held at supplier

- **Backorders** — ordered and not arrived yet: PO, Supplier, Description, Sheet size, Purchased, Received,
  **Outstanding** (ordered − arrived, broken included), Unit, Expected, Review. Over-delivery is a negative balance.
- **Held at supplier** — bought but stored at the supplier (owner, 14 Oct 2026: “some glass comes from China — we need
  an estimate”). A row is glass + sheet size + supplier, all POs together: Bought, At supplier, Per month, Runs out,
  Lead (days), **Order by**, Status. “Pace: last 90 days. Order by = runs out − lead time.” Status: **Order now** (the
  date passed or is today), **Order soon** (within 30 days), OK, **No estimate** (nothing delivered yet — no invented
  date). Urgent first.
- **Delivery requests** — a request **DR-0001** to bring part of the held goods: the PO form titled DELIVERY REQUEST, the
  same Gmail + PDF and Mark sent. The request does not lower the held balance — only a receipt against it does.

## Invoices, Payments, We owe — supplier money

- **Invoice PI-0001** — a supplier invoice: Supplier, Supplier invoice number, Invoice date, **Invoice total** (entered
  once), Currency, Payment terms · Net days, Due date (**Use payment terms** recounts it from the supplier card), Notes,
  **Link a PO** — one invoice can cover several POs, a PO can have several invoices. No total entered — “Amount is
  unknown. Balances remain incomplete.”
- **Payment PP-0001** — a payment already made: date, amount, currency, method or bank reference, note. Several payments
  close an invoice in parts. An advance without an invoice, an overpayment, a supplier credit (a negative invoice) and a
  refund (a negative payment) can all be recorded.
- **We owe** — by supplier and currency; USD and CAD are never added together. Columns Supplier, Currency, Invoiced,
  Paid, We owe, Overdue invoices, Unknown amounts, Review payments. Positive — we owe; negative — a credit with the
  supplier. Overdue — an invoice balance past its Due date; an empty due date is never invented.
- Changing an invoice's currency or supplier after payment leaves the payment as it was; the invoice shows **Review
  payments** until someone fixes the link. A deleted invoice keeps its payments in history and on the balance; Restore
  brings the debt back.

## Suppliers

List: Supplier name, Email for PO, Phone, Currency, Payment terms · Net days, Lead time · days, Supply rows, Status.
**+ Supplier** or a click on the name opens the card:

- **Company** — Supplier name (the only required field), Our account number, Tax number, Website, Address.
- **Primary contact** — Contact name, Email for PO, Phone. **Other contacts** — + Contact (a department, a person).
- **Purchasing** — Currency, Payment terms · Net days (the default invoice term), Lead time · days (for Held at
  supplier), Payment method, Notes.
- **Custom fields** — your own labels and values. **Supply points** — this supplier's supply rows from Data.
- **Active supplier** — untick to archive; archiving can be undone and supply rows stay linked. **History** — before →
  after for every edit.

## History

The shared purchasing log: When, Document, Reference, Action, Who — creating, editing, statuses, deleting and restoring
every document of the section.
