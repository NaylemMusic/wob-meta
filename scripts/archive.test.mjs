// node scripts/archive.test.mjs : an old guide is kept once, only when it changed
import assert from 'node:assert';
import { archive } from './archive.mjs';

const oldG = { _version: 'v1', a: { resume: 'avant' }, b: { resume: 'pareil' } };
const newG = { _version: 'v2', a: { resume: 'après' }, b: { resume: 'pareil' } };
let h = archive({}, oldG, newG, (v, id) => ({ n: id + '@' + v }), 't');
assert.deepEqual(Object.keys(h), ['a'], 'only the changed guide');
assert.deepEqual(h.a[0], { version: 'v1', until: 'v2', archivedAt: 't', names: { n: 'a@v1' }, guide: { resume: 'avant' } });
h = archive(h, oldG, newG, () => null, 't2');
assert.equal(h.a.length, 1, 'running twice keeps it once');
h = archive(h, { _version: 'v2', a: { resume: 'après' } }, { _version: 'v3', a: { resume: 'encore' } }, () => null, 't3');
assert.deepEqual(h.a.map((e) => e.version), ['v2', 'v1'], 'newest first');
console.log('archive OK');
