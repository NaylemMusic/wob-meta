// Measures every fighter of one game version. Runs INSIDE Docker (--network none): it executes the game's own code.
// usage: node scripts/extract.mjs <commit> [charId ...]   → writes JSON to stdout
// Method (same as the original guide): stats and normals are read from the fighter definitions; the KO % of each
// normal is found by simulation: the move's strongest hit lands on MISTER Y (weight 98) standing in the middle of the
// training room, no DI, and we search the lowest % at which he is knocked out.
import './shim.mjs';

const [commit, ...only] = process.argv.slice(2);
const base = `../cache/${commit}/src/sim/`;
const { CHARS, CHAR_ORDER } = await import(base + 'chars/index.js');
const { World } = await import(base + 'world.js');

const REF = 'mistery';
const NORMALS = ['jab1', 'ftilt', 'utilt', 'dtilt', 'smash', 'usmash', 'dsmash', 'dashattack', 'nair', 'fair', 'bair', 'uair', 'dair'];
const MAX_P = 400;

// the hit of a move that sends the farthest at 100 % (sweetspot over sourspot)
const strongest = (hits) => hits.reduce((b, h, i) => {
  const s = ((10 + (100 * h.dmg) / 20) + 18) * ((h.kbg ?? 100) / 100) + (h.kbb ?? 0);
  return s > b.s ? { h, i, s } : b;
}, { s: -1 });

// hits starting on the same frame are alternatives (sweet/sour spots): keep the best; separate frames add up
function totalDamage(hits) {
  const byFrame = new Map();
  for (const h of hits) byFrame.set(h.f[0], Math.max(byFrame.get(h.f[0]) || 0, h.dmg || 0));
  return Math.round([...byFrame.values()].reduce((a, b) => a + b, 0) * 10) / 10;
}

function knocksOut(charId, M, h, i, p) {
  const W = new World({ stage: 'training', roster: [{ slot: 0, char: charId }, { slot: 1, char: REF }], rules: { mode: 'stock', stocks: 3, minigames: false, ult: false, hazards: false }, seed: 1 });
  W.phase = 'play';
  const A = W.fighters[0], V = W.fighters[1];
  const m = W.stage.main();
  V.x = m.cx; A.x = m.cx - 1; A.z = V.z = 0;
  A.facing = Math.PI / 2; // toward +x, the victim's side
  A.mv = { charge: 0 }; A.move = 'measure';
  V.damage = p;
  const hv = W.moveHitVolume(A, M, h, i);
  hv.x = V.x; hv.y = V.y + 1; hv.z = V.z;
  W.applyHit(hv, V);
  for (let t = 0; t < 420; t++) {
    W.step({});
    // only the launch itself counts: out by the side or the top (an idle victim falling off the bottom later is not a KO)
    const ko = W.events.find((e) => e.type === 'ko' && e.s === V.slot);
    if (ko) return ko.kind === 'side' || ko.kind === 'top';
  }
  return false;
}

function koPercent(charId, M) {
  const hits = (M.hits || []).filter((h) => h.dmg > 0 && !h.effect && !h.noLaunch && !h.noFlinch);
  if (!hits.length) return null;
  const { h, i } = strongest(hits);
  if (!knocksOut(charId, M, h, i, MAX_P)) return null;
  let lo = 0, hi = MAX_P; // lowest p that kills, to the unit
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (knocksOut(charId, M, h, i, mid)) hi = mid; else lo = mid; }
  return hi;
}

const out = { commit, measuredAt: new Date().toISOString(), reference: REF, chars: {} };
for (const id of only.length ? only : CHAR_ORDER) {
  const C = CHARS[id];
  const stats = Object.fromEntries(Object.entries(C.stats || {}).filter(([, v]) => typeof v === 'number'));
  const moves = {};
  for (const k of NORMALS) {
    const M = C.moves && C.moves[k];
    if (!M || !M.hits || !M.hits.length) continue;
    const hits = M.hits.filter((h) => h.f);
    moves[k] = {
      startup: Math.min(...hits.map((h) => h.f[0])),
      dur: M.dur ?? null, iasa: M.iasa ?? null, landLag: M.landLag ?? M.landing ?? null,
      dmg: totalDamage(hits),
      ko: koPercent(id, M),
      meteor: hits.some((h) => h.spike || (h.ang ?? 0) < 0) || undefined,
    };
  }
  out.chars[id] = { name: C.name, title: C.title, color: C.color, arch: C.arch, stats, moves };
  process.stderr.write(id + ' ');
}
process.stdout.write(JSON.stringify(out));
