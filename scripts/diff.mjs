// Compares two measured versions and builds the raw patch note (numbers only).
// usage: node scripts/diff.mjs data/<old>.json data/<new>.json   → appends to data/patchnotes.json, rewrites data/latest.json
import fs from 'node:fs';

// for each number: does a higher value help the fighter (+1), hurt it (-1), or neither (0)?
const BETTER = {
  dmg: +1, startup: -1, range: +1, dur: -1, iasa: -1, landLag: -1, ko: -1, koFull: -1, // ko: a lower % = kills earlier (koFull: smash fully charged)
  weight: +1, runSpeed: +1, walkSpeed: +1, airSpeed: +1, airAccel: +1, groundAccel: +1, jumpVel: +1, airJumpVel: +1, airJumps: +1,
};
const verdict = (key, a, b) => {
  if (key === 'ko' || key === 'koFull') { // null = does not kill
    if (a === null) return b === null ? 0 : 1;
    if (b === null) return -1;
  }
  const s = BETTER[key] ?? 0;
  return s === 0 || a === null || b === null ? 0 : Math.sign((b - a) * s);
};
const same = (a, b) => (a ?? null) === (b ?? null);

export function diff(A, B) {
  const note = { from: A.commit, to: B.commit, date: B.measuredAt, added: [], removed: [], chars: {} };
  for (const id of Object.keys(B.chars)) if (!A.chars[id]) note.added.push(id);
  for (const id of Object.keys(A.chars)) if (!B.chars[id]) note.removed.push(id);
  for (const [id, b] of Object.entries(B.chars)) {
    const a = A.chars[id];
    if (!a) continue;
    const changes = [];
    for (const [k, v] of Object.entries(b.stats)) if (!same(a.stats[k], v)) changes.push({ what: 'stats', key: k, old: a.stats[k] ?? null, new: v, v: verdict(k, a.stats[k] ?? null, v) });
    for (const mv of new Set([...Object.keys(a.moves), ...Object.keys(b.moves)])) {
      const ma = a.moves[mv] || {}, mb = b.moves[mv] || {};
      for (const k of ['startup', 'dmg', 'ko', 'koFull', 'iasa', 'dur', 'landLag']) {
        if (k === 'koFull' && (ma[k] === undefined || mb[k] === undefined)) continue; // measured since 12 Nov: no fake change against older files
        if (!same(ma[k], mb[k])) changes.push({ what: mv, key: k, old: ma[k] ?? null, new: mb[k] ?? null, v: verdict(k, ma[k] ?? null, mb[k] ?? null) });
      }
    }
    for (const sp of new Set([...Object.keys(a.specials || {}), ...Object.keys(b.specials || {})])) {
      const sa = (a.specials || {})[sp] || {}, sb = (b.specials || {})[sp] || {};
      for (const k of ['startup', 'dmg', 'ko', 'range', 'iasa', 'dur']) {
        if (!same(sa[k], sb[k])) changes.push({ what: sp, key: k, old: sa[k] ?? null, new: sb[k] ?? null, v: verdict(k, sa[k] ?? null, sb[k] ?? null) });
      }
      const ra = (sa.recovery || {}).up ?? null, rb = (sb.recovery || {}).up ?? null;
      if (!same(ra, rb)) changes.push({ what: sp, key: 'recovery', old: ra, new: rb, v: verdict('range', ra, rb) }); // higher = better
    }
    // texts (names of the specials, passive "p", ultimate, the creator's description): shown as they are, no verdict
    const ia = a.specialsInfo || {}, ib = b.specialsInfo || {};
    for (const k of new Set([...Object.keys(ia), ...Object.keys(ib)])) if (!same(ia[k], ib[k])) changes.push({ what: 'texte', key: k === 'p' ? 'passif' : 'sp_' + k, old: ia[k] ?? null, new: ib[k] ?? null, v: 0 });
    for (const k of ['name', 'sub']) if (!same((a.ult || {})[k], (b.ult || {})[k])) changes.push({ what: 'ultime', key: k, old: (a.ult || {})[k] ?? null, new: (b.ult || {})[k] ?? null, v: 0 });
    if (!same((a.ult || {}).dmg, (b.ult || {}).dmg)) changes.push({ what: 'ultime', key: 'dmg', old: (a.ult || {}).dmg ?? null, new: (b.ult || {}).dmg ?? null, v: verdict('dmg', (a.ult || {}).dmg ?? null, (b.ult || {}).dmg ?? null) });
    if (!same(a.about, b.about) && a.about !== undefined) changes.push({ what: 'texte', key: 'description', old: a.about ?? null, new: b.about ?? null, v: 0 });
    if (changes.length) {
      const score = changes.reduce((s, c) => s + c.v, 0);
      note.chars[id] = { name: b.name, verdict: score > 0 ? 'buff' : score < 0 ? 'nerf' : 'ajusté', changes };
    }
  }
  return note;
}

if ((process.argv[1] || '').endsWith('diff.mjs')) { // run as a script (not imported)
  const [oldF, newF] = process.argv.slice(2);
  const B = JSON.parse(fs.readFileSync(newF, 'utf8'));
  const notes = fs.existsSync('data/patchnotes.json') ? JSON.parse(fs.readFileSync('data/patchnotes.json', 'utf8')) : [];
  if (oldF && fs.existsSync(oldF)) {
    const n = diff(JSON.parse(fs.readFileSync(oldF, 'utf8')), B);
    // every new version gets a note, even with no stat change: the official Discord text needs one to attach to
    if (n.from !== n.to && !notes.some((x) => x.to === n.to)) notes.unshift(n); // newest first
  }
  fs.writeFileSync('data/patchnotes.json', JSON.stringify(notes));
  fs.writeFileSync('data/latest.json', JSON.stringify({ commit: B.commit, measuredAt: B.measuredAt, file: `${B.commit}.json` }));
  console.log('patch notes:', notes.length, '| latest:', B.commit);
}
