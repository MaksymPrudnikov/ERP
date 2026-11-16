# Gmail panel — the order next to the email

> **Status:** written for the task `docs/ЗАДАЧА_ПОЧТА_ЗАКАЗЫ.md`. Not in the product yet; this guide joins the
> contents table together with the extension.

Orders arrive by email in the shared mailbox. The **Glass Farm** panel on the right side of Gmail shows the order the
open email belongs to: status, how much is done, where the glass is. You also create an order or a quote from it. The
order in the ERP keeps a link to the email.

The panel works for people with the **Sales** tick in Users, and only while Glass Farm is open in another tab of the
same Chrome.

## The main rule

The panel never guesses. It does not work out what the email is about, does not decide whether it is a new order or a
question, and never links anything by itself. It does one thing: it puts next to the email the order that **you**
linked to it.

An order lives in one thread: create the order from an email, and every reply in that conversation shows it.

## What the panel shows

The panel goes through the steps top down and stops at the first one that fits.

| # | The email | In the panel |
|---|---|---|
| 1 | The conversation is already linked to an order or a quote | That order as a card. Several linked: the first as a card, the rest as rows |
| 2 | Not linked, but the subject or the text has the number or PO of an open order of this customer | The hint **Found in this email** and the button **Link this email** |
| 3 | Not linked, no numbers | Up to three open orders of the customer, and the buttons |
| 4 | The sender's address is not in any customer card | **No customer with this email** and the buttons |

**Create order**, **Create quote** and **Link to order** are always there.

The customer is one row at the bottom of the panel. Click it to see the contact, phone, email and payment terms.

## The order card

- **Number · PO** and the status, the same as in Sales.
- **12 of 20 units done** — units already made: shipped and ready to ship together.
- **Due** — the order due date.
- A bar of three parts that add up to all units of the order:
  - **Shipped** — gone (on a sent Packing slip);
  - **Ready to ship** — finished and waiting;
  - **In production** — on the shop floor;
  - the grey rest — not in production yet.
- **Where is the glass** — the route stations: ✓ passed, a number is how many lites wait at the station, · not there yet.
- **On Hold** — a red line with the reason.
- **Open in ERP** — opens the order in Glass Farm.

The panel shows no money. A quote shows its number, Not sent / Sent / Won, and Valid until.

## How to work: examples

### 1. An order arrives
Email: "New order", an Excel file attached.
1. Open the email. The panel: the customer is found, **No order linked to this email**.
2. **Create order** — Glass Farm opens a new order: the customer is set, the email is linked.
3. Enter the PO and the lines (by hand or Paste Excel), **Save**.

From now on this conversation shows the order.

### 2. The customer clarifies or asks for status in the same conversation
Open the email — the order card is already in the panel. Answer from the card. To change the order — **Open in ERP**.

### 3. A new email with a number in the text
Email: "any update on PO 4471?"
The panel: **Found in this email: PO 4471** and the order row. **Link this email** — the conversation is linked, then
it works as in example 2. Wrong order — do not click it, pick the right one with **Link to another order**.

### 4. A new email without a number
Email: "When can we pick up?"
The panel shows up to three orders of the customer: Ready first, then those in production. That is usually enough to
answer. To pin the email to an order — **Link to order**, the number or PO, **Link**.

### 5. The customer asks about several orders at once
Email: "Status of PO 4471, 4502 and 4390?"
The panel shows three rows, each with **Link**. Link all three: the conversation shows three orders, answer each one.

### 6. A new order arrives as a reply to an old conversation
The panel shows the earlier order: it does not know the email carries a new one. Click **Create order** — the
conversation now has two orders. While the email with the new order is open, the new order comes first.

### 7. A quote, then an order
1. Email "Please quote" → **Create quote** → lines → Save.
2. In Glass Farm: Documents → Email PDF — the quote is Sent.
3. The customer replies "go ahead" — the quote card is in the panel → **Open in ERP** → **Convert** (asks for the PO).
4. The order is created and the email moves to it. The panel shows the order and the line "from Q-10021".
5. Then the usual path: Verify → batch → Ready → pickup. The card updates by itself.

### 8. The manager forwards a customer email to the shared mailbox
The sender is the manager, so the panel says **No customer with this email**. **Create order**, pick the customer in
the order yourself. The conversation is linked.

### 9. The customer writes from a new address
**No customer with this email** → **Link to order** → the number or PO → **Link**. The panel does not add the address
to the customer card: add it in Customers → Contacts if needed.

### 10. A customer with dozens of orders
Instead of a list: counts by status (New 9 · Verified 3 · Batched 12 · Ready 3), the three most current orders and
**+24 more · open in ERP** — Sales filtered by this customer.

### 11. An old conversation
Completed orders are folded into the row **Closed · 12** — click to unfold. An archived order is a grey row
**Archived**; a click opens it read-only.

## The email in the Glass Farm order

- Next to the **Customer** field, beside the Contact icon, there is an **envelope** with the number of linked
  conversations. Click it — a row of emails opens under the header: subject, sender, date.
- A click on the subject opens the email in Gmail.
- **×** removes the link (Activity log: "Email removed").
- **+ Paste Gmail link** — link an email without the panel: copy the address of the open email in Gmail and paste it.
- In the **Sales** list the envelope sits in the PO cell: a click opens the latest email. Right-click an order →
  **Open email**. The **Email** column with the subject can be turned on in ⚙ Columns.

One conversation is one row, however many replies it has. Copy does not copy the emails.

## What the panel never does

- It never links emails by itself.
- It does not read attachments and does not store the email text.
- It does not create customers or change their cards.
- It sends nothing to the internet: data moves only between the Gmail tab and the Glass Farm tab on your computer.
- It shows no money.
- It does not change the order: from Gmail you can only link an email.

## If something is wrong

| What you see | What to do |
|---|---|
| **Glass Farm is not open in this browser.** | Click **Open Glass Farm** — the tab opens by itself |
| **Sign in to Glass Farm.** | Sign in to Glass Farm in the other tab |
| **No Sales access.** | Ask the administrator for the Sales tick in Users |
| The email link from the order opened the wrong mailbox | Sign in to Gmail with the shared mailbox, or click **Find in Gmail** in the email row |
| The conversation is linked to the wrong order | In the order: envelope → email row → **×**, then link the right one |
| No panel | Check that the Glass Farm for Gmail extension is on in chrome://extensions |
