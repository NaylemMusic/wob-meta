// node scripts/announce.test.mjs : the Discord text of a patch note
import assert from 'node:assert';
import { message } from './announce.mjs';

const chars = { bido: { name: 'BIDO' }, nysos: { name: 'NYSOS' } };
const m = message({ to: 'x', date: '2026-11-20T12:00:00Z', added: [], chars: { bido: { verdict: 'buff', changes: [1, 2] }, nysos: { verdict: 'nerf', changes: [1] } } }, chars);
assert.match(m, /2 persos modifiés/);
assert.match(m, /• BIDO ▲ buff \(2 changements\)/);
assert.match(m, /• NYSOS ▼ nerf \(1 changement\)/);
assert.match(m, /nds-tournament\.fr\/patchnotes/);
assert.match(message({ to: 'y', date: '2026-11-20T12:00:00Z', added: [], chars: {} }), /Aucun chiffre/);
console.log('announce OK');
