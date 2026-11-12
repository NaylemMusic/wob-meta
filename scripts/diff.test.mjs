// node scripts/diff.test.mjs : checks buff/nerf direction on a made-up patch
import assert from 'node:assert';
import { diff } from './diff.mjs';

const A = { commit: 'a', chars: { x: { name: 'X', stats: { weight: 100 }, moves: { smash: { startup: 12, dmg: 17, ko: 70 }, nair: { startup: 4, dmg: 10, ko: null } } }, gone: { name: 'G', stats: {}, moves: {} } } };
const B = { commit: 'b', measuredAt: 't', chars: { x: { name: 'X', stats: { weight: 100 }, moves: { smash: { startup: 14, dmg: 15, ko: 85 }, nair: { startup: 4, dmg: 10, ko: 300 } } }, nouveau: { name: 'N', stats: {}, moves: {} } } };
const n = diff(A, B);
assert.deepEqual(n.added, ['nouveau']);
assert.deepEqual(n.removed, ['gone']);
const c = Object.fromEntries(n.chars.x.changes.map((ch) => [ch.what + '.' + ch.key, ch.v]));
assert.equal(c['smash.startup'], -1, 'slower = nerf');
assert.equal(c['smash.dmg'], -1, 'less damage = nerf');
assert.equal(c['smash.ko'], -1, 'kills later = nerf');
assert.equal(c['nair.ko'], 1, 'starts killing = buff');
assert.equal(n.chars.x.verdict, 'nerf');
assert.equal(diff(A, A).added.length + Object.keys(diff(A, A).chars).length, 0, 'same version = nothing');
console.log('diff OK');
