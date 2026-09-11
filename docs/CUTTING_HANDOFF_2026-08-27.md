# GLASS ERP — Cutting Geometry Handoff

**Date:** 2026-08-27
**Replaces:** `EFFECTIVE_CUTTING_HANDOFF_2026-08-26.md` (see §10 for what changed and why)
**Purpose:** production context for continuing work in a new ChatGPT/Codex session.

---

## 1. TL;DR

Production runs in one straight line:

```
Shape drawing (sizes, angles, notches, holes)
        ↓
Cutting file  =  finished size + edge-service allowance
        ↓
Cut on table  →  edgework  →  holes / notches / everything else
```

Three rules carry the whole model:

1. **The cutting contour is the finished shape plus an edge allowance.** Nothing else is added to it.
2. **Nothing that happens after edgework is in the cutting file.** No notches, no holes, no cutouts — ever, not as an exception.
3. **Safety Border is not part of the part.** It is clearance between parts on the table, used by nesting.

If a drawing needs to change, it is changed in the Shape. The cutting file follows it. There is no second geometry editor.

**Current state of the code — read before planning anything.** The cutting file is generated correctly today. The edge allowance is applied properly, driven by edge service type and glass thickness. Exactly two things are wrong, and they are the entire job:

1. Cutouts and notches are taken into account in the cutting contour. They must not be.
2. There is no way to set a Safety Border.

This is not a rebuild. Do not rewrite the allowance calculation or the contour generator. See §12.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Shape / Finished Shape** | The drawing of what the customer receives. Single source of truth for geometry. |
| **Edge allowance** | Extra material per side consumed by the edge service. Part of the cutting contour. |
| **Cutting contour** | Finished shape + edge allowance. What the table actually cuts. |
| **Safety Border** | Minimum clearance from an angled or curved edge to anything else — a neighbouring part or the sheet edge. Nesting parameter, not geometry. |
| **Primary cutting** | Table stage: cut the outer contour and break it out. |
| **Secondary fabrication** | Everything done after edgework: holes, notches, cutouts. |

Note: the previous document used **Effective Production** and **Effective Cutting** interchangeably. Both names describe the same screen. Pick one name in code and migrate existing saved records to it.

---

## 3. Cutting contour

```
finished size
  + edge allowance on every side
  = cutting contour
```

Worked example (rectangle):

```
Finished:  20" × 20"
Allowance: 1/8" per side
Cut:       20 1/4" × 20 1/4"
```

Worked example (trapezoid with one angled side):

```
Finished:  20" bottom, 18 45/64" top, 20" high, right side angled
Allowance: 1/8" per side, measured perpendicular to each side
Cut:       20 33/128" bottom, 20 1/4" high
```

The allowance is applied perpendicular to each side, including angled ones — which is why the angled example gains more than 1/4" across the bottom.

**Angled sides are cut on the table.** The contour stays angled; the table does not cut an oversized rectangle and leave the slope for later. Polishing runs on the cut edge, so the slope has to exist before edgework.

The allowance is **not a constant**. It depends on the edge service type and on the glass thickness. The 1/8" in the examples above is one specific value — the polish allowance for 10 mm glass — not a global default.

This calculation is already implemented and works correctly. Do not touch it, do not reimplement it, do not hard-code a value over it.

---

## 4. What is never in the cutting file

Shop sequence is: **cut → edgework → holes, notches, everything else.**

Everything in the third stage is machined from the finished edge, so it cannot be in the cutting file:

- notches
- holes
- cutouts

This is not a per-part exception and there is no include/exclude toggle. The cutting file contains the outer contour and nothing else. A notch drawn in the Shape is fabricated later, from the processed reference edge.

The Finished drawing and the cutting file therefore differ, and both are needed: the cutting file goes to the table, the finished drawing follows the part through edgework and fabrication.

---

## 5. Safety Border

### What it is

Clearance for safe cutting and breakout. When two parts with angled edges are nested close together, the edge allowances alone leave them too close: breaking out along a slope that tight can crack the neighbouring part or run the break in the wrong direction.

So an angled edge needs a wider gap — to the neighbouring part **and** to the sheet edge.

### It does not change the cut part — but the customer pays for it

Safety Border is not added to the cutting contour. The part is cut at finished size + allowance regardless. The border only tells nesting how much empty space to leave along that edge.

**Geometry and billing are separate here.** The contour stays as cut, but the billed footprint includes the border: that inch of sheet is consumed because this customer ordered an angled edge, so it belongs to this order.

Do not use this as a reason to push the border into the contour. The cutting file must stay at finished size + allowance; the border is a billing input alongside it.

### How it is billed

Billed footprint is the part's **bounding rectangle** — maximum width × maximum height of the cutting contour — **plus the border** on any angled or curved edge. Rounded to **1/16"**.

The edge allowance sits inside those maximums, so it is billed along with the rest.

### Where it applies

- **Angled and curved edges** — border applies.
- **Straight edges at 90°** — no border.

A straight edge does not get a border just because another edge of the same part is angled.

On a curved edge the border is measured from the part's maximum width or height — from the outermost point of the arc, not offset along the curve.

**There is no separate part-to-part nesting gap.** Parts are already separated by their own edge allowances; the border is the additional space an angled or curved edge needs on top of that.

### What counts as angled

An edge is angled if it deviates from vertical/horizontal by more than **1/256"** — the same tolerance the contour itself uses. An angular threshold does not work here: a 1/8" lean over a 40" height is only 0.18°, but breaking along it is already unsafe.

### Per-edge control

One base value, plus a manual override on **any** edge — the same shape as an Edge Set. The base goes automatically to angled and curved edges; the operator can set any edge by hand, including a straight one. Rows are listed per **edge**, not per segment: a circle's contour is tessellated into hundreds of segments but is one edge (`ARC`), and belongs on one row.

### Values

| Glass thickness | Safety Border |
|---|---|
| 4–8 mm | 1" |
| 8–15 mm | 1 1/2" |

Applied automatically from thickness. The operator can override anywhere in the 4–15 mm range; adjustment step is **1/16"**.

At exactly 8 mm use 1 1/2" (thicker is safer) — confirm with owner.

Outside 4–15 mm there is no automatic rule. The operator sets the border manually. Do not extrapolate a value from the table.

One value per part: if a part has two angled edges, both use the same number.

---

## 6. Data model

Small on purpose, and **extended from what already exists** — the contour and allowance are already calculated and stored today. The new part is the border. The cutting record for a Sales Order Line holds:

- reference to the Shape and its revision;
- thickness;
- edge allowance used (per side, calculated);
- cutting contour (calculated);
- Safety Border value and which edges carry it;
- whether the border is AUTO (from thickness) or OVERRIDE (operator-set);
- who changed it and when, if overridden.

There is **no** manually edited contour, no per-part exception list, no include/exclude flags. If geometry is wrong, the Shape is corrected and the contour recalculates.

**The Shape is upstream.** Change the Shape and the cutting record recalculates from it. Nothing downstream can rewrite the Shape.

Open point: when the Shape changes after a border override, does the override survive? Default assumption — it survives, since it is tied to thickness and edge type rather than to dimensions. Confirm with owner.

---

## 7. UI direction

The screen is for **review**, not editing. The system calculates everything; the operator checks it and adjusts the border if production requires.

Remove the per-side edge-service buttons (`ROUGH | FLAT | CNC | MITER | BEVEL`). Edge services belong in the Shape Configurator and Edgework Sets. This screen must not become a third place to configure edgework.

Show:

- the contour, with the finished shape as reference underneath;
- thickness;
- edge allowance applied;
- Safety Border — recommended value, applied value, which edges carry it, edit control;
- AUTO / OVERRIDE state;
- Reset to calculated.

If the operator needs a geometry change, the screen sends them back to the Shape. It does not offer its own drawing tools.

---

## 8. Nesting and machine output

The cutting contour and its border value are **saved**, not exported per line.

```
Sales Order Line → saved cutting contour + border → collect parts → nesting → machine output
```

Two machines exist in the shop: **Maver** and **Dasai**. Their file contracts are not designed yet.

Do not build per-line Maver/Dasai export now. Store the contour correctly first.

Nesting is where the border is consumed: parts are separated by their own edge allowances, and angled or curved edges additionally require 1" or 1 1/2" of clearance per §5 — against neighbouring parts and against the sheet edge alike.

---

## 9. Assumptions to confirm

The production rules are settled. Two working assumptions remain, both low-risk:

1. **A manual border survives a Shape change.** When the drawing is edited the contour recalculates, but an operator-set border stays, because it is tied to thickness and edge type rather than to dimensions.
2. **The edge allowance is billed** as part of the bounding rectangle (§5). If polishing is already priced into the edge service, that would charge it twice.

On old data: if the two fixes in §12 turn up existing saved production records in live orders, deal with them then. Do not design a migration up front.

---

## 10. What was removed from the 2026-08-26 version, and why

Listed so a future session does not reintroduce the complexity.

| Removed | Reason |
|---|---|
| Cutting exceptions; notch include/exclude toggles | Nothing after edgework is ever in the cutting file. No exception mechanism needed. |
| Manual contour correction inside the cutting screen | Geometry is corrected in the Shape only. This was what turned the screen into a second editor. |
| Pricing direction (old §12: border enlarges the charged contour) | The customer does pay for the border, but it is billed as bounding-rectangle area (§5), not by growing the cut contour. |
| Old border table (4–6 → 3/4"–1", 8–10 → 1"–1 1/4", 12–15 → 1 1/2"–2") | Replaced by the two-range table in §5. |
| "Border may be a parallel offset to the angled segment" | Border is not an offset at all. It is clearance. |
| Repository file list (old §22) | Went stale immediately; the document itself said to verify against the repo. |
| Duplicated sections (old §17/§18, §24/§25) | Same content stated three times. |

---

## 11. Rules that must hold

- Shape is the only place geometry is authored.
- Cutting contour = finished shape + edge allowance. Nothing else.
- Notches, holes and cutouts never appear in the cutting file.
- Safety Border is clearance and a billing input — never part geometry. It is charged to the customer, but never by enlarging the cut contour.
- The cutting screen is review + border adjustment. Not an edgework configurator, not a drawing tool.
- A line-level override never rewrites the reusable Shape.
- Overrides are visible, attributed, and resettable to calculated.
- No machine export before the nesting contract is designed.
- No unconfirmed production numbers in code.
- New geometry behaviour needs regression tests.
- Generated `dist` is rebuilt through the build process, never hand-edited.

---

## 12. What actually needs to change

The cutting file already generates correctly. There are two defects. Fix those; leave the rest alone.

### Step 0 — audit, do not change anything yet

Find and report: where the cutting contour is generated, where the edge allowance is looked up (service type × thickness), where cutout/notch features enter the contour, and what is persisted on the Sales Order Line today.

Reproduce first, so the baseline is known to be good: plain rectangle; rectangle with polish; trapezoid with one angled side; shape with a notch; line using an Edgework Set.

### Defect 1 — cutouts and notches must leave the cutting contour

They are read into the contour today. They must not be. Everything machined after edgework is out of the cutting file unconditionally — no toggle, no exception list, no per-part flag.

Tests: a shape with a notch produces the same cutting contour as the same shape without it; same for holes and cutouts; the finished drawing still shows all of them.

### Defect 2 — Safety Border must become settable

There is no way to set one today. Needed:

- automatic value from thickness (§5);
- operator override, 1/16" steps;
- stored on the Sales Order Line with AUTO / OVERRIDE state;
- visible in the review screen with a reset;
- available to billing (§5) and later to nesting.

Tests: the border never changes the cutting contour; the auto value follows thickness; an override persists and resets cleanly.

### After that

UI cleanup per §7 — remove the duplicate per-side edge-service controls. Cosmetic next to the two defects, so it follows them.

Nesting and machine output stay out of scope (§8).

**Do not rewrite** the allowance calculation, the Shape geometry, or the working parts of the contour generator. Two changes, everything else untouched.

---

## 13. Verification before edits

```bash
git status --short --branch
git fetch --prune origin
git rev-parse HEAD origin/main
```

Then:

```bash
node build/check-manifest.js
node test/run.js
node build/build.js
TARGET=dist node test/run.js
```

Verify the real repository state before analysing anything. Do not assume a historical commit is current. Do not overwrite local changes.

---

## 14. Start message for a new session

> Use `CUTTING_HANDOFF_2026-08-27.md` as the current production context for GLASS ERP. Verify the actual repository state first. The cutting file already generates correctly — the edge allowance, driven by edge service type and thickness, is applied properly and must not be rewritten. There are exactly two defects: cutouts and notches are taken into account in the cutting contour when they must never be, and there is no way to set a Safety Border. The model is deliberately simple: the cutting contour is the finished shape plus the edge-service allowance applied perpendicular to each side, and nothing else. Notches, holes and cutouts are never in the cutting file because they are machined after edgework. Safety Border is clearance between parts during cutting and breakout — 1" for 4–8 mm glass, 1 1/2" for 8–15 mm, applied to angled and curved edges only, against both neighbouring parts and the sheet edge — and it is a nesting parameter, never part geometry, though the sheet area it consumes is billed to the customer. Geometry is authored only in the Shape; the cutting screen is for review and border adjustment, not a second editor. Audit the current Effective Production / cutting-shape implementation, report where it conflicts with this model, and propose the smallest safe data-contract and UI changes plus regression tests. Do not build Maver/Dasai output yet.
