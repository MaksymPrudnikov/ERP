# Users and the server

People and their sign-ins, access to sections, the sign-in log and connecting a computer to the server (Cloud). The
section is visible to people with the Users box ticked in Users — the administrators.

## The screen

Pills **Office** (people with an office sign-in), **Production** (people with a station sign-in), **Sign-in log**,
**Cloud** — with record counts. Above the table, for the ticked person, **Edit** and **Remove**; on the right **Add
user**. Tables work as in Sales ([lists.en.md](lists.en.md)).

- **Office**: Name, Now (where the person is signed in now, otherwise when they were last seen), Sections, Password (set /
  not set). A server administrator also sees the **Server** column — the sign-in email and “same” / “differs” / “not on
  server”.
- **Production**: No., Name, Now, PIN.

## A person

A person has two sign-ins, both optional, possibly both — for example a shop foreman (owner, 3 Oct 2026).

- **Name** — required.
- **Office sign-in · password · sections**:
  - **Password** — 8 characters or more. The first password is given only in Users: nobody can make one up on the
    sign-in screen, or anyone at the computer could take someone else's name. After that people change their own
    password: their name at the bottom of the menu → **Change password** (or **Sign out**).
  - **Server login** — the email for the server sign-in, one per person.
  - **Sections** — boxes for menu sections, **All** / **None**. Access is “sees / does not see” (owner's choice): a
    section without its box is not in the menu and cannot be opened. Two boxes have no menu item: **Screens** — place
    reports on station and people screens (Reports → Show on); **Cost & margin** — see and edit purchase prices in Data.
- **Station sign-in · number · PIN**: **No.** — the personal number, **PIN** — 4 digits. “Any station. The office gives
  the PIN.” People do not change their PIN themselves. Removing a PIN ends the station sign-in at once.
- **Save** / **Cancel**. Passwords and PINs are not stored — only their fingerprints. Switching to another Users tab with
  an unsaved card asks “Discard unsaved changes?”.

**Users never locks itself**: the last person with the Users box cannot lose it or be removed — “Someone must keep
Users”. An administrator (the Users box) sees everything.

## Sign-in log

Sign-ins and sign-outs: When (14 days by default), Who, What, Where (office, Station CUT…), Note. The log is this
computer's (“this computer only”).

## The server (Cloud)

Each computer works with its own database in the browser; the server is the shared copy through which computers
exchange their edits. Without a network the queue of edits waits and survives F5.

ERP opens at its own address `https://marketing-farm.agency` (the old github.io link leads there too) and talks over
the network only to its Supabase server and Google Maps (trip kilometres): nothing from the database goes to another
address (9 Nov 2026).

### Connecting a computer

- While a computer is not connected, the bottom bar shows **Connect server**: a small window with Server, Publishable
  key, Email, Password, **Connect**. The same is in Users → Cloud.
- The first connection goes straight to Download: the browser database is replaced by the server's (it asks “Replace
  this browser database?”). Any server member may download, not only Users.
- **One sign-in**: once connected, ERP signs in with the server password — no separate ERP password. Sign out in Cloud
  signs out of ERP too. Stations sign in as before, with number and PIN.

### Users → Cloud

- **Server**, **Publishable key**, **Email**, **Password**, **Connect**; status: Not connected, Signed in · email,
  Connected · name (· admin). **Check** — test the connection, **Sign out**.
- **Sync**: **Upload this database** — this database becomes the server's (the server must be empty; needs a server
  administrator); **Download from server** — this computer's database is replaced by the server's; **Stop sync** — the
  computer stops syncing and keeps its database as it is. Status: Synced, N waiting, Offline · N waiting.
- **Access** (server administrators) — which sections are needed to read and write each table on the server: Table,
  Read, Write, Edit, ×, **Add rule**, **Save access**, Refresh. “No rule — everyone.” Without the section a person gets
  no rows of that table, even around the screen.
- **Data** — **Export JSON**; while not syncing also **Import JSON**, Restore pre-import backup and **Clear database**.
  With a server they are hidden: replacing the database would hit everyone. Import and Export are for testing; working
  data lives on the server (owner, 19 Oct 2026).

### Rights on the server

Saving a person in Users sends their section boxes to the server: the Users box makes a server administrator, no office
sign-in disables the server sign-in, a changed email disables the old sign-in. A new password for a person with an email
is a new server sign-in.

### What the bottom bar says

- **Editing here** — this tab writes to the database. **Editing in another tab** — another tab writes; this one is for
  viewing. **Not saved**, **Older version** (a new program version is out) — tell the administrator.
- **Server has a new database · Download** — the server has a new database (it was cleared and filled again). Syncing
  stops until this computer presses Download in Users → Cloud; otherwise the old database would mix with the new one
  (9 Nov 2026).
- “Changed on another computer: … Server copy shown.” — someone was first: this computer's rows went back to the server
  copy. “No access on server: …” — the person lacks the section for those records.
- A decision on a shared balance made on two computers the same minute is recorded once; the second gets “Changed on
  another computer”: a refund or allocation from one payment, payments on one debt, an agent payout, a PS with the same
  units, a count of sheets, consumables or Stock items, an `S-` piece in a cut layout or Not found, a batch with the same
  glass, a QuickBooks export. Facts never conflict: supplier payments and invoices, receiving, Add / Remove, write-offs,
  scans (9 Nov 2026).
- On the right — the database size (DB … MB).

### Archive

Finished work (shipped and fully paid, after 3 months) goes to the archive; with a server the archive lives only there
and opens on request (owner, 22 Oct and 1 Nov 2026).
