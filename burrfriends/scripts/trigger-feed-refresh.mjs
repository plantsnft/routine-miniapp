#!/usr/bin/env node
/**
 * One-off: trigger production cron to refresh burrfriends feed cache.
 * Reads CRON_SECRET from .env.local. Run from repo root: node scripts/trigger-feed-refresh.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const envPath = join(root, '.env.local');

if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    if (key !== 'CRON_SECRET') continue;
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    process.env.CRON_SECRET = val;
    break;
  }
}

const CRON_SECRET = process.env.CRON_SECRET;
const URL = 'https://burrfriends.vercel.app/api/cron/refresh-burrfriends-feed';

if (!CRON_SECRET) {
  console.error('CRON_SECRET not set in .env.local. Add it (same value as in Vercel) or trigger via Admin: POST /api/admin/refresh-burrfriends-feed while logged in.');
  process.exit(1);
}

const res = await fetch(URL, {
  method: 'GET',
  headers: { Authorization: `Bearer ${CRON_SECRET}` },
});
const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('Request failed:', res.status, data);
  process.exit(1);
}
console.log('Feed refresh triggered:', data);
