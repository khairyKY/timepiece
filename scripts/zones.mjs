// Builds src/astro/zones.json: IANA zone (and legacy alias) -> [lat, lon], 0.1° precision.
// Build-time only; moment-timezone is a devDependency and never ships. Run: npm run zones
import { readFileSync, writeFileSync } from 'node:fs';

const meta = JSON.parse(readFileSync('node_modules/moment-timezone/data/meta/latest.json', 'utf8'));
const packed = JSON.parse(readFileSync('node_modules/moment-timezone/data/packed/latest.json', 'utf8'));

const r = (n) => Math.round(n * 10) / 10;
const out = {};
for (const [name, z] of Object.entries(meta.zones)) out[name] = [r(z.lat), r(z.long)];
// Chrome/Safari still report legacy IDs (Asia/Calcutta) — resolve links in both directions.
for (const link of packed.links) {
  const [a, b] = link.split('|');
  if (out[a] && !out[b]) out[b] = out[a];
  else if (out[b] && !out[a]) out[a] = out[b];
}
writeFileSync('src/astro/zones.json', JSON.stringify(out));
console.log(`zones.json: ${Object.keys(out).length} entries`);
