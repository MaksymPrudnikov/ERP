# Master Data (Data)

The lists and settings everything else is built from: the glass and material catalog, works and their prices, customer
price lists, stations and the route, cutting, carriers, defect and count reasons, trucks, the company, stickers and
forms, order charges. The section is visible to people with the Data box ticked in Users.

The main rule (owner, 22 Oct 2026): Data is a builder. The shop's numbers and lists live here, not in code: a new list
becomes a category, not a new tab. Editing Data does not change saved orders: the price is fixed in the order on Save
(owner, 20 Oct 2026: “if I change a price or a thickness, the glass stays the same”). Every edit goes to the Data log
(Setup → Data overview → Change log).

## Sections

Six sections as buttons on top — by the question you came with (23 Oct 2026); each has its own tabs.

| Section | Tabs |
|---|---|
| Catalog | the catalog tree: glass, materials, hardware, works, recipes |
| Prices | group price lists and personal customer price lists |
| Production | Stations, Cutting, Dollies & Skids, NCR, Stock reasons |
| Shipping | Trucks |
| Company & print | Company, Stickers, Forms |
| Setup | Setup, Data overview |

Tables work as in Sales ([lists.en.md](lists.en.md)); fields in settings rows are edited right in the row.

## Catalog

- **On the left — the tree** with counts of active rows: **Items** (Glass, Supply points), **IGU parts** (Spacers, Gas,
  Sealants, IGU parts), **Lamination** (Interlayers), **Surface** (Frit, Spandrel, Spandrel colours), **Hardware**
  (Hinges, clamps, patches), **Stock** (Stock items), **Services** (Works, Heat treatment, Cutting allowance),
  **Recipes** (IGU surround).
  Under the tree — how much glass is “kept in stock” and supply rows without a product.
- **On top** — catalog warnings (No price, No short name and so on — they only warn; a click filters) and search: in the
  open section or **All catalog** (the whole catalog with a Type column). **+ New** creates in the open section.
- **Clicking a row** (not a field or a button) opens a preview on the right: what is missing, the main fields, the last
  change, **Open** — the card.
- **A card** — tabs on the left, an orange dot on a tab where something is missing. Save reads the fields of all tabs.
  Leaving for another tab or list with unsaved edits asks “Discard unsaved changes?”.

### Glass

- **Glass** — what the glass is and what we sell it for: Code, **Short name** (inside the shop: stickers, station
  screens; customers and suppliers get Name; owner, 29 Oct 2026), Name, Thickness, Substrate, Coverage, Tempering,
  prices. Filters: manufacturer, thickness, coating, status (In stock, Pre-order, No short name, Discontinued). In the
  row — Edit, **Discontinue** (stop selling without deleting), ×. Loading from CSV — Choose file.
- **Kept in stock** — we keep this glass in stock: its rows always show in Inventory. **We cut it** — we cut this glass
  ourselves; **COG** (customer's own glass, 3–19 mm) is not cut, its route starts from its works (14 Oct 2026).
- **Supply points** — where and at what price we buy: supplier (Purchasing card), sheet size, price, currency, lead
  time. The sheet size goes from here to cutting and stock; **+ Supply row** on a glass card adds a supply row. Purchase
  prices are seen and edited only by people with the **Cost & margin** box in Users (administrators always); others do
  not see the price columns, and Save never erases them.

### Materials, hardware, Stock items

- **Spacers, Gas, Sealants, IGU parts, Interlayers, Frit, Spandrel** — cards with tabs (General, Units, Measurements,
  Purchase, Prices, Stock, Consumption): stock and purchase unit, pack size, film density, consumption. Their stock is in
  Inventory → Consumables.
- **A price always shows its unit**: the card says “Price, CAD per sq ft” (from Sales unit on the Units tab), the list
  shows the number and “per sq ft”, “per each” under it. Empty Sales unit — sq ft (owner, 17 Nov 2026).
- **Frit and Spandrel** are sold per **sq ft**, **inch** (perimeter, each side up to a whole inch) or **each** (one per
  lite) — Units tab. The area is the glass one: sides up to an inch, up to a tenth of ft². Work — the route station.
- **Gas, Sealants, IGU parts** have no station of their own: they go to IGU assembly. The card shows Station and a
  **Set in Works → IGU Assembly** link — change the assembly station there and the whole IGU goes to it.
- **Min area, ft²** (Measurements tab) — the minimum area of this item: a smaller piece is billed from it. Each item
  has its own and does not depend on the glass or other items: glass 4, Spandrel 3 — spandrel is billed from 3.
  Empty — by the real area. An order can change it for itself (Sales → Surcharges). There is no overall minimum any
  more (owner, 17 Nov 2026); on the switch glass, films, IGU parts, frit and spandrel got 4, spacers 1.
- **Spandrel colours** — the palette with manufacturer codes. Used rows are switched off, not deleted.
- **Hardware** — Kind → series → models (hinges, clamps, patches). Models: Model, Kind, Series, On the drawing, Glass
  thickness, Supplier code, On drawings, Status. We do not sell hardware — only the cutouts for it; cutout prices are in
  Works (owner, 26 Oct 2026).
- **Stock items** — doors, kits, supplies: **Kind** (door, kit, consumable and your own), tabs General · Measurements ·
  Stock · Prices. Measurements are rows “what · value · unit”; a new door gets Width, Height, Thickness by itself; **Name
  from measurements** fills the name when pressed. The code is typed by hand.
  - Measurements describe the item: they show in Inventory → Stock items (the Measurements column) and in the Data
    list; they do not change the price or the stock. Example: a 30 × 80″ · 10 mm door — Kind Door, Width 30 in, Height
    80 in, Thickness 10 mm, Name from measurements → "Door 30 × 80″ · 10 mm".
  - **Another value — another stock item**: a 32 × 80″ door is a separate item with its own stock, not a second
    measurement row of the first one.

### Works and Heat treatment

- **Works** — the shop's works (edges, holes, cutouts, radii, notches…): the station that does them and a **price table**
  by thickness — rows “from–to mm → price”, as many as needed; one row without limits is one price for everything. An
  overlap or a gap in thicknesses is a warning (the order line will show Rate required); saving is not blocked. A work
  without a station is not lost: the sheet prints “NO STATION”, Save warns.
  A work billed per ft² (Heat Soak, Shape Unit, sandblasting…) has **Min area, ft²** on the Prices tab: its own
  minimum, empty — by the real area (set to 4 on the 17 Nov 2026 switch).
  There is also **Charge code** — which ES / HST / Card fee go on the work; empty — Default, as glass (27 Nov 2026).
  **Mitering** has **Angle from, ° / Angle to, °** there: the miter angles the shop makes (10°–45° out of the box). An
  order with an angle outside them still saves, Save asks; empty — no limit (27 Nov 2026). Mitering is one work for any angle.
- **Heat treatment** — tempering types.
- **Cutting allowance** — how much bigger the glass is cut per side so the edge finishes to size. A row: work ·
  Monolithic (by the glass thickness) or Laminated · ply (by the ply thickness) · thickness from–to, mm · allowance.
  When several rows match, the narrowest wins: a wide row is the default, a narrow one the exception. **+ New** opens
  an entry row on top (rows are grouped by work — owner, 17 Nov 2026, variant C: the group header shows how many rows
  and its allowances in one line, ▸ collapses, **Expand all** opens all; inside — Monolithic, then Laminated · ply;
  **+ row** in a group header opens the entry row inside that group): it reaches the table and the calculation only on **Add**. Editing a row does not move it while
  you are on the screen; the order is refreshed on the next visit. **Check** at the bottom — pick a work, the glass
  and a thickness to see the allowance. Catalog works and thicknesses without a row show in red on top as “No rule —
  cutting is blocked”: such glass will not go to cutting.
- **IGU surround** (Recipes) — the IGU surround recipe: spacer, sealant and gas consumption is counted from it.

## Prices

Screen hint: “Personal beats group; else base price.” The price order in an order: typed by hand → the customer's
personal list → the customer's group list → the base price (Glass, Works…); 0 is a price too, the search stops at it
(owner, 22 Oct 2026).

The screen works like Catalog (owner, 27 Nov 2026, variant A): a tree on the left, the open item full width on the
right; the top line reads “group · customers · prices”.

- **Customer groups** — a special price group (the Group field on the customer card): the tree shows its name and the
  number of customers; a click opens it on the right — name, Delete group, customers (× removes, + Add customer), the
  price table. **+ Customer group** adds one.
- **Item groups** — groups of items, to price a whole group at once; the tree shows the item count, **+ Item group**.
- **Tools → Set for customers** — bulk edit with a fixed price (not a percent).
- **Tools → Excel** — price lists to and from a file.
- A customer's personal list is on their card, Prices tab ([customers.en.md](customers.en.md)).

## Production

- **Stations** — “Steps in order; same step — parallel.” Stations by route step: code, name, step number, the works
  done there, **Puts on** (Dolly, Skid, Dolly + Skid or nothing — what the station puts glass on), size, carrier sheet, note, **Machines** —
  the station's machines, comma separated (`P1, P2, P3`, each with its own scan screen; empty — the whole station), **Working, min** — for how many minutes
  after a scan the station counts as working on the floor plan (empty — 15; beside it “Usual gap” — the station's usual
  break). Adding, editing, removing
  stations and putting them in order is the owner's setting here, with no code change (29 Sep 2026). A work in Works names its
  station — the route, the sticker and the station screen are built from that. How it looks in the shop —
  [production.en.md](production.en.md).
- **Cutting** — cutting parameters by thickness: **Trim** (bottom, left), **Border** (top, right), **Min distance**;
  **Reset to shop table** restores the shop table. Below — sheet sizes with their own trim, the smallest piece kept in
  stock (**Min offcut W / H**). Sheet sizes come from supply and Inventory.
- **Dollies & Skids** — codes DL · DA (L and A dollies), SL · SA (L and A skids). **+ L-shape dolly** and so on — the
  system gives the number; table Code, Type, On it now, Note, Active, **Label**; **Print labels** — 4 × 6 labels of the
  ticked ones. Pills Loaded / At customers / Empty / All; a click on a code opens the carrier window.
- **NCR** — defect reasons by place: All stations, Office and each station. The station Recut window and NCR in an order
  use them.
- **Stock reasons** — reasons for a stock count difference (“Shown when a count differs.”): + Add, rename, switch off.

## Shipping

- **Trucks** — trucks for the delivery plan: **+ Truck**, Name, Note, Active.

## Company & print

- **Company** — what is printed on documents (empty is skipped): Logo, Legal name, HST number, address, Phone, Email,
  Website, **Deposit for cash customers, %**, **Quote valid for, days**, Payment instructions, Terms and conditions, Footer
  line, **My fields · for forms** — your own fields for forms.
- **Stickers** — the sticker: Production, Final · each glass, Final · whole unit, Stock offcut; size 4 × 6 or 3 × 4,
  orientation, layout Automatic or Free layout; a sample on a real order.
- **Forms** — the form builder: Quote, Proforma, Order confirmation, Invoice, Work order, Packing slip, Receipt,
  Statement, Purchase order, Trip sheet, Drawing, the carrier sheet and label. Manual — [forms.en.md](forms.en.md).
- **Email templates** — reply texts for the Gmail panel (the envelope; [gmail.en.md](gmail.en.md)). On the left the list:
  four ready ones (Order received, Status, Back order, Ready for pickup) and yours, **+ New template** adds your own. In
  the middle **Name** (what the panel calls it) and **Text**. On the right **Fields** in groups — Order, Quote, Customer,
  Progress, Lines, Shipping, Me · company · date: a click puts the field into the text at the cursor, the hover tip says
  what goes in. **Preview on order** — the email on the chosen order. **Save** / **Cancel** / **Delete** — above.
  - `{back order lines}` — only lines with something left: "• Line 2 · W1 · 24" × 36" · glass — 3 units: 1 ready, 2 in
    production"; shipped lines are not listed. `{ready lines}`, `{shipped lines}`, `{all lines}` — the same way.
  - `{my name}` — who is signed in to Glass Farm; `{contact first name}` — the contact who wrote, otherwise the main one.
  - No data (no delivery, no Hold) — the field stays empty, nothing is invented. A misspelt field (`{oder}`) stays in
    the text as it is — you see it in the preview. No money in the fields.
  - Editing needs the Master Data tick.

## Setup

- **Setup** — **Order charges** (defaults for new orders): ES, HST, Card fee, Delivery, Skid deposit and your own
  charges (**+ Charge**: name, **%** or **Fixed**, On, code; × removes). Charged top to bottom: ES → HST → your % → Card
  fee, amounts at the end; a % charge goes only on what is above it. A charge's **Charge code** says what is charged on
  it, **What it means** says it in words. **Charge codes** — codes: a name and a tick per % charge (your own % adds a
  column). The first code is for glass and everything without its own code; a removed code's users get the first one.
  **Default code** — the code of a new work and a new one-off service. The old base ticks (before 27 Nov 2026) became
  codes: ES — HST + card, HST — Card only, Delivery — No charges; order totals did not change. **Cards** — cards and their fee, the first is the default; **Weights** — glass density
  (unit weight on orders and stickers); **Frit** — defaults for a new frit lite (dot, margin, from which corner).
- **Data overview** — **Collections** (every list, how many records, filled or not), **Change log** (the Data log: who,
  when, before → after; purchase prices show as “Cost & margin” without that box), **Master Data file** — the lists out
  to a file and back.
