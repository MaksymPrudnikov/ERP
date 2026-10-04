import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GatewayStore } from './gateway-store.mjs';
import { identityServer, centralClient, requiredToken } from './http.mjs';

const token = requiredToken(process.env.IDENTITY_TOKEN);
const central = centralClient(process.env.IDENTITY_CENTRAL_URL || 'http://127.0.0.1:8781', process.env.IDENTITY_CENTRAL_TOKEN || token);
const store = new GatewayStore({ path: resolve(process.env.IDENTITY_GATEWAY_DB || './var/production-identity/gateway.sqlite'), gatewayId: process.env.IDENTITY_GATEWAY_ID || 'factory-1', central });
const defaultErpRoot = fileURLToPath(new URL('../../src/', import.meta.url));
const server = identityServer({ store, role: 'gateway', token, allowedOrigins: (process.env.IDENTITY_ALLOWED_ORIGINS || '').split(',').filter(Boolean), erpRoot: process.env.IDENTITY_ERP_ROOT ? resolve(process.env.IDENTITY_ERP_ROOT) : defaultErpRoot });
const port = Number(process.env.IDENTITY_PORT || 8782); const host = process.env.IDENTITY_HOST || '127.0.0.1';
server.listen(port, host, () => console.log(`LAN production identity gateway listening on ${host}:${port}; ERP /erp/index.html`));
store.sync().catch(error => console.log(`Gateway requires central reconciliation: ${error.code || 'CENTRAL_UNAVAILABLE'}`));
const interval = setInterval(() => { store.sync().catch(error => { if (error.status !== 503) console.error(`Gateway synchronization paused: ${error.code || 'SYNC_ERROR'}`); }); }, 30000);
interval.unref();
let closing = false;
function close() { if (closing) return; closing = true; clearInterval(interval); server.close(() => { store.close(); process.exit(0); }); }
process.on('SIGTERM', close); process.on('SIGINT', close);
