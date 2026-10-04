import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { IdentityError, MAX_COUNTER, RESERVE_BUDGET, COMMAND_TYPES, requireValue, uuid, string, requestKey, lineKey, kind, count, baseDecimal, canonicalCode, fingerprint, issueRequest, makeEntity } from './common.mjs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT OR IGNORE INTO meta VALUES('nextEventSequence','1');
CREATE TABLE IF NOT EXISTS lines(origin_line_key TEXT PRIMARY KEY,base TEXT NOT NULL UNIQUE,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,origin_line_key TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reservations(id TEXT PRIMARY KEY,origin_line_key TEXT NOT NULL,kind TEXT NOT NULL,incarnation_id TEXT NOT NULL,next_instance TEXT NOT NULL,range_end TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS entities(id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,origin_line_key TEXT NOT NULL,kind TEXT NOT NULL,instance TEXT,data TEXT NOT NULL,UNIQUE(origin_line_key,kind,instance));
CREATE TABLE IF NOT EXISTS registry(code TEXT PRIMARY KEY,entity_id TEXT NOT NULL REFERENCES entities(id));
CREATE TABLE IF NOT EXISTS composition(glass_id TEXT NOT NULL REFERENCES entities(id),unit_id TEXT NOT NULL REFERENCES entities(id),PRIMARY KEY(glass_id,unit_id));
CREATE TABLE IF NOT EXISTS requests(request_id TEXT PRIMARY KEY,operation TEXT NOT NULL,fingerprint TEXT NOT NULL,result TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,sequence TEXT NOT NULL UNIQUE,incarnation_id TEXT NOT NULL,data TEXT NOT NULL,acknowledged INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS reservation_lookup ON reservations(origin_line_key,kind,incarnation_id);
`;

/** SQLite is the LAN authority. The second DB holds an OS-released exclusive owner lock. */
export class GatewayStore {
  constructor({ path, gatewayId, central, now = () => new Date().toISOString() }) {
    this.gatewayId = string(gatewayId, 'gatewayId', 128); this.central = central; this.now = now;
    this.incarnationId = randomUUID(); this.reconciled = false; this.reconcilePromise = null; this.syncPromise = null;
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      this.owner = new DatabaseSync(`${path}.owner.sqlite`);
      try { this.owner.exec('PRAGMA busy_timeout=0; CREATE TABLE IF NOT EXISTS owner(id INTEGER PRIMARY KEY); BEGIN EXCLUSIVE'); } catch { this.owner.close(); throw new IdentityError(409, 'GATEWAY_ALREADY_RUNNING', 'A gateway process already owns this database.'); }
      chmodSync(`${path}.owner.sqlite`, 0o600);
    }
    this.db = new DatabaseSync(path); this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;'); this.db.exec(SCHEMA);
    if (path !== ':memory:') chmodSync(path, 0o600);
    // A restart or restored backup must never resume any old reserved range.
    this.db.prepare(`INSERT INTO meta(key,value) VALUES('incarnationId',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(this.incarnationId);
  }
  close() {
    this.reconciled = false;
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); this.db.close();
    if (this.owner) { this.owner.exec('ROLLBACK'); this.owner.close(); }
  }
  transaction(action) {
    if(this.inTransaction)return action();
    this.inTransaction=true;
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
    finally { this.inTransaction=false; }
  }
  idempotent(operation, input, action) {
    const hash = fingerprint(input);
    return this.transaction(() => {
      const previous = this.db.prepare('SELECT * FROM requests WHERE request_id=?').get(input.requestId);
      if (previous) { requireValue(previous.operation === operation && previous.fingerprint === hash, 'IDEMPOTENCY_CONFLICT', 'requestId was already used for a different request.', 409); return JSON.parse(previous.result); }
      const result = action();
      this.db.prepare('INSERT INTO requests(request_id,operation,fingerprint,result) VALUES(?,?,?,?)').run(input.requestId, operation, hash, JSON.stringify(result));
      return result;
    });
  }
  enqueue(type, payload) {
    const sequence = this.db.prepare(`SELECT value FROM meta WHERE key='nextEventSequence'`).get().value;
    requireValue(BigInt(sequence) < MAX_COUNTER, 'COUNTER_EXHAUSTED', 'Production event sequence exhausted.', 409);
    const event = { id: randomUUID(), incarnationId: this.incarnationId, sequence, type, payload, occurredAt: this.now() };
    this.db.prepare(`UPDATE meta SET value=? WHERE key='nextEventSequence'`).run((BigInt(sequence) + 1n).toString());
    this.db.prepare('INSERT INTO outbox(id,sequence,incarnation_id,data) VALUES(?,?,?,?)').run(event.id, sequence, this.incarnationId, JSON.stringify(event));
    return event;
  }
  async reconcile() {
    if (this.reconciled) return { reconciled: true };
    if (this.reconcilePromise) return this.reconcilePromise;
    const operation = async () => {
      const startSequence = this.db.prepare(`SELECT value FROM meta WHERE key='nextEventSequence'`).get().value;
      const result = await this.central.registerGateway({ gatewayId: this.gatewayId, incarnationId: this.incarnationId, startSequence });
      requireValue(result.reconciled && result.incarnationId === this.incarnationId, 'RECONCILIATION_REQUIRED', 'Central registry did not confirm this gateway incarnation.', 409);
      this.reconciled = true; return result;
    };
    this.reconcilePromise = operation();
    try { return await this.reconcilePromise; } finally { this.reconcilePromise = null; }
  }
  saveLine(line) {
    const value = { ...line, originLineKey: lineKey(line.originLineKey), base: baseDecimal(line.base) };
    const old = this.db.prepare('SELECT base FROM lines WHERE origin_line_key=?').get(value.originLineKey);
    requireValue(!old || old.base === value.base, 'LINE_BASE_CONFLICT', 'Central line base differs from the durable local registry.', 409);
    this.db.prepare('INSERT INTO lines(origin_line_key,base,data) VALUES(?,?,?) ON CONFLICT(origin_line_key) DO UPDATE SET data=excluded.data').run(value.originLineKey, value.base, JSON.stringify(value));
    return value;
  }
  getLine(originLineKey) {
    const row = this.db.prepare('SELECT data FROM lines WHERE origin_line_key=?').get(lineKey(originLineKey));
    requireValue(row, 'LINE_NOT_RELEASED', 'Order line is not available in the local registry.', 404); return JSON.parse(row.data);
  }
  async createLine(body) {
    const input = { requestId: requestKey(body.requestId), originLineKey: lineKey(body.originLineKey) };
    const old = this.db.prepare('SELECT data FROM lines WHERE origin_line_key=?').get(input.originLineKey);
    if (old) return JSON.parse(old.data);
    const line = await this.central.createLine(input);
    return this.transaction(() => this.saveLine(line));
  }
  async release(body) {
    const input = { requestId: requestKey(body.requestId), jobs: body.jobs, jobIds: body.jobIds, reserveBudget: body.reserveBudget ?? RESERVE_BUDGET };
    count(input.reserveBudget, RESERVE_BUDGET);
    const previous = this.db.prepare('SELECT * FROM requests WHERE request_id=?').get(input.requestId);
    if (previous) {
      requireValue(previous.operation === 'release' && previous.fingerprint === fingerprint(input), 'IDEMPOTENCY_CONFLICT', 'requestId was already used for a different release.', 409);
      const result = JSON.parse(previous.result);
      requireValue(result.reservations.every(range => range.incarnationId === this.incarnationId), 'RELEASE_RESTARTED', 'Gateway restarted after this release. Retry with a new release requestId.', 409);
      return result;
    }
    await this.reconcile();
    if (input.jobs) await this.central.releaseJobs({ requestId: input.requestId, gatewayId: this.gatewayId, jobs: input.jobs });
    const released = (await this.central.jobs(this.gatewayId)).jobs;
    const ids = input.jobIds || (input.jobs ? input.jobs.map(job => job.id) : null);
    const selected = ids ? released.filter(job => ids.includes(job.id)) : released;
    requireValue(!ids || selected.length === new Set(ids).size, 'JOB_NOT_RELEASED', 'A requested job was not released to this gateway.', 409);
    requireValue(selected.length > 0, 'NO_RELEASED_JOBS', 'No released production jobs are available.', 409);
    const groups = new Map();
    for (const job of selected) {
      lineKey(job.originLineKey); kind(job.kind); count(job.count, 10000000);
      const key = `${job.originLineKey}\u0000${job.kind}`;
      const group = groups.get(key) || { originLineKey: job.originLineKey, base: baseDecimal(job.base), kind: job.kind, weight: 0, explicit: 0, jobs: [] };
      group.weight += job.count; group.explicit += job.reserveCount || 0; group.jobs.push(job); groups.set(key, group);
    }
    const list = [...groups.values()];
    requireValue(list.length <= input.reserveBudget, 'RESERVE_TOO_SMALL', 'Reservation budget must provide at least one number for each active line and kind.');
    const explicitTotal = list.reduce((total, group) => total + group.explicit, 0);
    requireValue(explicitTotal <= input.reserveBudget, 'RESERVE_TOO_SMALL', 'Explicit job reservations exceed the reservation budget.');
    const unassigned = list.filter(group => !group.explicit);
    requireValue(explicitTotal+unassigned.length<=input.reserveBudget,'RESERVE_TOO_SMALL','Reservation budget must cover every line and kind.'); const totalWeight = unassigned.reduce((total, group) => total + group.weight, 0);
    let available = input.reserveBudget - explicitTotal; let weightLeft = totalWeight;
    const ranges = [];
    for (let index = 0; index < list.length; index++) {
      const group = list[index];
      let amount = group.explicit;
      if (!amount) {
        const later = unassigned.filter(candidate => list.indexOf(candidate) > index).length;
        amount = Math.max(1, Math.min(available - later, Math.floor(available * group.weight / weightLeft)));
        available -= amount; weightLeft -= group.weight;
      }
      // Stable UUID per request and group is stored before contacting central. A interrupted retry cannot reserve another range.
      const metaKey = `reservationRequest:${input.requestId}:${group.originLineKey}:${group.kind}`;
      let reservationRequest = this.db.prepare('SELECT value FROM meta WHERE key=?').get(metaKey)?.value;
      if (!reservationRequest) { reservationRequest = randomUUID(); this.transaction(() => this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(metaKey, reservationRequest)); }
      const reservation = await this.central.reserve({ requestId: reservationRequest, gatewayId: this.gatewayId, incarnationId: this.incarnationId, originLineKey: group.originLineKey, kind: group.kind, count: amount });
      // A partially completed release retry after restart may retrieve a retired range; it is never reactivated.
      requireValue(reservation.incarnationId === this.incarnationId, 'RELEASE_RESTARTED', 'Gateway restarted during this release. Retry with a new release requestId.', 409);
      this.transaction(() => {
        this.saveLine({ originLineKey: group.originLineKey, base: group.base });
        this.db.prepare('INSERT OR IGNORE INTO reservations(id,origin_line_key,kind,incarnation_id,next_instance,range_end,data,created_at) VALUES(?,?,?,?,?,?,?,?)').run(reservation.id, group.originLineKey, group.kind, this.incarnationId, reservation.start, reservation.end, JSON.stringify(reservation), this.now());
        for (const job of group.jobs) this.db.prepare('INSERT INTO jobs(id,origin_line_key,kind,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET origin_line_key=excluded.origin_line_key,kind=excluded.kind,data=excluded.data').run(job.id, job.originLineKey, job.kind, JSON.stringify(job));
      });
      ranges.push(reservation);
    }
    const result = { jobs: selected, reservations: ranges, reservedCount: ranges.reduce((sum, range) => sum + Number(BigInt(range.end) - BigInt(range.start) + 1n), 0) };
    return this.idempotent('release', input, () => result);
  }
  jobs() { return { jobs: this.db.prepare('SELECT data FROM jobs ORDER BY id').all().map(row => JSON.parse(row.data)) }; }
  putEntity(entity, aliases = []) {
    const existing = this.db.prepare('SELECT data FROM entities WHERE id=?').get(entity.id);
    if (existing) {
      const old = JSON.parse(existing.data);
      if(old.state==='broken'||old.state==='cancelled')entity.state=old.state;
      requireValue(old.code === entity.code && old.originLineKey === entity.originLineKey && old.kind === entity.kind && old.instance === entity.instance, 'ENTITY_CONFLICT', 'Object identity cannot change.', 409);
    }
    this.db.prepare(`INSERT INTO entities(id,code,origin_line_key,kind,instance,data) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(entity.id, entity.code, entity.originLineKey, entity.kind, entity.instance, JSON.stringify(entity));
    for (const code of [entity.code, ...aliases]) {
      const normalized = canonicalCode(code); const old = this.db.prepare('SELECT entity_id FROM registry WHERE code=?').get(normalized);
      requireValue(!old || old.entity_id === entity.id, 'BARCODE_CONFLICT', 'Barcode already belongs to another physical object.', 409);
      this.db.prepare('INSERT OR IGNORE INTO registry(code,entity_id) VALUES(?,?)').run(normalized, entity.id);
    }
  }
  issue(body) {
    const input = issueRequest(body);
    return this.idempotent('issue', input, () => {
      requireValue(this.reconciled, 'RECONCILIATION_REQUIRED', 'Gateway restart requires online reconciliation and fresh reservations before issuing labels.', 409);
      const line = this.getLine(input.originLineKey);
      requireValue(this.db.prepare('SELECT id FROM jobs WHERE origin_line_key=? AND kind=? LIMIT 1').get(input.originLineKey, input.kind), 'JOB_NOT_RELEASED', 'This line and object kind have no released production job.', 409);
      const ranges = this.db.prepare('SELECT * FROM reservations WHERE origin_line_key=? AND kind=? AND incarnation_id=? ORDER BY created_at,id').all(input.originLineKey, input.kind, this.incarnationId)
        .filter(row => BigInt(row.next_instance) <= BigInt(row.range_end));
      const remaining = ranges.reduce((sum, row) => sum + BigInt(row.range_end) - BigInt(row.next_instance) + 1n, 0n);
      requireValue(remaining >= BigInt(input.count), 'RANGE_EXHAUSTED', 'Reserved numbers are exhausted. Existing objects remain available to scan.', 409);
      const entities = []; let rangeIndex = 0;
      for (let i = 0; i < input.count; i++) {
        const row = ranges[rangeIndex]; const entity = makeEntity(input, line.base, row.next_instance, i, this.now());
        if (entity.replacesId) {
          const prior = this.db.prepare('SELECT data FROM entities WHERE id=?').get(entity.replacesId); const value = prior && JSON.parse(prior.data);
          requireValue(value && value.kind === entity.kind && value.originLineKey === entity.originLineKey, 'INVALID_REPLACEMENT', 'Replacement must refer to an existing object of the same origin line and kind.', 409);
        }
        this.putEntity(entity); this.enqueue('entity.issued', { reservationId: row.id, entity }); entities.push(entity);
        row.next_instance = (BigInt(row.next_instance) + 1n).toString();
        this.db.prepare('UPDATE reservations SET next_instance=? WHERE id=?').run(row.next_instance, row.id);
        if (BigInt(row.next_instance) > BigInt(row.range_end)) rangeIndex++;
      }
      return { requestId: input.requestId, line, entities };
    });
  }
  lookup(code) {
    const normalized = canonicalCode(code); const row = this.db.prepare('SELECT e.data FROM registry r JOIN entities e ON e.id=r.entity_id WHERE r.code=?').get(normalized);
    requireValue(row, 'BARCODE_NOT_FOUND', 'No locally registered object has this barcode.', 404);
    const entity = JSON.parse(row.data);
    const composition = this.db.prepare('SELECT glass_id FROM composition WHERE unit_id=? ORDER BY glass_id').all(entity.id).map(item => item.glass_id);
    const events = this.db.prepare('SELECT data FROM outbox ORDER BY CAST(sequence AS INTEGER)').all().map(item => JSON.parse(item.data))
      .filter(event => event.payload.entityId === entity.id || event.payload.unitId === entity.id || event.payload.entity?.id === entity.id || event.payload.glassIds?.includes(entity.id));
    return { entity, scannedCode: normalized, composition, events };
  }
  command(body) {
    const input = { requestId: requestKey(body.requestId), type: body.type, payload: body.payload };
    requireValue(COMMAND_TYPES.has(input.type), 'INVALID_COMMAND', 'Unsupported production command type.');
    requireValue(input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload), 'INVALID_COMMAND', 'Command must contain a payload object.');
    return this.idempotent('command', input, () => {
      requireValue(this.reconciled, 'RECONCILIATION_REQUIRED', 'Gateway must register its new event incarnation before accepting production commands.', 409);
      const p = input.payload;
      if (input.type === 'scan.recorded') this.lookup(p.code);
      else if (input.type === 'assembly.completed') {
        uuid(p.unitId, 'unitId'); const row = this.db.prepare('SELECT data FROM entities WHERE id=?').get(p.unitId); const unit = row && JSON.parse(row.data);
        requireValue(unit && unit.kind === 'U' && unit.state === 'active', 'INVALID_UNIT', 'Assembly requires an active unit.', 409);
        requireValue(Array.isArray(p.glassIds) && p.glassIds.length > 0 && p.glassIds.length <= 100 && new Set(p.glassIds).size === p.glassIds.length, 'INVALID_COMPOSITION', 'Assembly must contain distinct physical glasses.');
        const previous = this.db.prepare('SELECT glass_id FROM composition WHERE unit_id=? ORDER BY glass_id').all(p.unitId).map(value => value.glass_id);
        requireValue(!previous.length || JSON.stringify(previous) === JSON.stringify([...p.glassIds].sort()), 'IMMUTABLE_COMPOSITION', 'A physical unit already has a different composition.', 409);
        for (const id of p.glassIds) {
          uuid(id, 'glassId'); const row = this.db.prepare('SELECT data FROM entities WHERE id=?').get(id); const glass = row && JSON.parse(row.data);
          requireValue(glass && glass.kind === 'G' && glass.state === 'active' && glass.currentLineKey === unit.currentLineKey, 'INVALID_GLASS', 'Assembly glass must be active and belong to the unit current line.', 409);
          const prior = this.db.prepare("SELECT c.unit_id FROM composition c JOIN entities e ON e.id=c.unit_id WHERE c.glass_id=? AND json_extract(e.data,'$.state')='active'").get(id);
          requireValue(!prior || prior.unit_id === unit.id, 'GLASS_ALREADY_ASSEMBLED', 'Glass already belongs to a physical unit.', 409);
          this.db.prepare('INSERT OR IGNORE INTO composition(glass_id,unit_id) VALUES(?,?)').run(id, unit.id);
        }
      } else {
        uuid(p.entityId, 'entityId'); const row = this.db.prepare('SELECT data FROM entities WHERE id=?').get(p.entityId);
        requireValue(row, 'ENTITY_NOT_FOUND', 'Command object is not registered locally.', 409); const entity = JSON.parse(row.data);
        if (input.type === 'entity.reassigned') { this.getLine(p.currentLineKey); entity.currentLineKey = p.currentLineKey; }
        else entity.state = input.type === 'entity.broken' ? 'broken' : 'cancelled';
        this.putEntity(entity);
      }
      return { event: this.enqueue(input.type, input.payload) };
    });
  }
  workspace() {
    const row=this.db.prepare("SELECT value FROM meta WHERE key='workspace'").get();
    return row?JSON.parse(row.value):{revision:'0',data:null};
  }
  saveWorkspace(body) {
    const input={requestId:requestKey(body.requestId),revision:String(body.revision),data:body.data};
    requireValue(input.data && typeof input.data==='object' && input.data.productionIdentity?.authority==='gateway','INVALID_WORKSPACE','A gateway production workspace is required.');
    return this.idempotent('workspace',input,()=>{
      requireValue(this.reconciled,'RECONCILIATION_REQUIRED','Reconcile gateway before saving.',409);
      const prior=this.workspace();
      requireValue(prior.revision===input.revision,'WORKSPACE_CONFLICT','Another terminal saved first. Reload and retry the action.',409);
      const oldEntities=new Map((prior.data?.productionIdentity?.entities||[]).map(e=>[e.id,e]));
      const scans=new Map((prior.data?.stationScan||[]).map(r=>[r.id,JSON.stringify(r)]));
      for(const r of input.data.stationScan||[])if(scans.get(r.id)!==JSON.stringify(r))this.command({requestId:input.requestId+':scan:'+r.id,type:'scan.recorded',payload:{code:r.piece,entityId:r.entityId,record:r}});
      for(const e of input.data.productionIdentity.entities){
        const old=oldEntities.get(e.id);
        const local=this.db.prepare('SELECT data FROM entities WHERE id=?').get(e.id);
        requireValue(local && JSON.parse(local.data).code===e.code,'ENTITY_NOT_REGISTERED','Workspace objects must be issued by this gateway.',409);
        if(e.kind==='U' && e.active!==false && e.componentIds?.length && (!old?.componentIds?.length))this.command({requestId:input.requestId+':assembly:'+e.id,type:'assembly.completed',payload:{unitId:e.id,glassIds:e.componentIds,assemblyId:e.assemblyId}});
        if(e.orderId && e.lineId && old && (old.orderId!==e.orderId || old.lineId!==e.lineId))this.command({requestId:input.requestId+':assign:'+e.id,type:'entity.reassigned',payload:{entityId:e.id,currentLineKey:e.orderId+'|'+e.lineId}});
        if(e.active===false && old?.active!==false)this.command({requestId:input.requestId+':retire:'+e.id,type:e.status==='broken'?'entity.broken':'entity.cancelled',payload:{entityId:e.id,reason:e.retiredReason||''}});
      }
      const revision=(BigInt(prior.revision)+1n).toString();
      const changes=Object.fromEntries(Object.entries(input.data).filter(([key,value])=>JSON.stringify(prior.data?.[key])!==JSON.stringify(value)));
      const event=this.enqueue('workspace.saved',{revision,changes});
      this.db.prepare("INSERT INTO meta(key,value) VALUES('workspace',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({revision,data:input.data}));
      return {revision,eventId:event.id};
    });
  }
  async importLegacy(body) {
    const result = await this.central.importLegacy(body);
    this.transaction(() => {
      for (const value of body.entities) this.putEntity({ ...value, code: canonicalCode(value.code), currentLineKey: value.currentLineKey || value.originLineKey, instance: null, replacesId: value.replacesId ?? null, state: value.state || 'active', legacy: true }, value.aliases || []);
    });
    return result;
  }
  async importRegistry(body) {
    const result = await this.central.importRegistry(body);
    this.transaction(() => {
      for (const value of body.registry.lines) this.saveLine({ originLineKey: value.key || value.originLineKey, base: value.base });
      for (const value of body.registry.entities) this.putEntity({ ...value, code: canonicalCode(value.code), currentLineKey: value.currentLineKey || (value.orderId && value.lineId ? value.orderId+'|'+value.lineId : value.originLineKey),
        instance: value.instance ?? null, replacesId: value.replacesId || null, state: value.status === 'broken' ? 'broken' : value.active === false ? 'cancelled' : 'active' }, value.aliases || []);
      for (const value of body.registry.entities) {
        if (value.kind !== 'U' || !value.componentIds?.length) continue;
        for (const glassId of value.componentIds) {
          const existing = this.db.prepare("SELECT c.unit_id FROM composition c JOIN entities e ON e.id=c.unit_id WHERE c.glass_id=? AND json_extract(e.data,'$.state')='active'").get(glassId);
          requireValue(value.active===false || value.status==='broken' || !existing || existing.unit_id===value.id, 'GLASS_ALREADY_ASSEMBLED', 'Imported glass already belongs to another physical unit.', 409);
          this.db.prepare('INSERT OR IGNORE INTO composition(glass_id,unit_id) VALUES(?,?)').run(glassId, value.id);
        }
      }
    });
    return result;
  }
  async sync() {
    if (this.syncPromise) return this.syncPromise;
    const operation = async () => {
      await this.reconcile(); let acknowledged = 0;
      while (true) {
        const rows = this.db.prepare('SELECT data FROM outbox WHERE acknowledged=0 ORDER BY CAST(sequence AS INTEGER) LIMIT 1000').all();
        if (!rows.length) break;
        const events=[];let bytes=256;for(const row of rows){const size=Buffer.byteLength(row.data);if(events.length && bytes+size>14*1024*1024)break;events.push(JSON.parse(row.data));bytes+=size;} const result = await this.central.ingest({ gatewayId: this.gatewayId, events });
        requireValue(Array.isArray(result.acknowledged) && result.acknowledged.length === events.length && events.every(event => result.acknowledged.includes(event.id)), 'INCOMPLETE_ACK', 'Central did not acknowledge the complete synchronized batch.', 502);
        this.transaction(() => { const update = this.db.prepare('UPDATE outbox SET acknowledged=1 WHERE id=?'); for (const id of result.acknowledged) update.run(id); });
        acknowledged += result.acknowledged.length;
      }
      return { acknowledged, pending: this.pendingCount(), reconciled: this.reconciled };
    };
    this.syncPromise = operation(); try { return await this.syncPromise; } finally { this.syncPromise = null; }
  }
  pendingCount() { return this.db.prepare('SELECT COUNT(*) count FROM outbox WHERE acknowledged=0').get().count; }
  status() {
    const ranges = this.db.prepare('SELECT origin_line_key,kind,next_instance,range_end,incarnation_id FROM reservations ORDER BY origin_line_key,kind').all();
    return { gatewayId: this.gatewayId, incarnationId: this.incarnationId, reconciled: this.reconciled, pendingEvents: this.pendingCount(), reserveBudget: RESERVE_BUDGET,
      reservations: ranges.filter(row => row.incarnation_id === this.incarnationId).map(row => ({ originLineKey: row.origin_line_key, kind: row.kind, remaining: (BigInt(row.range_end) >= BigInt(row.next_instance) ? BigInt(row.range_end) - BigInt(row.next_instance) + 1n : 0n).toString() })) };
  }
}
