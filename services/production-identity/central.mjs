import pg from 'pg';
import { CentralStore } from './central-store.mjs';
import { identityServer, requiredToken } from './http.mjs';

const token = requiredToken(process.env.IDENTITY_TOKEN);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 20 });
const store = new CentralStore(pool, { recoveryRequired: process.env.IDENTITY_RECOVERY_REQUIRED === 'true' });
await store.migrate();
const server = identityServer({ store, role: 'central', token, allowedOrigins: (process.env.IDENTITY_ALLOWED_ORIGINS || '').split(',').filter(Boolean) });
const port = Number(process.env.IDENTITY_PORT || 8781); const host = process.env.IDENTITY_HOST || '127.0.0.1';
server.listen(port, host, () => console.log(`Central production identity service listening on ${host}:${port}`));
let closing = false;
async function close() { if (closing) return; closing = true; server.close(async () => { await pool.end(); process.exit(0); }); }
process.on('SIGTERM', close); process.on('SIGINT', close);
