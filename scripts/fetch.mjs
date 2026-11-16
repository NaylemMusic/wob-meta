// Downloads the game's simulation source for the version currently online.
// worldofbagarre.com serves its code from /v/<commit>/src/: the commit is the version, it changes with every patch.
// usage: node scripts/fetch.mjs [entry ...]   → prints the commit, mirrors the files into cache/<commit>/
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://worldofbagarre.com/';
const entries = process.argv.slice(2).length ? process.argv.slice(2) : ['src/sim/chars/index.js', 'src/sim/world.js'];

// a network hiccup (reset, timeout, 5xx) is retried a few times before giving up (16 nov. 2026 : deux échecs isolés)
async function get(url, opts = {}) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(20000) });
      if (r.status < 500 || i >= 2) return r;
    } catch (e) { if (i >= 2) throw e; }
    await new Promise((ok) => setTimeout(ok, 5000 * (i + 1)));
  }
}

// the site itself unreachable: print nothing and stop quietly, the workflow skips this run (the next one, 10 min later, retries)
let html;
try { html = await (await get(SITE, { cache: 'no-store' })).text(); } catch (e) { console.error('site injoignable :', e.message); process.exit(0); }
// WOB_COMMIT=<commit> fetches an older version instead (the site keeps serving them): to measure a version a run missed
const commit = process.env.WOB_COMMIT || (html.match(/v\/([0-9a-f]{7,40})\/src\/main\.js/) || [])[1];
if (!commit) throw new Error('version introuvable sur ' + SITE);
const base = `${SITE}v/${commit}/`;
const out = path.join('cache', commit);

const seen = new Set();
const queue = [...entries];
while (queue.length) {
  const f = queue.pop();
  if (seen.has(f)) continue;
  seen.add(f);
  const dest = path.join(out, f);
  let txt;
  if (fs.existsSync(dest)) txt = fs.readFileSync(dest, 'utf8');
  else {
    const r = await get(base + f);
    if (!r.ok) { console.error('MANQUANT', f, r.status); continue; }
    txt = await r.text();
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, txt);
  }
  // static + side-effect + dynamic relative imports
  for (const m of txt.matchAll(/(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\s*['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
    queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1] || m[2] || m[3])));
  }
}
fs.writeFileSync(path.join(out, 'package.json'), '{"type":"module"}');
console.log(commit);
