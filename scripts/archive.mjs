// Keeps the old guides when they are rewritten, so a fighter's past movesets are never lost.
// usage: node scripts/archive.mjs <old guides.json>   (e.g. `git show HEAD~1:data/guides.json > old.json`)
//   compares it with data/guides.json; each fighter whose guide changed gets its old one added to data/guides-history.json
//   { id: [ { version, until, archivedAt, names, guide }, … newest first ] }
//   version: the game version the old guide was written for; until: the version the new one is written for;
//   names: the in-game names of its specials at that version (from data/<version>.json, when it is there)
import fs from 'node:fs';

// pure: the history after archiving `oldG` replaced by `newG`
export function archive(history, oldG, newG, namesOf = () => null, now = new Date().toISOString()) {
  const out = { ...history };
  for (const id of Object.keys(oldG)) {
    if (id.startsWith('_') || !newG[id]) continue;
    if (JSON.stringify(oldG[id]) === JSON.stringify(newG[id])) continue;
    const list = out[id] ? [...out[id]] : [];
    if (list.some((e) => e.version === oldG._version && JSON.stringify(e.guide) === JSON.stringify(oldG[id]))) continue; // already kept
    list.unshift({ version: oldG._version || null, until: newG._version || null, archivedAt: now, names: namesOf(oldG._version, id), guide: oldG[id] });
    out[id] = list;
  }
  return out;
}

if ((process.argv[1] || '').endsWith('archive.mjs')) {
  const oldG = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const newG = JSON.parse(fs.readFileSync('data/guides.json', 'utf8'));
  const H = 'data/guides-history.json';
  const history = fs.existsSync(H) ? JSON.parse(fs.readFileSync(H, 'utf8')) : {};
  const namesOf = (version, id) => {
    const f = `data/${version}.json`;
    if (!version || !fs.existsSync(f)) return null;
    const c = JSON.parse(fs.readFileSync(f, 'utf8')).chars[id];
    return c ? c.specialsInfo || null : null;
  };
  const out = archive(history, oldG, newG, namesOf);
  fs.writeFileSync(H, JSON.stringify(out, null, 2) + '\n');
  const n = Object.keys(out).filter((id) => (out[id] || []).length !== (history[id] || []).length);
  console.log('fiches archivées :', n.length, n.join(' '));
}
