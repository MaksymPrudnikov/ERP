# Agents — commissions

Commission for people who brought a customer. Owner, 11 Oct 2026: in Spiel the sales rep field holds the person “who
brought this customer… and we give them a percent of every order”; this is an outside person with no ERP access, only
the owner pays them, “maybe once a year”. The section is visible to people with the Agents box ticked in Users; sales
people do not need it.

## Rules

- **A customer belongs to one person.** Give the customer to someone else — the previous person loses them. Commission
  goes to whoever brought the customer; customers are not handed over (owner, said it 2–3 times).
- **The percent is only of what the customer paid**: payments on orders (Finance → Payments, no Void) in the period, by
  payment date. Without HST by default: payment × (total − HST) / order total. The **With HST** box adds columns with
  HST.
- **A new customer — for all time; a changed percent — from the From date** (today by default). Past payments are not
  recounted: each one uses the percent of its payment day (owner, 19–20 Oct 2026).
- **A payout is by order**: it takes only the commission of each order not paid out yet; the amount is counted by
  itself (owner: “so I never pay twice for the same order”). An overpayment from an earlier payout is subtracted —
  “Overpaid earlier · taken off”.

## The screen

On top the period **This year · Last year · All time**, the **With HST** box, on the right **+ Person**.

- **People list** — as in Sales ([lists.en.md](lists.en.md)): Person, Contact, Customers · %, Orders, Paid, Commission,
  Paid out, To pay; sorted by To pay (largest first) by default, total at the bottom.
- **A row or its box** opens the person below:
  - **Orders** — orders with payments in the period: Order, Customer, Date, Order total, Paid · no HST, %, Commission;
  - **Payouts** — date, amount, note, which orders it covered; **Paid out · all time**;
  - **+ Payout** — shows the orders with unpaid commission (Due); tick them, the amount is counted by itself, a note,
    **Save payout**. A payout can be deleted.
  - **Edit** — the person's card.
- **The card** (+ Person or Edit): **Name** (required), Phone, Email, Note, **Customers** — customer and percent
  (0.01–100); a changed percent gets a **From** date; **+ Customer** — one more customer. A customer given to this person
  leaves the previous one. **Delete** removes the person together with their payouts.

Why a separate section: commissions are the owner's money; sales and the shop do not need to see them. The server also
closes these records to anyone without the Agents box.
