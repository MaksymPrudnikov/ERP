import { createHash, randomUUID } from 'node:crypto';

export const MAX_COUNTER = 9223372036854775807n;
export const RESERVE_BUDGET = 30000;
export const COMMAND_TYPES = new Set(['scan.recorded', 'assembly.completed', 'entity.broken', 'entity.reassigned', 'entity.cancelled']);

export class IdentityError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function requireValue(condition, code, message, status = 400) {
  if (!condition) throw new IdentityError(status, code, message);
}
export function uuid(value, field = 'requestId') {
  requireValue(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value), 'INVALID_UUID', `${field} must be a UUID.`);
  return value.toLowerCase();
}
export function string(value, field, max = 256) {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= max, 'INVALID_FIELD', `${field} must be a non-empty string of at most ${max} characters.`);
  return value;
}
export function requestKey(value) { return string(value, 'requestId', 512); }
export function lineKey(value) { return string(value, 'originLineKey', 512); }
export function kind(value) { requireValue(value === 'G' || value === 'U', 'INVALID_KIND', 'kind must be G or U.'); return value; }
export function count(value, limit = RESERVE_BUDGET) {
  requireValue(Number.isSafeInteger(value) && value > 0 && value <= limit, 'INVALID_COUNT', `count must be an integer between 1 and ${limit}.`);
  return value;
}
export function decimal(value, field = 'counter') {
  requireValue(typeof value === 'string' && /^[1-9][0-9]*$/.test(value) && BigInt(value) <= MAX_COUNTER, 'INVALID_COUNTER', `${field} must be a positive 64-bit decimal string.`);
  return value;
}
export function baseDecimal(value) {
  requireValue(typeof value === 'string' && /^0*[1-9][0-9]*$/.test(value) && BigInt(value) <= MAX_COUNTER, 'INVALID_COUNTER', 'base must be a positive 64-bit decimal string.');
  return BigInt(value).toString().padStart(10, '0');
}
export function barcode(type, base, instance) { return `${kind(type)}-${baseDecimal(base)}-${decimal(instance, 'instance')}`; }
export function canonicalCode(value) { return string(value, 'code', 128).trim().toUpperCase(); }
export function fingerprint(value) {
  const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(key => [key, stable(v[key])])) : v;
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
export function issueRequest(body) {
  const result = { requestId: requestKey(body.requestId), originLineKey: lineKey(body.originLineKey), kind: kind(body.kind), count: count(body.count, 10000) };
  for (const key of ['slots', 'replacesIds', 'componentKeys']) {
    if (body[key] === undefined) continue;
    requireValue(Array.isArray(body[key]) && body[key].length === result.count, 'INVALID_FIELD', `${key} must have one entry per issued object.`);
    result[key] = body[key].map(value => {
      if (value === null) return null;
      if (key === 'replacesIds') return uuid(value, 'replacesId');
      requireValue((typeof value === 'string' && value.length <= 256) || (key === 'slots' && Number.isSafeInteger(value) && value > 0), 'INVALID_FIELD', `${key} contains an invalid value.`);
      return value;
    });
  }
  return result;
}
export function makeEntity(input, base, instance, index, createdAt = new Date().toISOString()) {
  return { id: randomUUID(), kind: input.kind, code: barcode(input.kind, base, instance), originLineKey: input.originLineKey, currentLineKey: input.originLineKey,
    base: baseDecimal(base), instance, createdAt, replacesId: input.replacesIds?.[index] ?? null, slot: input.slots?.[index] ?? null, componentKey: input.componentKeys?.[index] ?? null, state: 'active' };
}
export function entityFromRow(row) {
  return { ...(row.metadata || {}), id: row.id, kind: row.kind, code: row.code, originLineKey: row.origin_line_key, currentLineKey: row.current_line_key,
    base: String(row.base).padStart(10, '0'), instance: row.instance == null ? null : String(row.instance), createdAt: new Date(row.created_at).toISOString(), replacesId: row.replaces_id,
    slot: row.slot, componentKey: row.component_key, state: row.state, legacy: row.legacy };
}
