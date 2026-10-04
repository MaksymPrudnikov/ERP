import pg from 'pg';
import { CentralStore } from './central-store.mjs';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try { await new CentralStore(pool).migrate(); console.log('Production identity migration applied.'); }
finally { await pool.end(); }
