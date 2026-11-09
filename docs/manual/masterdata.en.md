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
  (Hinges, clamps, patches), **Stock** (Stock items), **Services** (Works, Heat treatment), **Recipes** (IGU surround).
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
- **Spandrel colours** — the palette with manufacturer codes. Used rows are switched off, not deleted.
- **Hardware** — Kind → series → models (hinges, clamps, patches). Models: Model, Kind, Series, On the drawing, Glass
  thickness, Supplier code, On drawings, Status. We do not sell hardware — only the cutouts for it; cutout prices are in
  Works (owner, 26 Oct 2026).
- **Stock items** — doors, kits, supplies: **Kind** (door, kit, consumable and your own), tabs General · Measurements ·
  Stock · Prices. Measurements are rows “what · value · unit”; a new door gets Width, Height, Thickness by itself; **Name
  from measurements** fills the name when pressed. The code is typed by hand.

### Works and Heat treatment

- **Works** — the shop's works (edges, holes, cutouts, radii, notches…): the station that does them and a **price table**
  by thickness — rows “from–to mm → price”, as many as needed; one row without limits is one price for everything. An
  overlap or a gap in thicknesses is a warning (the order line will show Rate required); saving is not blocked. A work
  without a station is not lost: the sheet prints “NO STATION”, Save warns.
- **Heat treatment** — tempering types.
- **IGU surround** (Recipes) — the IGU surround recipe: spacer, sealant and gas consumption is counted from it.

## Prices

Screen hint: “Personal beats group; else base price.” The price order in an order: typed by hand → the customer's
personal list → the customer's group list → the base price (Glass, Works…); 0 is a price too, the search stops at it
(owner, 22 Oct 2026).

- **Customer groups** — a special price group (the Group field on the customer card), its prices, its customers.
- **Item groups** — groups of items, to price a whole group at once.
- **Set for customers** — bulk edit with a fixed price (not a percent).
- **Excel** — price lists to and from a file.
- A customer's personal list is on their card, Prices tab ([customers.en.md](customers.en.md)).

## Production

- **Stations** — “Steps in order; same step — parallel.” Stations by route step: code, name, step number, the works
  done there, **Puts on** (Dolly, Skid or nothing — what the station puts glass on), size, carrier sheet, note. Adding, editing, removing
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

## Setup

- **Setup** — **Order charges** (defaults for new orders): Energy surcharge, HST, Card fee, Delivery and others — on/off,
  rate, what it is charged on; **Cards** — cards and their fee, the first is the default; **Weights** — glass density
  (unit weight on orders and stickers); **Frit** — defaults for a new frit lite (dot, margin, from which corner).
- **Data overview** — **Collections** (every list, how many records, filled or not), **Change log** (the Data log: who,
  when, before → after; purchase prices show as “Cost & margin” without that box), **Master Data file** — the lists out
  to a file and back.
