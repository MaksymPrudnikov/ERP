import { randomUUID } from 'node:crypto';
import { IdentityError, requireValue, baseDecimal } from '../common.mjs';

/** Tests run real PostgreSQL SQL in embedded PGlite; production uses pg.Pool. */
export async function postgresPool() {
  if (process.env.IDENTITY_TEST_DATABASE_URL) {
    const { default: pg } = await import('pg'); const pool = new pg.Pool({ connectionString: process.env.IDENTITY_TEST_DATABASE_URL });
    const schema = `identity_test_${randomUUID().replaceAll('-', '')}`;
    await pool.query(`CREATE SCHEMA ${schema}`);
    pool.on('connect', client => client.query(`SET search_path TO ${schema}`));
    // pg pool already opened one connection before attaching the callback.
    await pool.query(`SET search_path TO ${schema}`);
    return { pool, kind: 'PostgreSQL', close: async () => { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); } };
  }
  const { PGlite } = await import('@electric-sql/pglite'); const db = new PGlite(); await db.waitReady;
  let queue = Promise.resolve();
  const acquire = async () => {
    let release; const held = new Promise(resolve => { release = resolve; }); const previous = queue; queue = previous.then(() => held); await previous;
    return { query: (sql, params) => params?.length ? db.query(sql, params) : db.query(sql), release };
  };
  const pool = { connect: acquire, query: async (sql, params) => { const client = await acquire(); try { return await client.query(sql, params); } finally { client.release(); } } };
  // PGlite query does not accept SQL scripts; migration adapter supplies exec for scripts.
  const baseQuery = pool.query;
  pool.query = async (sql, params) => sql.startsWith('CREATE TABLE IF NOT EXISTS identity_migrations') ? db.exec(sql) : baseQuery(sql, params);
  return { pool, kind: 'PGlite', close: () => db.close() };
}

export class FakeCentral {
  constructor() { this.online = true; this.base = 0n; this.lines = new Map(); this.counter = new Map(); this.requests = new Map(); this.incarnations = new Map(); this.active = new Map(); this.released = new Map(); this.ranges = new Map(); this.events = new Map(); this.entities = new Map(); this.codes = new Map(); this.nextEvents = new Map(); this.dropAckOnce = false; }
  available() { if (!this.online) throw new IdentityError(503, 'CENTRAL_UNAVAILABLE', 'Central unavailable.'); }
  async createLine(body) {
    this.available(); let line = this.lines.get(body.originLineKey);
    if (!line) { line = { id: randomUUID(), originLineKey: body.originLineKey, base: (++this.base).toString().padStart(10, '0') }; this.lines.set(body.originLineKey, line); }
    return line;
  }
  async registerGateway(body) {
    this.available(); const exists = this.incarnations.get(body.incarnationId);
    requireValue(!exists || this.active.get(body.gatewayId) === body.incarnationId, 'RETIRED_INCARNATION', 'Retired incarnation.', 409);
    this.active.set(body.gatewayId, body.incarnationId); this.incarnations.set(body.incarnationId, body.gatewayId); if (!this.nextEvents.has(body.incarnationId)) this.nextEvents.set(body.incarnationId, BigInt(body.startSequence));
    return { ...body, reconciled: true };
  }
  async reserve(body) {
    this.available(); if (this.requests.has(body.requestId)) return this.requests.get(body.requestId);
    requireValue(this.active.get(body.gatewayId) === body.incarnationId, 'RECONCILIATION_REQUIRED', 'Not active.', 409);
    const line = await this.createLine(body); const key = `${body.originLineKey}\u0000${body.kind}`; const start = this.counter.get(key) || 1n; const end = start + BigInt(body.count) - 1n;
    this.counter.set(key, end + 1n); const range = { ...body, id: randomUUID(), base: line.base, start: start.toString(), end: end.toString() };
    this.ranges.set(range.id, range); this.requests.set(body.requestId, range); return range;
  }
  async releaseJobs(body) {
    this.available(); for (const value of body.jobs) { const line = await this.createLine(value); this.released.set(value.id, { ...value, base: line.base, gatewayId: body.gatewayId }); }
    return { released: body.jobs.length };
  }
  async jobs(gatewayId) { this.available(); return { jobs: [...this.released.values()].filter(job => job.gatewayId === gatewayId) }; }
  async importRegistry(body) {
    this.available(); const registry = body.registry;
    this.base = this.base > BigInt(registry.baseSeq) ? this.base : BigInt(registry.baseSeq);
    for (const value of registry.lines) {
      this.lines.set(value.key, { originLineKey: value.key, base: baseDecimal(value.base) });
      for (const type of ['G', 'U']) this.counter.set(`${value.key}\u0000${type}`, BigInt(value[`seq${type}`]) + 1n);
    }
    for (const value of registry.entities) { this.entities.set(value.id, value); this.codes.set(value.code, value.id); }
    return { importedLines: registry.lines.length, importedEntities: registry.entities.length };
  }
  async ingest(body) {
    this.available(); const acknowledged = [];
    for (const event of body.events) {
      if (!this.events.has(event.id)) {
        requireValue(this.incarnations.get(event.incarnationId) === body.gatewayId && this.nextEvents.get(event.incarnationId) === BigInt(event.sequence), 'EVENT_SEQUENCE_GAP', 'Event order violated.', 409);
        if (event.type === 'entity.issued') {
          const range = this.ranges.get(event.payload.reservationId); const entity = event.payload.entity;
          requireValue(range && range.incarnationId === event.incarnationId && BigInt(entity.instance) >= BigInt(range.start) && BigInt(entity.instance) <= BigInt(range.end) && !this.codes.has(entity.code), 'IDENTITY_CONFLICT', 'Issued code invalid or repeated.', 409);
          this.entities.set(entity.id, entity); this.codes.set(entity.code, entity.id);
        }
        this.events.set(event.id, event); this.nextEvents.set(event.incarnationId, BigInt(event.sequence) + 1n);
      }
      acknowledged.push(event.id);
    }
    if (this.dropAckOnce) { this.dropAckOnce = false; throw new IdentityError(503, 'ACK_LOST', 'Central commit succeeded; acknowledgement was lost.'); }
    return { acknowledged };
  }
}
