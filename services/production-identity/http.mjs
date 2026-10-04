import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { IdentityError, requireValue, string } from './common.mjs';

export function requiredToken(value, name = 'IDENTITY_TOKEN') {
  requireValue(typeof value === 'string' && value.length >= 32, 'TOKEN_REQUIRED', `${name} must contain at least 32 characters.`, 500); return value;
}
export function centralClient(url, token) {
  const base = new URL(url); requireValue(['http:', 'https:'].includes(base.protocol), 'INVALID_URL', 'Central URL must use HTTP or HTTPS.'); requiredToken(token, 'IDENTITY_CENTRAL_TOKEN');
  const request = async (method, path, body) => {
    let response;
    try { response = await fetch(new URL(path, base), { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15000) }); }
    catch { throw new IdentityError(503, 'CENTRAL_UNAVAILABLE', 'Central registry is unavailable. Reserved offline operations remain available.'); }
    let value; try { value = await response.json(); } catch { throw new IdentityError(502, 'INVALID_CENTRAL_RESPONSE', 'Central registry returned an invalid response.'); }
    if (!response.ok) throw new IdentityError(response.status, value.error?.code || 'CENTRAL_ERROR', value.error?.message || 'Central registry rejected the request.');
    return value;
  };
  return { registerGateway: body => request('POST', '/v1/gateways/register', body), createLine: body => request('POST', '/v1/lines', body),
    reserve: body => request('POST', '/v1/reservations', body), releaseJobs: body => request('POST', '/v1/jobs', body), jobs: gatewayId => request('GET', `/v1/jobs?gatewayId=${encodeURIComponent(gatewayId)}`),
    ingest: body => request('POST', '/v1/events', body), importLegacy: body => request('POST', '/v1/legacy', body), importRegistry: body => request('POST', '/v1/import-registry', body), lookup: code => request('GET', `/v1/lookup/${encodeURIComponent(code)}`) };
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff': 'font/woff', '.woff2': 'font/woff2' };
async function staticFile(root, pathname, res) {
  const relative = decodeURIComponent(pathname.slice('/erp/'.length) || 'index.html');
  requireValue(!relative.split(/[\\/]/).some(part => part.startsWith('.')) && !relative.includes('\0'), 'NOT_FOUND', 'File not found.', 404);
  const rootPath = await realpath(root); const filePath = await realpath(resolve(rootPath, relative)).catch(() => null);
  requireValue(filePath && filePath.startsWith(rootPath + sep) && MIME[extname(filePath)], 'NOT_FOUND', 'File not found.', 404);
  const content = await readFile(filePath); res.writeHead(200, { 'content-type': MIME[extname(filePath)], 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(content);
}
async function jsonBody(req) {
  requireValue(req.headers['content-type']?.split(';')[0].trim() === 'application/json', 'CONTENT_TYPE_REQUIRED', 'Request content type must be application/json.', 415);
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; requireValue(size <= 16 * 1024 * 1024, 'BODY_TOO_LARGE', 'Request exceeds the 16 MB limit.', 413); chunks.push(chunk); }
  let result; try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new IdentityError(400, 'INVALID_JSON', 'Request body must be valid JSON.'); }
  requireValue(result && typeof result === 'object' && !Array.isArray(result), 'INVALID_JSON', 'Request body must be a JSON object.'); return result;
}
function tokenMatches(header, token) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const candidate = Buffer.from(header.slice(7)); const expected = Buffer.from(token);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
export function identityServer({ store, role, token, allowedOrigins = [], erpRoot = null }) {
  requiredToken(token);
  const send = (res, status, value) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(value)); };
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const origin = req.headers.origin;
      if (origin) {
        const sameOrigin = origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
        requireValue(sameOrigin || allowedOrigins.includes(origin), 'ORIGIN_DENIED', 'This browser origin is not permitted.', 403);
        res.setHeader('access-control-allow-origin', origin); res.setHeader('vary', 'Origin');
      }
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-max-age': '600' }); res.end(); return; }
      if (req.method === 'GET' && url.pathname === '/health') { send(res, 200, { status: 'ok', role }); return; }
      if (erpRoot && req.method === 'GET' && url.pathname.startsWith('/erp/')) { await staticFile(erpRoot, url.pathname, res); return; }
      requireValue(tokenMatches(req.headers.authorization, token), 'UNAUTHORIZED', 'A valid service bearer token is required.', 401);
      const route = `${req.method} ${url.pathname}`;
      let result;
      if (route === 'POST /v1/lines') result = await store.createLine(await jsonBody(req));
      else if (route === 'POST /v1/issue') result = await store.issue(await jsonBody(req));
      else if (route === 'POST /v1/legacy') result = await store.importLegacy(await jsonBody(req));
      else if (route === 'POST /v1/import-registry') result = await store.importRegistry(await jsonBody(req));
      else if (req.method === 'GET' && url.pathname.startsWith('/v1/lookup/')) result = await store.lookup(decodeURIComponent(url.pathname.slice('/v1/lookup/'.length)));
      else if (route === 'GET /v1/status') result = role === 'gateway' ? store.status() : { role: 'central', counterType: 'signed-64-bit-decimal', minimumBaseWidth: 10, recoveryRequired: store.recoveryRequired };
      else if (role === 'central' && route === 'POST /v1/gateways/register') result = await store.registerGateway(await jsonBody(req));
      else if (role === 'central' && route === 'POST /v1/reservations') result = await store.reserve(await jsonBody(req));
      else if (role === 'central' && route === 'POST /v1/events') result = await store.ingest(await jsonBody(req));
      else if (role === 'central' && route === 'POST /v1/jobs') result = await store.releaseJobs(await jsonBody(req));
      else if (route === 'GET /v1/jobs') result = role === 'gateway' ? store.jobs() : await store.jobs(url.searchParams.get('gatewayId'));
      else if (role === 'central' && req.method === 'DELETE' && url.pathname.startsWith('/v1/jobs/')) result = await store.revokeJob(decodeURIComponent(url.pathname.slice('/v1/jobs/'.length)));
      else if (role === 'gateway' && route === 'POST /v1/release') result = await store.release(await jsonBody(req));
      else if (role === 'gateway' && route === 'GET /v1/workspace') result = store.workspace();
      else if (role === 'gateway' && route === 'POST /v1/workspace') result = store.saveWorkspace(await jsonBody(req));
      else if (role === 'gateway' && route === 'POST /v1/commands') result = await store.command(await jsonBody(req));
      else if (role === 'gateway' && route === 'POST /v1/sync') { await jsonBody(req); result = await store.sync(); }
      else throw new IdentityError(404, 'NOT_FOUND', 'Endpoint not found.');
      send(res, 200, result);
    } catch (error) {
      if (error.code === '23505' || error.code === 'SQLITE_CONSTRAINT_UNIQUE') send(res, 409, { error: { code: 'IDENTITY_CONFLICT', message: 'Barcode, object or event sequence already exists.' } });
      else if (error instanceof IdentityError) send(res, error.status, { error: { code: error.code, message: error.message } });
      else { console.error('Production identity request failed:', error.message); send(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Identity service could not complete this request.' } }); }
    }
  });
}
