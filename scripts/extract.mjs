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
const { startMove } = await import(base + 'fighter.js');

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

function knocksOut(charId, M, h, i, p, charge = 0) {
  const W = new World({ stage: 'training', roster: [{ slot: 0, char: charId }, { slot: 1, char: REF }], rules: { mode: 'stock', stocks: 3, minigames: false, ult: false, hazards: false }, seed: 1 });
  W.phase = 'play';
  const A = W.fighters[0], V = W.fighters[1];
  const m = W.stage.main();
  V.x = m.cx; A.x = m.cx - 1; A.z = V.z = 0;
  A.facing = Math.PI / 2; // toward +x, the victim's side
  A.mv = { charge }; A.move = 'measure';
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

// charge: frames of smash charge (0 = tapped; M.charge.max = fully charged)
function koPercent(charId, M, charge = 0) {
  const hits = (M.hits || []).filter((h) => h.dmg > 0 && !h.effect && !h.noLaunch && !h.noFlinch);
  if (!hits.length) return null;
  const { h, i } = strongest(hits);
  if (!knocksOut(charId, M, h, i, MAX_P, charge)) return null;
  let lo = 0, hi = MAX_P; // lowest p that kills, to the unit
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (knocksOut(charId, M, h, i, mid, charge)) hi = mid; else lo = mid; }
  return hi;
}

// ---- specials: they are code (projectiles, traps, summons…), so the fighter really performs them in the sim ----
const SPECIALS = ['sp_n', 'sp_s', 'sp_u', 'sp_d'];
const AIR_AIM = { nair: 'front', fair: 'front', bair: 'back', uair: 'above', dair: 'below' };
const DISTANCES = [1, 2, 3, 4, 6, 9, 13]; // m between attacker and MISTER Y
const WINDOW = 360; // 6 s at 60 fps, like the original guide

// one go: attacker at `d` m, facing MISTER Y (at p %), launches the special once, nothing else pressed for 6 s
// opt.seed: the sim's random seed (LIDRA's die…); opt.hold: frames the special button stays held (charged/held moves);
// opt.air: the attacker starts 3 m up; opt.where: target 'front' (default), 'back', 'above' or 'below' the attacker
function runSpecial(charId, id, d, p, opt = {}) {
  const W = new World({ stage: 'training', roster: [{ slot: 0, char: charId }, { slot: 1, char: REF }], rules: { mode: 'stock', stocks: 3, minigames: false, ult: false, hazards: false }, seed: opt.seed || 1 });
  W.phase = 'play';
  for (let t = 0; t < 40; t++) W.step({}); // land on the floor first
  const A = W.fighters[0], V = W.fighters[1], m = W.stage.main();
  const where = opt.where || 'front';
  V.x = m.cx; A.z = V.z = 0; A.facing = Math.PI / 2;
  A.x = where === 'back' ? m.cx + d : where === 'front' ? m.cx - d : m.cx;
  if (opt.air) { A.y += where === 'below' ? d : 3; A.vx = A.vy = 0; A.grounded = false; }
  if (where === 'above') { V.y = A.y + d; V.vy = 0; V.grounded = false; }
  V.damage = p;
  if (!startMove(A, W, id)) return null;
  let first = null, ko = false;
  for (let t = 0; t < WINDOW; t++) {
    W.step(opt.hold && t < opt.hold ? { 0: { mx: 0, my: 0, held: 2, pressed: 0 } } : {}); // 2 = BTN.X, the special button
    if (first === null && V.damage > p) first = t + 1;
    const e = W.events.find((ev) => ev.type === 'ko' && ev.s === V.slot);
    if (e) { ko = e.kind === 'side' || e.kind === 'top'; break; }
  }
  return { dmg: Math.round((V.damage - p) * 10) / 10, first, ko };
}

function measureSpecial(charId, id, opt = {}) {
  let best = null, range = 0;
  for (const d of DISTANCES) {
    const r = runSpecial(charId, id, d, 0, opt);
    if (!r) return null; // cannot start from here (ground / air)
    if (r.dmg > 0) range = d;
    if (!best || r.dmg > best.dmg) best = { ...r, d };
  }
  if (!best || best.dmg <= 0) return { dmg: 0, startup: null, range: null, ko: null };
  // KO %: at the distance where it hurts most, the lowest % at which the special alone knocks him out
  let ko = null;
  if (runSpecial(charId, id, best.d, MAX_P, opt).ko) {
    let lo = 0, hi = MAX_P;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (runSpecial(charId, id, best.d, mid, opt).ko) hi = mid; else lo = mid; }
    ko = hi;
  }
  const out = { dmg: best.dmg, startup: best.first, range, ko };
  // random moves (LIDRA's die…): the same throw with other seeds gives other damage → keep the spread
  const seeds = [2, 3, 4, 5, 6, 7, 8].map((seed) => (runSpecial(charId, id, best.d, 0, { ...opt, seed }) || {}).dmg ?? 0);
  if (seeds.some((v) => v !== best.dmg)) {
    const all = [best.dmg, ...seeds];
    Object.assign(out, { random: true, dmgMin: Math.min(...all), dmgMax: Math.max(...all), dmgAvg: Math.round(all.reduce((a, b) => a + b, 0) / all.length * 10) / 10 });
  }
  return out;
}

// the best of a plain press and a held press (charged balls, held beams…): flags `held` when holding does more
function measureBest(charId, id, M, opt = {}) {
  const tap = measureSpecial(charId, id, opt);
  const hold = measureSpecial(charId, id, { ...opt, hold: (M.charge && M.charge.max) || 120 });
  return hold && hold.dmg > ((tap && tap.dmg) || 0) ? { ...hold, held: true } : tap;
}

// up B in the air from a standstill, 4 m above the middle of the stage: how high and how far it carries (m)
// a B haut steered with the stick (NYSOS's crow, EPEKTASE's broom, JOLAVERT's rocket) only climbs if the stick is held:
// fly it three ways (stick up, sideways, diagonal) for up to 5 s and keep the best height and the best sideways distance
function measureRecovery(charId) {
  let best = null;
  // the last ones steer down then up: a projectile you bring back onto yourself (JOLAVERT's rocket) launches you upward
  const downUp = (d) => (t) => (t < d ? [0, -1] : [0, 1]);
  // a rocket of his own in flight (JOLAVERT): steer it below him, then up through him, so it launches him upward
  // two U-turns the same way round (it turns at a fixed rate): up, round and down beside him, round again and up through him
  const comeBack = (t, W, A) => {
    const e = W.entities.find((x) => !x.dead && x.owner === A.slot && x.custom === 'jvPK');
    if (!e) return [0, 1];
    const turn = [Math.cos(e.ang2 + Math.PI / 2), Math.sin(e.ang2 + Math.PI / 2)];
    const ph = A.mv.ph || 0, s = Math.sin(e.ang2);
    if (ph === 0) { if (s < -0.98) A.mv.ph = 1; return turn; } // first U-turn: heading down
    if (ph === 1) { if (e.y < A.y + 0.7) A.mv.ph = 2; return [0, -1]; } // straight down to his height
    if (ph === 2) { if (s > 0.98) A.mv.ph = 3; return turn; } // second U-turn: heading up again
    if (Math.abs(A.x - e.x) < 0.6) return [0, 1]; // right under him: straight up (the launch goes the way it flies)
    const d = Math.hypot(A.x - e.x, A.y + 1 - e.y) || 1;
    return [(A.x - e.x) / d, (A.y + 1 - e.y) / d]; // up through him
  };
  for (const [mx, my] of [[0, 0], [0, 1], [1, 0], [0.7, 0.7], [downUp(14)], [downUp(20)], [comeBack]]) {
    const r = flyRecovery(charId, mx, my);
    if (!r) return best;
    best = best ? { up: Math.max(best.up, r.up), side: Math.max(best.side, r.side) } : r;
  }
  return best;
}
function flyRecovery(charId, mx, my) {
  const W = new World({ stage: 'training', roster: [{ slot: 0, char: charId }, { slot: 1, char: REF }], rules: { mode: 'stock', stocks: 3, minigames: false, ult: false, hazards: false }, seed: 1 });
  W.phase = 'play';
  for (let t = 0; t < 40; t++) W.step({});
  const A = W.fighters[0], V = W.fighters[1], m = W.stage.main();
  V.x = m.cx + 30; // out of the way
  A.x = m.cx; A.y += 4; A.vx = A.vy = 0; A.grounded = false; A.facing = Math.PI / 2;
  const x0 = A.x, y0 = A.y;
  if (!startMove(A, W, 'sp_u')) return null;
  let up = 0, side = 0;
  const stickAt = (t) => { const [x, y] = typeof mx === 'function' ? mx(t, W, A) : [mx, my]; return { 0: { mx: x, my: y, held: 0, pressed: 0 } }; };
  for (let t = 0; t < 300; t++) { W.step(stickAt(t)); up = Math.max(up, A.y - y0); side = Math.max(side, Math.abs(A.x - x0)); if (A.grounded && t > 5) break; }
  return { up: Math.round(up * 10) / 10, side: Math.round(side * 10) / 10 };
}

// what a special's sheet says about it (the rest is code: onFrame / onStart / onEnd)
const specialFlags = (M) => ({
  dur: M.dur ?? null, iasa: M.iasa ?? null,
  hasHits: !!(M.hits && M.hits.length), code: typeof M.onFrame === 'function',
  oneOut: !!M.oneOut || undefined, airOnce: !!M.airOnce || undefined, helpless: !!M.helpless || undefined,
  poke: !!M.poke || undefined, charge: M.charge ? M.charge.max ?? true : undefined, upUses: M.upUses || undefined, whiffLag: M.whiffLag || undefined,
});

// the leading // comment block of src/sim/chars/<id>.js or stars/<id>.js, as plain text (null if none)
import fs from 'node:fs';
import { createHash } from 'node:crypto';

// fingerprint of a special's code: the move itself (its functions' source) plus the top-level pieces of the fighter's
// file it names (constants, helper functions, ENTITIES.x it spawns). A patch that touches any of them changes it.
// shortcut: helpers from shared files (kit.js, entities.js…) are not followed, upgrade if a patch slips through that way
const fileChunks = {};
function chunksOf(id) {
  if (fileChunks[id]) return fileChunks[id];
  const out = [];
  for (const f of [`chars/${id}.js`, `chars/stars/${id}.js`]) {
    const p = new URL(base + f, import.meta.url);
    if (!fs.existsSync(p)) continue;
    let cur = null;
    for (const l of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = /^(?:export\s+)?(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)|^ENTITIES\.([\w$]+)\s*=/.exec(l);
      if (m) { cur = { names: [m[1] || m[2]], text: '' }; out.push(cur); const more = /^(?:const|let)\s+(.*?)=/.exec(l); if (more) cur.names.push(...[...l.matchAll(/(?:^|,)\s*(?:const|let)?\s*([A-Z_][A-Z0-9_]*)\s*=/g)].map((x) => x[1])); }
      else if (/^\S/.test(l) && !/^[}\])]/.test(l)) cur = null; // another top-level statement ends the piece
      if (cur) cur.text += l.replace(/\s*\/\/.*$/, '') + '\n'; // comments don't count
    }
  }
  return (fileChunks[id] = out);
}
function codeHash(id, M) {
  const src = JSON.stringify(M, (k, v) => (typeof v === 'function' ? v.toString() : v));
  const used = chunksOf(id).filter((c) => c.names.some((n) => new RegExp(`\\b${n}\\b`).test(src))).map((c) => c.text);
  return createHash('sha1').update(src + used.join('')).digest('hex').slice(0, 10);
}
function aboutText(id) {
  for (const f of [`chars/${id}.js`, `chars/stars/${id}.js`]) {
    const p = new URL(base + f, import.meta.url);
    if (!fs.existsSync(p)) continue;
    const lines = [];
    for (const l of fs.readFileSync(p, 'utf8').split('\n')) { if (!l.startsWith('//')) break; lines.push(l.replace(/^\/\/\s?/, '')); }
    return lines.join('\n').trim() || null;
  }
  return null;
}

const out = { commit, measuredAt: new Date().toISOString(), reference: REF, chars: {} };
for (const id of only.length ? only : CHAR_ORDER) {
  const C = CHARS[id];
  const stats = Object.fromEntries(Object.entries(C.stats || {}).filter(([, v]) => typeof v === 'number'));
  const moves = {};
  for (const k of NORMALS) {
    const M = C.moves && C.moves[k];
    if (!M) continue;
    if (!M.hits || !M.hits.length) {
      // a normal made of code (J'san's dog, summons…): no hit zones to read, so it is launched in the sim like a special
      if (!M.onStart && !M.onFrame) continue;
      let s = measureSpecial(id, k);
      // an aerial of code: thrown in the air at a target where it aims (behind for bair, above for uair, below for dair)
      if (!(s && s.dmg > 0) && AIR_AIM[k]) s = measureSpecial(id, k, { air: true, where: AIR_AIM[k] });
      if (s && !(s.dmg > 0)) s = null; // still nothing: null (not measured), not 0
      moves[k] = { startup: s ? s.startup : null, dur: M.dur ?? null, iasa: M.iasa ?? null, landLag: M.landLag ?? M.landing ?? null, dmg: s ? s.dmg : null, ko: s ? s.ko : null, code: true };
      continue;
    }
    const hits = M.hits.filter((h) => h.f);
    moves[k] = {
      startup: Math.min(...hits.map((h) => h.f[0])),
      dur: M.dur ?? null, iasa: M.iasa ?? null, landLag: M.landLag ?? M.landing ?? null,
      dmg: totalDamage(hits),
      ko: koPercent(id, M),
      koFull: M.charge ? koPercent(id, M, M.charge.max) : undefined, // a smash charged to the max
      meteor: hits.some((h) => h.spike || (h.ang ?? 0) < 0) || undefined,
    };
  }
  const specials = {};
  for (const k of SPECIALS) if (C.moves && C.moves[k]) specials[k] = { ...measureBest(id, k, C.moves[k]), ...specialFlags(C.moves[k]), hash: codeHash(id, C.moves[k]) };
  if (specials.sp_u) specials.sp_u.recovery = measureRecovery(id);
  const U = C.ult || {};
  const grab = C.moves && C.moves.grab && C.moves.grab.hits && C.moves.grab.hits[0];
  out.chars[id] = {
    name: C.name, title: C.title, color: C.color, arch: C.arch, stats, moves, specials,
    specialsInfo: C.specialsInfo || null, // the creator's names for B, side B, up B, down B
    ult: U.name ? { name: U.name, sub: U.sub || null, dmg: Math.round(((U.final && U.final.dmg) || 0) + (U.notes || 0) * (U.noteDmg || 0)) || null } : null,
    recovery: C.recovery || null, grabStartup: grab ? grab.f[0] : null,
    about: aboutText(id), // the comment the creator wrote at the top of the fighter's file
  };
  process.stderr.write(id + ' ');
}
process.stdout.write(JSON.stringify(out));
