# Customers

Customer cards: who they are, people and addresses, payment terms, personal prices and their orders. The section is
visible to people with the Customers box ticked in Users. A customer's money — balance, payments, statements — is in
Finance ([finance.en.md](finance.en.md)).

## The list

Works like Sales (owner, 3 Oct 2026: “let it be like everywhere… work like a spreadsheet”; [lists.en.md](lists.en.md)).

- **Top row**: for the ticked customer **Open**, **Duplicate**, **Archive** (Restore for an archived one), **Delete**; on
  the right the **Created** period, **+ New customer** and **⋯** — Export CSV, Export JSON. Right-clicking a row gives the
  same actions; double-click — Open.
- **Columns**: Account, Customer (legal name in grey on the same line), Contact, Phone, Email, Terms, Credit limit,
  Balance, Last order, Status.
- **Archived customers are hidden** by the filter “Not · Status: Archived” — it shows in the filter row; × or **Clear
  filters** removes it.
- **Delete** is off when the customer has orders: such a customer is archived instead. Orders and history stay.

## The card

On top the name and Account, **Save** and **Cancel** (Cancel asks when there are unsaved edits). Tabs:

- **General** — Account / Customer Code, **Legal Name** (required), Display Name, Status (Active, Inactive, Archived),
  Customer Type, **Group** (special price group from Data → Prices), Area / Territory, Sales Rep, Account Open Date, TAX
  Number, Registration, Prospect, **PO required**, Notes, Internal Notes.
- **Contacts** — any number of people (purchasing, accounting, receiving, project manager): Name, Role / title, Phone,
  Phone 2, Mobile, Fax, Email and the marks **Primary**, **Invoice**, **Shipping** — who gets what.
- **Addresses** — billing and any number of delivery and job-site addresses: Type (Billing, Delivery, Other), Name,
  Addressee, **Default**, Address 1–3, City, Province / State, Postal Code, Country.
- **Payment** — on top the money from Finance: Balance, Overdue, Prepaid, On account and the **Finance account** link.
  Below:
  - **Credit and commercial terms** — Payment: **Cash · deposit before production** or **Credit · pay within days**,
    Credit Days, Currency, Credit Limit, Credit Application Date, **On Hold**, Check Terms, Hold Reason, Delivery Method,
    Deliver To, Fuel Levy (Default, Custom rate, Fuel levy exempt) and Fuel Levy Rate;
  - **Accounting and statements** — Statement Delivery (Email, Print, Email + print, Do not send), Statement Email,
    Invoice Email, Tax Exempt and Tax Exemption Number.
- **Prices** — **+ Personal prices**: the customer's own price list. Price order: typed in the order → personal list →
  group list → base price (owner, 22 Oct 2026). Changes save at once.
- **Orders** — the customer's quotes and orders, newest first: Number, Type, Status, Created, Due, Total, Balance; **+ New
  order** and **+ New quote** — already with this customer.
- **Legacy IDs** — the tab shows only when the customer has numbers from Spiel.

A card never overwrites someone else's edits: if the customer was saved on another computer or tab while the card was
open, Save writes nothing and says “Changed elsewhere — reopen” (deleted — “This customer was deleted”); what was typed
stays in the form (20 Oct 2026).

## Where things come from

- **Money** (deposit for cash customers, due date for credit customers, Hold) — Finance rules, manual
  [finance.en.md](finance.en.md).
- **Delivery address and contact** in an order — from the card's Addresses and Contacts; the order can change them.
- **The agent** who brought the customer — in Agents ([agents.en.md](agents.en.md)).
