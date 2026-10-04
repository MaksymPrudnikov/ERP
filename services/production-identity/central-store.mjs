import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { IdentityError, MAX_COUNTER, COMMAND_TYPES, requireValue, uuid, string, requestKey, lineKey, kind, count, decimal, baseDecimal, barcode, canonicalCode, fingerprint, issueRequest, makeEntity, entityFromRow } from './common.mjs';

const ENTITY_SELECT = `SELECT e.*, l.origin_line_key, l.base FROM identity_entities e JOIN identity_lines l ON l.id=e.line_id`;
export const migrationPath = fileURLToPath(new URL('./migrations/001_identity.sql', import.meta.url));

/** One PostgreSQL database is the authority for every company site. Never use a browser counter here. */
export class CentralStore {
  constructor(pool, { recoveryRequired = false } = {}) { this.pool = pool; this.recoveryRequired = recoveryRequired; }
  assertWritable() { requireValue(!this.recoveryRequired, 'CENTRAL_RECOVERY_REQUIRED', 'Central recovery requires verified high-water reconciliation before issuing new numbers.', 409); }
  async migrate() { await this.pool.query(await readFile(migrationPath, 'utf8')); }
  async transaction(action) {
    const db = await this.pool.connect();
    try { await db.query('BEGIN'); const result = await action(db); await db.query('COMMIT'); return result; }
    catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }
  async idempotent(operation, input, action) {
    const requestId = requestKey(input.requestId); const hash = fingerprint(input);
    return this.transaction(async db => {
      const inserted = await db.query(`INSERT INTO identity_requests(request_id,operation,fingerprint,result) VALUES($1,$2,$3,'{}') ON CONFLICT DO NOTHING RETURNING request_id`, [requestId, operation, hash]);
      if (!inserted.rows.length) {
        const saved = (await db.query('SELECT * FROM identity_requests WHERE request_id=$1 FOR UPDATE', [requestId])).rows[0];
        requireValue(saved.operation === operation && saved.fingerprint === hash, 'IDEMPOTENCY_CONFLICT', 'requestId was already used for a different request.', 409);
        return saved.result;
      }
      const result = await action(db);
      await db.query('UPDATE identity_requests SET result=$2::jsonb WHERE request_id=$1', [requestId, JSON.stringify(result)]);
      return result;
    });
  }
  async ensureLine(db, originLineKey) {
    const key = lineKey(originLineKey);
    await db.query('INSERT INTO identity_lines(id,origin_line_key) VALUES($1,$2) ON CONFLICT(origin_line_key) DO NOTHING', [randomUUID(), key]);
    const row = (await db.query('SELECT id, origin_line_key, base::text FROM identity_lines WHERE origin_line_key=$1', [key])).rows[0];
    return { id: row.id, originLineKey: row.origin_line_key, base: baseDecimal(row.base) };
  }
  async getLine(originLineKey) {
    const row = (await this.pool.query('SELECT id,origin_line_key,base::text FROM identity_lines WHERE origin_line_key=$1', [lineKey(originLineKey)])).rows[0];
    requireValue(row, 'LINE_NOT_FOUND', 'Order line has no issued base.', 404);
    return { id: row.id, originLineKey: row.origin_line_key, base: baseDecimal(row.base) };
  }
  createLine(body) {
    const input = { requestId: requestKey(body.requestId), originLineKey: lineKey(body.originLineKey) };
    return this.idempotent('line', input, async db => {
      if (this.recoveryRequired) {
        const existing = (await db.query('SELECT id,base::text FROM identity_lines WHERE origin_line_key=$1', [input.originLineKey])).rows[0];
        requireValue(existing, 'CENTRAL_RECOVERY_REQUIRED', 'Central recovery cannot allocate a new order line.', 409);
        return { id: existing.id, originLineKey: input.originLineKey, base: baseDecimal(existing.base) };
      }
      return this.ensureLine(db, input.originLineKey);
    });
  }
  async takeRange(db, line, type, amount) {
    await db.query('INSERT INTO identity_counters(line_id,kind) VALUES($1,$2) ON CONFLICT DO NOTHING', [line.id, type]);
    const row = (await db.query('SELECT next_instance::text FROM identity_counters WHERE line_id=$1 AND kind=$2 FOR UPDATE', [line.id, type])).rows[0];
    const start = BigInt(row.next_instance); const end = start + BigInt(amount) - 1n;
    requireValue(end < MAX_COUNTER, 'COUNTER_EXHAUSTED', 'No further numbers are available in this series.', 409);
    await db.query('UPDATE identity_counters SET next_instance=$3 WHERE line_id=$1 AND kind=$2', [line.id, type, (end + 1n).toString()]);
    return { start: start.toString(), end: end.toString() };
  }
  async insertEntity(db, entity, lineId) {
    if (entity.replacesId) {
      const previous = (await db.query('SELECT line_id,kind FROM identity_entities WHERE id=$1', [uuid(entity.replacesId, 'replacesId')])).rows[0];
      requireValue(previous && previous.kind === entity.kind && previous.line_id === lineId, 'INVALID_REPLACEMENT', 'Replacement must refer to an existing object of the same origin line and kind.', 409);
    }
    await db.query(`INSERT INTO identity_entities(id,line_id,kind,code,instance,replaces_id,current_line_key,slot,component_key,state,legacy,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)`,
    [entity.id, lineId, entity.kind, entity.code, entity.instance, entity.replacesId, entity.currentLineKey || entity.originLineKey,
      JSON.stringify(entity.slot ?? null), entity.componentKey ?? null, entity.state || 'active', !!entity.legacy, entity.createdAt]);
    await db.query('INSERT INTO identity_registry(code,entity_id) VALUES($1,$2)', [entity.code, entity.id]);
  }
  issue(body) {
    this.assertWritable();
    const input = issueRequest(body);
    return this.idempotent('issue', input, async db => {
      const line = await this.ensureLine(db, input.originLineKey); const range = await this.takeRange(db, line, input.kind, input.count);
      const entities = [];
      for (let i = 0; i < input.count; i++) {
        const entity = makeEntity(input, line.base, (BigInt(range.start) + BigInt(i)).toString(), i);
        await this.insertEntity(db, entity, line.id); entities.push(entity);
      }
      return { requestId: input.requestId, line, entities };
    });
  }
  registerGateway(body) {
    this.assertWritable();
    const input = { gatewayId: string(body.gatewayId, 'gatewayId', 128), incarnationId: uuid(body.incarnationId, 'incarnationId'), startSequence: decimal(body.startSequence || '1', 'startSequence') };
    return this.transaction(async db => {
      await db.query(`INSERT INTO identity_gateways(gateway_id,active_incarnation) VALUES($1,$2) ON CONFLICT DO NOTHING`, [input.gatewayId, input.incarnationId]);
      const gateway = (await db.query('SELECT * FROM identity_gateways WHERE gateway_id=$1 FOR UPDATE', [input.gatewayId])).rows[0];
      const existing = (await db.query('SELECT * FROM identity_incarnations WHERE id=$1', [input.incarnationId])).rows[0];
      if (existing) {
        requireValue(existing.gateway_id === input.gatewayId && existing.state === 'active' && gateway.active_incarnation === input.incarnationId, 'RETIRED_INCARNATION', 'This gateway incarnation is no longer permitted to reserve numbers.', 409);
      } else {
        await db.query(`UPDATE identity_incarnations SET state='retired' WHERE gateway_id=$1 AND state='active'`, [input.gatewayId]);
        await db.query('UPDATE identity_gateways SET active_incarnation=$2,updated_at=now() WHERE gateway_id=$1', [input.gatewayId, input.incarnationId]);
        await db.query(`INSERT INTO identity_incarnations(id,gateway_id,state,next_event_sequence) VALUES($1,$2,'active',$3)`, [input.incarnationId, input.gatewayId, input.startSequence]);
      }
      return { gatewayId: input.gatewayId, incarnationId: input.incarnationId, reconciled: true };
    });
  }
  async assertActiveGateway(db, gatewayId, incarnationId) {
    const row = (await db.query('SELECT active_incarnation FROM identity_gateways WHERE gateway_id=$1 FOR UPDATE', [gatewayId])).rows[0];
    requireValue(row && row.active_incarnation === incarnationId, 'RECONCILIATION_REQUIRED', 'Gateway must reconcile its current incarnation before reserving numbers.', 409);
  }
  reserve(body) {
    this.assertWritable();
    const input = { requestId: requestKey(body.requestId), gatewayId: string(body.gatewayId, 'gatewayId', 128), incarnationId: uuid(body.incarnationId, 'incarnationId'), originLineKey: lineKey(body.originLineKey), kind: kind(body.kind), count: count(body.count) };
    return this.idempotent('reserve', input, async db => {
      await this.assertActiveGateway(db, input.gatewayId, input.incarnationId);
      const line = await this.ensureLine(db, input.originLineKey); const range = await this.takeRange(db, line, input.kind, input.count); const id = randomUUID();
      await db.query(`INSERT INTO identity_reservations(id,line_id,kind,gateway_id,incarnation_id,range_start,range_end) VALUES($1,$2,$3,$4,$5,$6,$7)`, [id, line.id, input.kind, input.gatewayId, input.incarnationId, range.start, range.end]);
      return { id, gatewayId: input.gatewayId, incarnationId: input.incarnationId, originLineKey: line.originLineKey, base: line.base, kind: input.kind, ...range };
    });
  }
  releaseJobs(body) {
    this.assertWritable();
    const input = { requestId: requestKey(body.requestId), gatewayId: string(body.gatewayId, 'gatewayId', 128), jobs: body.jobs };
    requireValue(Array.isArray(input.jobs) && input.jobs.length > 0 && input.jobs.length <= 1000, 'INVALID_JOBS', 'jobs must contain between 1 and 1000 released jobs.');
    return this.idempotent('releaseJobs', input, async db => {
      const gateway = (await db.query('SELECT gateway_id FROM identity_gateways WHERE gateway_id=$1', [input.gatewayId])).rows[0];
      requireValue(gateway, 'GATEWAY_NOT_FOUND', 'Register the gateway before releasing jobs.', 409);
      for (const job of input.jobs) {
        string(job.id, 'job.id', 256); kind(job.kind); count(job.count, 10000000); if (job.reserveCount != null) count(job.reserveCount);
        const line = await this.ensureLine(db, job.originLineKey);
        await db.query(`INSERT INTO identity_jobs(id,gateway_id,line_id,kind,count,reserve_count,payload,released) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,true)
          ON CONFLICT(id) DO UPDATE SET gateway_id=excluded.gateway_id,line_id=excluded.line_id,kind=excluded.kind,count=excluded.count,reserve_count=excluded.reserve_count,payload=excluded.payload,released=true,released_at=now()`,
        [job.id, input.gatewayId, line.id, job.kind, job.count, job.reserveCount ?? null, JSON.stringify(job.payload ?? {})]);
      }
      return { released: input.jobs.length };
    });
  }
  async jobs(gatewayId) {
    const rows = (await this.pool.query(`SELECT j.*,l.origin_line_key,l.base::text FROM identity_jobs j JOIN identity_lines l ON l.id=j.line_id WHERE gateway_id=$1 AND released=true ORDER BY j.id`, [string(gatewayId, 'gatewayId', 128)])).rows;
    return { jobs: rows.map(row => ({ id: row.id, originLineKey: row.origin_line_key, base: baseDecimal(row.base), kind: row.kind, count: row.count, reserveCount: row.reserve_count, payload: row.payload })) };
  }
  async revokeJob(id) { await this.pool.query('UPDATE identity_jobs SET released=false WHERE id=$1', [string(id, 'job.id', 256)]); return { revoked: true }; }
  async lookup(code) {
    const value = canonicalCode(code);
    const row = (await this.pool.query(`${ENTITY_SELECT} JOIN identity_registry r ON r.entity_id=e.id WHERE r.code=$1`, [value])).rows[0];
    requireValue(row, 'BARCODE_NOT_FOUND', 'No registered object has this barcode.', 404);
    const composition = (await this.pool.query('SELECT glass_id FROM identity_composition WHERE unit_id=$1 ORDER BY glass_id', [row.id])).rows.map(v => v.glass_id);
    const events = (await this.pool.query(`SELECT id,type,payload,occurred_at FROM identity_events WHERE payload->>'entityId'=$1 OR payload->>'unitId'=$1 OR payload->'entity'->>'id'=$1 ORDER BY occurred_at,id`, [row.id])).rows;
    return { entity: entityFromRow(row), scannedCode: value, composition, events };
  }
  importLegacy(body) {
    const input = { requestId: requestKey(body.requestId), entities: body.entities };
    requireValue(Array.isArray(input.entities) && input.entities.length > 0 && input.entities.length <= 10000, 'INVALID_ENTITIES', 'entities must contain between 1 and 10000 legacy objects.');
    return this.idempotent('importLegacy', input, async db => {
      const imported = [];
      for (const value of input.entities) {
        const line = await this.ensureLine(db, value.originLineKey); const code = canonicalCode(value.code);
        requireValue(!/^[GU]-0*[1-9][0-9]*-[1-9][0-9]*$/.test(code), 'NOT_LEGACY_CODE', 'New-format objects must be issued by the allocator.', 409);
        const entity = { ...value, id: uuid(value.id, 'id'), code, kind: kind(value.kind), originLineKey: line.originLineKey, instance: null, replacesId: null, createdAt: value.createdAt || new Date().toISOString(), legacy: true };
        await this.insertEntity(db, entity, line.id);
        for (const alias of value.aliases ?? []) await db.query('INSERT INTO identity_registry(code,entity_id,is_alias) VALUES($1,$2,true)', [canonicalCode(alias), entity.id]);
        imported.push(entity.id);
      }
      return { imported };
    });
  }
  importRegistry(body) {
    const input = { requestId: requestKey(body.requestId), registry: body.registry };
    const registry = input.registry;
    requireValue(registry && registry.version === 1 && Array.isArray(registry.lines) && Array.isArray(registry.entities), 'INVALID_REGISTRY', 'A version 1 production identity registry is required.');
    requireValue(registry.lines.length <= 100000 && registry.entities.length <= 500000, 'INVALID_REGISTRY', 'Registry import exceeds the supported batch size.');
    requireValue(typeof registry.baseSeq === 'string' && /^(0|[1-9][0-9]*)$/.test(registry.baseSeq) && BigInt(registry.baseSeq) < MAX_COUNTER, 'INVALID_COUNTER', 'baseSeq must be a non-negative 64-bit decimal string.');
    return this.idempotent('importRegistry', input, async db => {
      // Serialize imported high-water marks with ordinary inserts and allocation-counter updates.
      await db.query('LOCK TABLE identity_lines,identity_counters,identity_entities IN SHARE ROW EXCLUSIVE MODE');
      const lines = new Map(); const bases = new Set(); let highestBase = BigInt(registry.baseSeq);
      for (const value of registry.lines) {
        const key = lineKey(value.key || value.originLineKey); const base = baseDecimal(value.base);
        requireValue(!lines.has(key) && !bases.has(base), 'REGISTRY_CONFLICT', 'Import contains a repeated line or line base.', 409);
        bases.add(base); highestBase = highestBase > BigInt(base) ? highestBase : BigInt(base);
        let line = (await db.query('SELECT id,base::text FROM identity_lines WHERE origin_line_key=$1', [key])).rows[0];
        requireValue(!line || BigInt(line.base) === BigInt(base), 'LINE_BASE_CONFLICT', 'Origin line already has a different permanent base.', 409);
        if (!line) {
          const owner = (await db.query('SELECT origin_line_key FROM identity_lines WHERE base=$1', [BigInt(base).toString()])).rows[0];
          requireValue(!owner, 'LINE_BASE_CONFLICT', 'Line base already belongs to another origin line.', 409);
          line = { id: randomUUID(), base }; await db.query('INSERT INTO identity_lines(id,origin_line_key,base) VALUES($1,$2,$3)', [line.id, key, BigInt(base).toString()]);
        }
        lines.set(key, { id: line.id, base, seqG: value.seqG, seqU: value.seqU });
        for (const type of ['G', 'U']) {
          const last = value[`seq${type}`];
          requireValue(typeof last === 'string' && /^(0|[1-9][0-9]*)$/.test(last) && BigInt(last) < MAX_COUNTER, 'INVALID_COUNTER', 'Imported instance high-water must be a non-negative decimal string.');
          await db.query(`INSERT INTO identity_counters(line_id,kind,next_instance) VALUES($1,$2,$3) ON CONFLICT(line_id,kind) DO UPDATE SET next_instance=GREATEST(identity_counters.next_instance,excluded.next_instance)`, [line.id, type, (BigInt(last) + 1n).toString()]);
        }
      }
      const ids = new Set(); const codes = new Set(); const newReplacements = [];
      for (const value of registry.entities) {
        const id = uuid(value.id, 'entity.id'); const type = kind(value.kind); const code = canonicalCode(value.code); const key = lineKey(value.originLineKey); const line = lines.get(key);
        requireValue(line && !ids.has(id) && !codes.has(code), 'REGISTRY_CONFLICT', 'Import contains a duplicate object or unknown origin line.', 409); ids.add(id); codes.add(code);
        const match = /^([GU])-(0*[1-9][0-9]*)-([1-9][0-9]*)$/.exec(code);
        const legacy = !match;
        if (legacy) requireValue(/^[GU]-[0-9]+$/.test(code) && code[0] === type && (value.instance == null), 'INVALID_BARCODE', 'Legacy code must be an original G/U number with a null instance.');
        else requireValue(match[1] === type && code === barcode(type, line.base, decimal(value.instance, 'instance')) && BigInt(value.instance) <= BigInt(line[`seq${type}`]), 'INVALID_BARCODE', 'Physical barcode does not match its imported line and high-water mark.');
        requireValue(Number.isFinite(Date.parse(value.createdAt)), 'INVALID_ENTITY', 'Imported object createdAt is invalid.');
        const existing = (await db.query('SELECT id,code,line_id,kind,instance::text,replaces_id,metadata FROM identity_entities WHERE id=$1', [id])).rows[0];
        const replacesId = value.replacesId ? uuid(value.replacesId, 'replacesId') : null;
        if (existing) {
          requireValue(existing.code === code && existing.line_id === line.id && existing.kind === type && existing.instance === (legacy ? null : value.instance) && (!existing.replaces_id || existing.replaces_id === replacesId), 'ENTITY_CONFLICT', 'Existing physical object has a different immutable identity.', 409);
          requireValue(!existing.metadata?.componentIds || JSON.stringify(existing.metadata.componentIds)===JSON.stringify(value.componentIds),'IMMUTABLE_COMPOSITION','Imported unit already has different physical glass.',409);
        } else {
          await this.insertEntity(db, { ...value, id, kind: type, code, originLineKey: key, currentLineKey: value.currentLineKey || key, instance: legacy ? null : value.instance, replacesId: null, state: value.status === 'broken' ? 'broken' : value.active === false ? 'cancelled' : 'active', legacy }, line.id);
        }
        await db.query('UPDATE identity_entities SET metadata=$2::jsonb WHERE id=$1', [id, JSON.stringify(value)]);
        if (replacesId) newReplacements.push({ id, replacesId, lineId: line.id, kind: type });
        for (const alias of value.aliases || []) {
          const normalized = canonicalCode(alias); const previous = (await db.query('SELECT entity_id FROM identity_registry WHERE code=$1', [normalized])).rows[0];
          requireValue(!previous || previous.entity_id === id, 'BARCODE_CONFLICT', 'Imported alias belongs to another physical object.', 409);
          await db.query('INSERT INTO identity_registry(code,entity_id,is_alias) VALUES($1,$2,true) ON CONFLICT DO NOTHING', [normalized, id]);
        }
      }
      for (const value of newReplacements) {
        const previous = (await db.query('SELECT line_id,kind FROM identity_entities WHERE id=$1', [value.replacesId])).rows[0];
        requireValue(previous && previous.line_id === value.lineId && previous.kind === value.kind && value.id !== value.replacesId, 'INVALID_REPLACEMENT', 'Imported replacement refers to an incompatible physical object.', 409);
        await db.query('UPDATE identity_entities SET replaces_id=$2 WHERE id=$1', [value.id, value.replacesId]);
      }
      for(const value of newReplacements){
        const cycle=(await db.query('WITH RECURSIVE chain(id,replaces_id) AS (SELECT id,replaces_id FROM identity_entities WHERE id=$1 UNION SELECT e.id,e.replaces_id FROM identity_entities e JOIN chain c ON e.id=c.replaces_id) SELECT id FROM chain WHERE replaces_id=$1',[value.id])).rows;
        requireValue(!cycle.length,'INVALID_REPLACEMENT','Replacement history contains a cycle.',409);
      }
      for (const value of registry.entities) {
        if (value.kind !== 'U' || !value.componentIds?.length) continue;
        for (const glassId of value.componentIds) {
          const glass = (await db.query('SELECT kind FROM identity_entities WHERE id=$1', [uuid(glassId, 'componentId')])).rows[0];
          requireValue(glass?.kind === 'G', 'INVALID_COMPOSITION', 'Imported unit component must refer to a physical glass.', 409);
          const existing = (await db.query("SELECT c.unit_id FROM identity_composition c JOIN identity_entities e ON e.id=c.unit_id WHERE c.glass_id=$1 AND e.state='active'", [glassId])).rows[0];
          requireValue(value.active===false || value.status==='broken' || !existing || existing.unit_id===value.id, 'GLASS_ALREADY_ASSEMBLED', 'Imported glass already belongs to another physical unit.', 409);
          await db.query('INSERT INTO identity_composition(unit_id,glass_id,assembled_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [value.id, glassId, value.assembledAt || value.createdAt]);
        }
      }
      if (highestBase > 0n) await db.query(`SELECT setval('identity_line_base',GREATEST((SELECT last_value FROM identity_line_base),$1::bigint),true)`, [highestBase.toString()]);
      return { importedLines: lines.size, importedEntities: ids.size, baseSeq: highestBase.toString(), reconciliationRequired: this.recoveryRequired };
    });
  }
  async applyCommand(db, event) {
    const p = event.payload;
    if (event.type === 'scan.recorded') {
      const found = (await db.query('SELECT entity_id FROM identity_registry WHERE code=$1', [canonicalCode(p.code)])).rows[0];
      requireValue(found, 'BARCODE_NOT_FOUND', 'Scanned object is not registered.', 409); return;
    }
    if (event.type === 'assembly.completed') {
      uuid(p.unitId, 'unitId'); requireValue(Array.isArray(p.glassIds) && p.glassIds.length > 0 && p.glassIds.length <= 100, 'INVALID_COMPOSITION', 'Assembly must contain physical glass IDs.');
      requireValue(new Set(p.glassIds).size === p.glassIds.length, 'INVALID_COMPOSITION', 'Assembly contains a repeated glass.', 409);
      const unit = (await db.query(`${ENTITY_SELECT} WHERE e.id=$1 FOR UPDATE`, [p.unitId])).rows[0];
      requireValue(unit && unit.kind === 'U' && unit.state === 'active', 'INVALID_UNIT', 'Assembly requires an active unit.', 409);
      const existing = (await db.query('SELECT glass_id FROM identity_composition WHERE unit_id=$1', [unit.id])).rows.map(v => v.glass_id).sort();
      if (existing.length) { requireValue(JSON.stringify(existing) === JSON.stringify([...p.glassIds].sort()), 'IMMUTABLE_COMPOSITION', 'A physical unit already has a different composition.', 409); return; }
      for (const id of p.glassIds) {
        uuid(id, 'glassId'); const glass = (await db.query(`${ENTITY_SELECT} WHERE e.id=$1 FOR UPDATE`, [id])).rows[0];
        requireValue(glass && glass.kind === 'G' && glass.state === 'active' && glass.current_line_key === unit.current_line_key, 'INVALID_GLASS', 'Assembly glass must be active and belong to the unit current line.', 409);
        const owner=(await db.query("SELECT c.unit_id FROM identity_composition c JOIN identity_entities e ON e.id=c.unit_id WHERE c.glass_id=$1 AND e.state='active'",[id])).rows[0];
        requireValue(!owner || owner.unit_id===unit.id,'GLASS_ALREADY_ASSEMBLED','Glass already belongs to another active physical unit.',409);
        await db.query('INSERT INTO identity_composition(unit_id,glass_id,assembled_at) VALUES($1,$2,$3)', [unit.id, id, event.occurredAt]);
      }
      return;
    }
    uuid(p.entityId, 'entityId');
    const row = (await db.query('SELECT id FROM identity_entities WHERE id=$1 FOR UPDATE', [p.entityId])).rows[0];
    requireValue(row, 'ENTITY_NOT_FOUND', 'Command object is not registered.', 409);
    if (event.type === 'entity.reassigned') {
      const currentLineKey = lineKey(p.currentLineKey);
      const target = (await db.query('SELECT id FROM identity_lines WHERE origin_line_key=$1', [currentLineKey])).rows[0];
      requireValue(target, 'LINE_NOT_FOUND', 'Target order line has no issued base.', 409);
      await db.query('UPDATE identity_entities SET current_line_key=$2 WHERE id=$1', [p.entityId, currentLineKey]);
    } else await db.query('UPDATE identity_entities SET state=$2 WHERE id=$1', [p.entityId, event.type === 'entity.broken' ? 'broken' : 'cancelled']);
  }
  ingest(body) {
    const gatewayId = string(body.gatewayId, 'gatewayId', 128);
    requireValue(Array.isArray(body.events) && body.events.length <= 1000, 'INVALID_EVENTS', 'At most 1000 ordered events may be synchronized at once.');
    return this.transaction(async db => {
      const acknowledged = [];
      for (const value of body.events) {
        const event = { id: uuid(value.id, 'event.id'), incarnationId: uuid(value.incarnationId, 'incarnationId'), sequence: decimal(value.sequence, 'event.sequence'), type: value.type, payload: value.payload, occurredAt: value.occurredAt };
        requireValue(event.type === 'entity.issued' || event.type === 'workspace.saved' || COMMAND_TYPES.has(event.type), 'INVALID_EVENT', 'Unsupported production event type.');
        requireValue(event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) && Number.isFinite(Date.parse(event.occurredAt)), 'INVALID_EVENT', 'Event must contain a payload and valid occurredAt.');
        const hash = fingerprint(event); const old = (await db.query('SELECT fingerprint FROM identity_events WHERE id=$1', [event.id])).rows[0];
        if (old) { requireValue(old.fingerprint === hash, 'EVENT_CONFLICT', 'Event ID was reused with different data.', 409); acknowledged.push(event.id); continue; }
        const incarnation = (await db.query('SELECT gateway_id,next_event_sequence::text FROM identity_incarnations WHERE id=$1 FOR UPDATE', [event.incarnationId])).rows[0];
        requireValue(incarnation && incarnation.gateway_id === gatewayId, 'UNKNOWN_INCARNATION', 'Event incarnation is not registered for this gateway.', 409);
        requireValue(incarnation.next_event_sequence === event.sequence, 'EVENT_SEQUENCE_GAP', 'Synchronize earlier events before this event.', 409);
        if (event.type === 'entity.issued') {
          const reservation = (await db.query(`SELECT r.*,l.origin_line_key,l.base::text FROM identity_reservations r JOIN identity_lines l ON l.id=r.line_id WHERE r.id=$1`, [uuid(event.payload.reservationId, 'reservationId')])).rows[0];
          requireValue(reservation && reservation.gateway_id === gatewayId && reservation.incarnation_id === event.incarnationId, 'INVALID_RESERVATION', 'Issuance must belong to this gateway incarnation reservation.', 409);
          const entity = event.payload.entity; requireValue(entity && typeof entity === 'object', 'INVALID_ENTITY', 'Issuance must include its object.');
          uuid(entity.id, 'entity.id'); decimal(entity.instance, 'instance'); kind(entity.kind);
          const instance = BigInt(entity.instance);
          requireValue(entity.kind === reservation.kind && entity.originLineKey === reservation.origin_line_key && instance >= BigInt(reservation.range_start) && instance <= BigInt(reservation.range_end) && entity.code === barcode(entity.kind, reservation.base, entity.instance), 'INVALID_RESERVED_NUMBER', 'Object does not match its reserved line, kind and range.', 409);
          requireValue(Number.isFinite(Date.parse(entity.createdAt)), 'INVALID_ENTITY', 'Object createdAt is invalid.');
          await this.insertEntity(db, entity, reservation.line_id);
        } else if(event.type==='workspace.saved') {
          requireValue(event.payload.changes && typeof event.payload.changes==='object','INVALID_WORKSPACE','Invalid gateway workspace.');
          await db.query('INSERT INTO identity_workspaces(gateway_id,revision,data) VALUES($1,$2,$3::jsonb) ON CONFLICT(gateway_id) DO UPDATE SET revision=excluded.revision,data=identity_workspaces.data || excluded.data',[gatewayId,decimal(event.payload.revision,'revision'),JSON.stringify(event.payload.changes)]);
        } else await this.applyCommand(db, event);
        await db.query('INSERT INTO identity_events(id,gateway_id,incarnation_id,sequence,type,payload,fingerprint,occurred_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8)', [event.id, gatewayId, event.incarnationId, event.sequence, event.type, JSON.stringify(event.payload), hash, event.occurredAt]);
        requireValue(BigInt(event.sequence) < MAX_COUNTER, 'COUNTER_EXHAUSTED', 'Event sequence exhausted.', 409);
        await db.query('UPDATE identity_incarnations SET next_event_sequence=$2 WHERE id=$1', [event.incarnationId, (BigInt(event.sequence) + 1n).toString()]);
        acknowledged.push(event.id);
      }
      return { acknowledged };
    });
  }
}
