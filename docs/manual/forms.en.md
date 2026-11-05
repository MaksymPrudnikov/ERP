# Forms · form builder

Data → Company & print → **Forms**. A form is built from blocks, like in Word, and printing takes it right away. For
now the Packing slip (with its skid sheet) is on the builder; the other forms move here one at a time.

## The screen

On top — the forms (pills), on the right **Preview** (a real packing slip to see how the form lands), **Undo**,
**Redo**, **History**, **Reset to default**, **Save**. Until Save, printing uses the previous form; unsaved work is marked "Unsaved
changes".

- On the left **Add** — a new block: **Text** (any words), **Field** (data of the form), **Picture** (JPEG or PNG),
  **Line**, **Frame**, **Barcode**. The block goes to the bottom of the chosen part of the sheet; the part grows.
- Below — **Parts of the sheet**: top of every page, top of the first page, the table, totals, the skid sheet, bottom
  of the page. Click a part — new blocks go there; click a block — its settings.
- In the middle — the live sheet with a thin ruler (inches) and the page margins dashed. Click a block to select it;
  drag to move (Left, Center, Right — up and down only, **Free** — anywhere); the right handle sets the width, the
  bottom one the height of a frame or line. Blocks under a growing one (address, skids list) move down by themselves.
- On the right — the block settings: field or text, **Place on sheet** (Left, Center, Right, Free), X, Y, width and
  height in mm, **Font** (Helvetica, Times, Courier), size, line spacing, **B**, **I** (italic), alignment, colour,
  wrap lines; a line or frame has colour, width and
  fill. **Delete** removes the block, ready-made blocks too.

## A field — the Insert field window

**+ Field**, or a click on a block's field, opens the window: groups on the left (Company, Customer, Packing slip,
Skids, Page), the fields with their value on the chosen packing slip in the middle, **Format** on the right (a date:
Oct 2, 2026 / 2026-10-02 / 02/10/2026 / October 2, 2026) and **Before the value** — words before the value ("Date: "),
printed only when the field is not empty. Search looks in all groups. Text blocks can hold fields too: `{number}`,
`Page {page} of {pages}`.

## Fonts

Helvetica, Times and Courier are the standard PDF fonts: they are not embedded, every viewer and printer knows them,
no fee. Windows may show a look-alike of the same width instead of Helvetica — lines land the same. Line breaks are
the same on screen, in print and in the PDF.

## Saving

**Save** — the form is stored in the database and prints this way from now on (Print in Shipments, the trip pack).
**Reset to default** brings back the program's form — it prints exactly what it did before the builder; nothing
changes without Save.

## History — the Versions window

**History** opens the window: versions on the left — every **Save** (date, who saved and what changed: "1 block added
· 2 changed"), the last 20 per form, and the program's form (Default) at the bottom. On the right — the chosen version
on the same packing slip. **Restore this version** puts it into the builder; printing changes only after Save.
**Download this version** — a form file (`.json`) to keep, send, or load on another computer with **Load form
file…**. A file of another form, or not a form file, is refused with the reason.
