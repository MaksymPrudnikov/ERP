# Optimization

The order queue between the office and the shop: orders are verified here, sent to a batch and tracked until
the glass is cut.

## The screen

Same look as Sales: one card with a row of actions, a row of pills with counts, then the table.

- **Pills** — All, To verify, To batch, Batches, Stock, Sheets. The number is how many items wait there.
- **Open** — opens the one ticked order.
- **Actions over the ticked orders** appear in the same row once you tick at least one order ("2 selected"):
  Verify, Select glass (All only), Unbatch, **Move back** (one status back, locks stay), **On Hold** (asks for a
  reason; **Release** when all ticked are held), **Cancel order** (payments go to the customer deposit), Delete.
  A button that does not fit the ticked orders is grey.
- **Right click** on an order gives the same actions for the ticked orders (the order under the mouse is ticked
  first). A held order has **Release** in its row.
- **To batch, Batches, Stock, Sheets** use the same card, pills and header. Stock and Sheets list their rows
  without per-column filters; Sheets has the gear at the right of its row.
- **Production** has the same look: the switch In production / Stations / Terminals / Dollies & Skids is a row of
  pills; the station tiles stay tiles above the table.
- **Gear** in the header — Columns. Filters and sorting are in each header, like in Sales; the totals are at the bottom.
