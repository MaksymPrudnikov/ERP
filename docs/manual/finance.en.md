# Finance

Customer money: who owes what, payments (receipts), allocating payments to orders, statements.

## Screen

At the top, four figures for all customers: **Customers owe**, **Overdue**, **Prepaid**, **On account**. Below them the
tabs **Accounts** (customers and their account), **Due dates** and **Payments** (receipts). Click a customer in
Accounts to open the card: Balance, Overdue, Prepaid, On account, orders and payments, and the buttons **Allocate**,
**Statement**, **+ Receipt**.

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
