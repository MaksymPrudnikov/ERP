# Finance

Customer money: who owes what and by which day, payments (receipts), allocating payments to orders, refunds,
statements for the customer and the file for QuickBooks. The section is visible to people with the Finance box ticked
in Users.

## How the program counts an order's money

- **Invoice** — one per order, once the customer has received the last unit (the order is picked up or delivered).
  The invoice number is the order number. **Billing date** — the handover day; it can be typed by hand in Terms.
- **Due date** — the date typed in Terms. Without one: for a credit customer, Billing date + Net days; for a cash
  customer, the handover day itself. Before handover there is no due date. A credit customer without Net days gets no
  invented date — the status is “Net days not set”.
- **Balance** — what is left to pay on the order. **Overdue** — the balance of orders past their due date.
  **Prepaid** — paid on orders still in work. **On account** — customer money not tied to any order (deposit).
- Orders without a complete price are not in the totals; they are only counted: “N not priced”.

Order money status (in the tables and in the order header):

| Status | Meaning |
|---|---|
| Paid | fully paid |
| Overdue | past due, balance unpaid |
| Customer on hold | the customer is on Hold |
| Deposit due | cash customer, deposit (Deposit %) missing before handover |
| Due Nov 30 · Due today | due on that day |
| Net 30 after pickup · Due at pickup | not handed over yet; the term starts at handover (after delivery for deliveries) |
| Net days not set | credit customer without Net days |
| Overpaid | paid more than the order total |
| Review required | negative order total — check it |
| Pricing incomplete | the order has no complete price |

## Screen

At the top, four figures for all customers: **Customers owe**, **Overdue**, **Prepaid**, **On account**. A click on a
figure opens the right table with the filter set: Overdue — overdue orders in Due dates, the others — customers in
Accounts. Under the figures, three tabs: **Accounts** (customers), **Due dates**, **Payments** (receipts).
**+ New receipt** is always on the right.

All three tables work like Sales: a filter and a quick filter in the column header, sorting, column width and order,
⚙ Columns, totals at the bottom (see [lists.en.md](lists.en.md)). Tick a row — its buttons appear above the table;
right-click a row — the same buttons as a menu.

## Accounts — customers

- **Open accounts** — customers with a balance, a prepayment or a deposit; **All customers** — everyone except
  archived customers without money.
- Columns: Customer, Terms, Balance, Overdue, Prepaid, On account, Credit limit; in ⚙ Columns also Account, Open
  orders, Status (Active, On hold, Over limit, Review required, Archived).
- Under Balance there is an aging bar: red — overdue 90+ days, yellow — 60+, orange — overdue less (Due now), green —
  Current. Amounts are in the tip on hover. The same rules as the totals at the bottom of the Statement.
- Row buttons (and right-click): **Open**, **Allocate**, **Statement**, **Apply deposit** (when there is both a
  deposit and a balance), **+ Receipt**.
- On the right above the table: **Statements** — statements for every customer for a period, **CSV** and **Print** —
  the table as on screen, with its filters.

### Customer card

Open (or click the name) — the card: Balance, Overdue, Prepaid, On account (with **Apply** when there is a balance),
Credit limit. Buttons **Allocate**, **Statement**, **+ Receipt**.

- **Orders** — orders with a balance; **Show paid orders** shows the paid ones too. Per order: the number (opens it in
  Sales), Billed, Due (red when overdue), Total, Paid, Balance, status, buttons **Invoice** (the invoice form: print,
  PDF, Gmail) and **Terms**.
- **Payments** — the customer's receipts: Amount, Applied, Refunded, On account. The number opens the receipt.
- **Refunds** — refunds, each with **Void**. **History** — the log of every change to the customer's money: before →
  after, who and when.

### Terms window

Payment terms of one order: **Cash / deposit** (Deposit %) or **Credit** (Net days), **Billing date** (blank — the
handover day), **Due date** (blank — by terms) and Note. The due date cannot be before the billing date. The change is
written to History.

## Due dates

Every unpaid order with a complete price: Due (the date and how many days are left or overdue), Customer, Order, PO,
Terms, Total, Paid, Outstanding, Status; in ⚙ Columns also Days to due and Picked up. Dates above the table:
**Overdue**, **7 days**, **30 days**, **All** or your own. Row buttons: **Open order**, **Invoice** (handed-over
orders), **Terms**. **CSV** and **Print** — the list as on screen. Orders without a price — a line under the table,
“N not priced — not in totals”.

## Payments — receipts

Receipts for the last 30 days (dates above the table: 7 days, 30 days, This month, Last month, All time or your own).
Columns: Date, Receipt, Customer, Method, Reference, Amount, Applied to orders, On account; in ⚙ Columns also
Refunded, Status, QuickBooks. A void receipt is not in the total. Click a row to open the receipt.

- **CSV** — payments and refunds of this list in one table by date (a refund is negative).
- **QuickBooks · N new** — a file with only what QuickBooks does not have yet or what changed after the export:
  invoices, payments, refunds (New, Corrected, Voided). After the file they count as exported. **Last file** — the same
  file again if the last one was lost.
- After the first QuickBooks file an order does not go to the archive until its invoice, payments and refunds are
  exported: from the archive they would never reach the file. Until the first file the archive works as usual.

### Receipt (+ New receipt)

1. **Customer**, **Date**, **Method** (Cash, Cheque, E-transfer, Debit, Credit card), **Amount · CAD**, **Reference**
   (cheque or transfer number, last 4 digits of the card), **Note**.
2. **Apply to orders of this customer** — the customer's orders with a balance; **Apply now** — how much of the
   receipt goes to that order. **Max** — the whole order balance (if the receipt amount is still empty, it becomes
   this amount).
3. The bottom line counts: Receipt, Applied, Left on account (deposit). What is not applied stays as the customer's
   deposit.
4. **Save receipt**.

- A credit card payment on an order without the card fee — the order shows “No card fee” and **Add N%**.
- The same Reference already exists — tick “I reviewed the payment…” so the payment is not entered twice.
- Correcting a saved receipt needs a reason (**Correction reason**). A receipt's customer is not changed: Void it and
  enter a new one.
- **Void receipt** — with a reason; the money comes off the orders. If the receipt has a refund, void the refund first.
- The receipt is on an order that is already archived (the receipt still has money on account): Void, a correction and
  × Unallocate first bring that order back to work — its balance shows again in Accounts and due dates.
- **Print / email receipt** — the receipt form. **Refund** — return to the customer the part that sits on account,
  CAD: amount, date (not before the payment), method, reason.
- Came to the receipt from an order, Optimization or Shipping (Take payment) — after Save the program goes back there.

### Deposit and overpayment

- **Apply deposit** — a window: an order with a balance and the amount (no more than the deposit and the order
  balance).
- In the order under the header: “… has $N on account” and **Apply deposit to this order**; if payments exceed the
  order total — **Move to deposit on account**.
- The order header has a money strip: status, Order total, Paid, Balance and the **Payments** button (this order's
  payments). A cancelled order is not owed; its payments go to the deposit.

## Allocating payments — Allocate payments

A bookkeeper's window that works like Spiel: Finance → Accounts → customer → **Allocate**. On the left, **Orders &
invoices** — the customer's orders and invoices (Type: Order — not shipped yet, Invoice — shipped and billed). On the
right, **Receipts & credits** — the customer's receipts with what is left on them. The customer can be changed from the
list at the top without leaving the window.

- **Filters** on each half: **Unpaid**, **Part paid**, **Fully paid** — each toggles on its own, several can be on.
  Unpaid and part-paid rows show first; turn on Fully paid to look at or undo an older allocation.
- **Allocate selected** — tick orders on the left and receipts on the right, then click. Money comes from the ticked
  receipts, oldest first, into the ticked orders, oldest first; an order never gets more than its balance. The result
  is written next to the buttons before you click: "Allocate $194.66 from R-0009 to 76026, 76027 · $805.34 stays on
  account". If the money is not enough, the same line says "still due".
- **Ask amount** — tick it and Allocate selected asks for the amount (up to the one shown). Use it when the customer
  says the money covers only part.
- **Unallocate selected** — undo what is allocated between the ticked orders and receipts. Only orders ticked — every
  payment comes off them; only receipts ticked — the receipts are freed completely. The money goes back to the
  customer's account (On account) and waits for a new allocation.
- The currency of a paid order changed (Currency in the order; payments are CAD only): Save asks and returns those
  payments to the customer's account (On account) in their currency; converting by the payment day and allocating
  again is done by hand.
- **▸ on a row** — shows what paid the order (or where the receipt went). Each link has **× Unallocate** to undo only
  that one; the others stay.
- The order number opens the order in Sales, the receipt number opens its form. **+ Receipt** — a new receipt for this
  customer; after Save (or Cancel) you are back in the allocation window.

Every allocation and release is written to the receipt's journal (History): "Deposit applied to order …", "Allocation
released from order …". Orders without a complete price are not listed — their count is at the bottom, "N not priced".

### Why it works this way

- The bookkeeper worked in Spiel with two halves, Debit / Credit Transactions — the window keeps that order of work
  (owner, 6 Nov 2026) in the ERP's own look.
- The "what will happen" line shows the system's decision before the click, not after.
- The earlier paths stay: the receipt form (**Apply to orders of this customer**, Max) and **Apply** on the customer
  card. The window uses the same code as they do.

## Customer statement — Statement

To open: Accounts → right-click a customer → **Statement** (or the button in the customer card). The window shows the
statement sheet as it will go to the customer, with two rows of settings above it.

### Period

**From** and **To** — two dates. To is today by default, From is the 1st of last month; set From to any past date.
From after To — the line “From must be on or before To.”, no sheet, Print and Email PDF are off. An empty From — from
the very start, an empty To — up to today.

Next to them: **Account activity** — add the money movement sheet (every charge and payment by date, Balance forward
first); **Invoices** — after the statement, attach the invoices of every order handed over in the period as one PDF
(while they are prepared — “Preparing invoices…”, Print and Email wait); **CSV** — money movement for the customer's
books.

### Due now — what to ask the customer to pay

The bookkeeper picks which invoices the customer must pay now (this used to be done by hand in Excel):

1. **up to** — a date. Every unpaid invoice billed on or before it is ticked.
2. Below — a tick per invoice: number · date · balance. Untick one that is not due, tick one that is.
3. **Overdue invoices** (red, grey tick) are always due: their tick cannot be removed — an overdue invoice cannot
   become Current.
4. **Clear** — reset the choice. Nothing chosen — only overdue invoices are due now.

The choice shows on the sheet at once, and Print / Email PDF go out with it.

### What the sheet shows

- Invoices by month: a month heading, the invoices, the month total under a rule. Each invoice once: Invoice No, Date,
  Reference (PO), **Days late** (how many days overdue, in red), Amount, Balance.
- Red rows — everything to pay now: overdue and chosen.
- After the last such invoice in a month — the **Due now · N invoices** subtotal. It holds the same as the Due now
  cell at the bottom; overdue 60+ and 90+ have their own cells, so they get no subtotal. The subtotals of all months
  add up to the Due now cell.
- Orders in work with a prepayment — the **In work** group (billed on pickup).
- Totals on the right: Balance forward (balance at the start of the period), Orders billed, Payments received,
  Refunds; **Balance due** (or Credit balance) and **Overdue now**.
- At the bottom, four aging cells — **Overdue 90+ days**, **Overdue 60+ days**, **Due now**, **Current** — together
  all the debt on invoices, and a bar of shares with percents.
- Orders without a price are not in the statement — a line above the sheet, “Not priced, left out: …”.

### Print and Email PDF

**Print** — print. **Email PDF** — the PDF goes to Downloads and a Gmail message opens to the customer's Statement
Email (none — Invoice Email, none either — the main contact) with ready text: period, Orders billed, Payments
received, Balance due, Overdue now. Drag the file into the message. The statement form is set up in Data → Forms (see
[forms.en.md](forms.en.md)).

## Statements for everyone — Statements

Accounts → **Statements** (on the right above the table). The period — the same From and To. A list of customers
with activity in the period or a balance: Email, Balance forward, Billed, Paid, Balance. Each has **View** (the
Statement window for this period) and **Email PDF**; sent ones are marked **Emailed**. The PDFs are in Downloads — drag
each into its own message.

## Why it works this way

- The period is two dates, not words (owner, 7 Nov 2026): “a From – To date window, not a set of words”; To is today,
  From is any past date.
- Due now has only the date and the ticks: the Last Monday / Last Friday / Today buttons are gone — the date is there
  anyway.
- An overdue invoice is always due: otherwise the bookkeeper could untick it, and the statement would show debt with
  days late under Current.
- The month subtotal equals the cell at the bottom: the customer adds up the subtotals and must get the same number.
