# Production identity service

One PostgreSQL database issues company-wide order-line bases. Factory gateways
reserve disjoint per-line G/U ranges and commit physical UUIDs, scan commands,
assemblies and an ERP workspace on disk before a browser can print or save.
The browser allocator is a migration/prototype mode for **one browser database**.
Connect every production terminal to the gateway before starting multi-terminal
or multi-site issuance; unrelated browser counters cannot be merged by guessing.

## Run

Requires Node >=22.13 (CI uses Node 24), PostgreSQL, and `npm ci`. No Docker or
external SQLite daemon is needed. Keep credentials in the service environment.
Generate long random service tokens and supply the following variables:

| Service | Variable | Meaning |
|---|---|---|
| Central | `DATABASE_URL` | PostgreSQL connection string |
| Both | `IDENTITY_TOKEN` | Bearer token, minimum 32 characters |
| Central | `IDENTITY_PORT` | Default 8781 |
| Gateway | `IDENTITY_PORT` | Default 8782 |
| Both | `IDENTITY_HOST` | Default 127.0.0.1; configure the LAN interface for terminals |
| Gateway | `IDENTITY_CENTRAL_URL` | Central origin, default http://127.0.0.1:8781 |
| Gateway | `IDENTITY_CENTRAL_TOKEN` | Central token, defaults to its own token |
| Gateway | `IDENTITY_GATEWAY_ID` | Stable site name; default factory-1 |
| Gateway | `IDENTITY_GATEWAY_DB` | Persistent SQLite path; default ./var/production-identity/gateway.sqlite |
| Both | `IDENTITY_ALLOWED_ORIGINS` | Optional comma-separated browser origins |
| Gateway | `IDENTITY_ERP_ROOT` | Optional ERP source root; defaults to repository src |
| Central | `IDENTITY_RECOVERY_REQUIRED` | Set true after restoring an older central backup |

```sh
npm run build:web
npm run identity:migrate
npm run identity:central
# In another process, with the gateway environment:
npm run identity:gateway
```

Run as supervised services on persistent disks. Factory terminals must open
`https://factory-server/erp/index.html` through an HTTPS reverse proxy which forwards
both `/erp/` and `/v1/` to the gateway. The ERP writer uses Web Locks and requires a
secure browser context: plain HTTP on a LAN hostname does not enable editing.
Loopback HTTP (`127.0.0.1` or `localhost`) is suitable for local tests. Keeping the
ERP and gateway API on the same HTTPS origin avoids mixed-content restrictions
and cross-origin configuration. Use TLS for central traffic outside the trusted LAN. Static ERP files are public; all registry/workspace APIs require
the token. Master Data → Production identity configures the LAN URL and token;
credentials remain in terminal storage and are excluded from database exports.

**Connect** imports the existing registry atomically, preserving bases, legacy
codes, UUIDs, replacement links, high-water marks and assembly history. A conflicting
migration fails instead of renumbering stickers. If the gateway already has a
workspace, Connect opens that workspace. Back up each isolated browser before
migration. Do not import independent databases whose bases already collide.

**Release queue** publishes saved active orders and reserves a weighted pool of
30,000 new G/U codes across loaded lines and kinds. New online lines can be
released automatically with a smaller reserve. New jobs require central access;
only previously released work is available during an outage. A line can exhaust
its share before the total pool runs out; replenish while connected. Ranges are
never reclaimed when a job shrinks or is cancelled. Releasing again burns another
reservation; use it when replenishing or after gateway restart.

## Contracts and durability

All BIGINT counters are decimal strings in JSON. Full codes and UUIDs have unique
constraints. Each mutation has a `requestId`; retries with the same body return
the same result, while changed bodies conflict. Issuance is committed before the
HTTP response. IDs already committed on a gateway can become unused gaps if the
browser action fails; they are never issued to another object.

| Endpoint | Service | Purpose |
|---|---|---|
| POST /v1/lines | Both | Allocate/cache a permanent origin-line base |
| POST /v1/issue | Both | Issue G/U physical UUIDs with count, slots, replacement IDs and component keys |
| POST /v1/import-registry | Both | Preserve an existing complete registry and counters |
| POST /v1/legacy | Both | Register historical aliases/objects |
| GET /v1/lookup/:code | Both | Physical object, composition and events |
| GET /v1/status | Both | Authority/reconciliation/reservation status |
| POST /v1/gateways/register | Central | Register a new gateway process incarnation |
| POST /v1/reservations | Central | Reserve a disjoint line/kind range |
| POST /v1/jobs; GET /v1/jobs | Central | Release/fetch job snapshots |
| DELETE /v1/jobs/:id | Central | Revoke future job availability |
| POST /v1/events | Central | Ordered, idempotent gateway event ingestion |
| POST /v1/release; GET /v1/jobs | Gateway | Cache released jobs and reserve offline capacity |
| POST /v1/commands | Gateway | Scan, assembly, breakage, reassignment, cancellation |
| GET, POST /v1/workspace | Gateway | Shared ERP state with compare-and-swap revision |
| POST /v1/sync | Gateway | Reconcile and flush durable pending events |

SQLite uses WAL, synchronous FULL, and one exclusive owner per DB. Workspace
saves, their typed production commands, revision and outbox are one transaction.
Terminals check the revision before commands; a stale terminal reloads and asks
the operator to repeat the action. Concurrent saves cannot overwrite each other.
A fresh physical U records actual scanned child UUIDs. Its historical composition
is immutable. Glass can enter a new physical U after the previous U was retired;
it cannot belong to two active physical U objects.

The gateway syncs every 30 seconds and on demand. Central commits event IDs and
incarnation sequences before acknowledging; lost acknowledgements are safely
retried. ERP changes are synchronized as changed top-level fields and stored
centrally per gateway. This is site workspace synchronization; cross-site commercial
order editing still needs a separate authoritative ERP workflow. Central events
and identities are company-wide. The HTTP limit is 16 MB; sync batches are split
below 14 MB. Large commercial workspaces and drawing payloads must be measured
on real factory exports before rollout; this implementation does not claim an
unmeasured storage or throughput limit.

## Outage and recovery

The design covers **72 hours of central outage while the LAN gateway process and
local factory network keep running**, with a reserved budget of up to 30,000 new
codes. Existing local codes remain readable after a range is exhausted. No browser
fallback issues numbers when the gateway rejects or is unreachable.

A process restart creates a new incarnation and refuses to use every old range,
even if it was a normal restart. It requires central registration and **Release
queue** for fresh ranges. This conservative guard also covers a restored gateway
backup; offline restart issuance is intentionally blocked. Already committed
request retries and lookups remain available. Preserve SQLite with its WAL via
an SQLite-aware live backup or stop the service and copy the checkpointed DB.
Do not copy only a live .sqlite file while ignoring its WAL.

After a central database restore, start it with `IDENTITY_RECOVERY_REQUIRED=true`.
New lines, issuance, registration and reservations are blocked. Recover the latest
WAL/point-in-time state and reconcile high-water marks with every site's durable
reservations and pending events before removing the flag and restarting. A central
snapshot alone cannot prove which stickers were printed after that snapshot.
Never clear sequences or reuse a retired reservation to repair a gap. Old gateway
incarnations may upload their committed historical events, but never reserve again.

Keep UUID/registry/event archives permanently, even when orders are archived.
No retention job or authority high-water reset is provided by this service.

## Verification

```sh
npm run test:identity
# Optionally run the same store scenarios against an isolated PostgreSQL schema:
IDENTITY_TEST_DATABASE_URL=... npm run test:identity
```

Tests run the production SQL on embedded PostgreSQL (PGlite), durable native
SQLite, HTTP, and real Chromium terminals. The outage test advances a simulated
clock through 72 hours and issues all 30,000 codes; it is not a three-day hardware
soak or a production throughput benchmark. Before activation, test actual 3×4 and
4×6 labels, long codes, Code 128 B/C decoding on the factory printers/scanners,
server backup restoration, reserve distribution and peak load with real data.
