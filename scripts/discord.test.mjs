// node scripts/discord.test.mjs : official messages attach to the version that comes out after them, never to the initial one
import assert from 'node:assert';
import { attach, keep } from './discord.mjs';

const H = 3600 * 1000, M = 60 * 1000, t0 = Date.parse('2026-11-20T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const notes = [{ to: 'b', date: iso(t0), chars: {} }, { initial: true, to: 'a', date: iso(t0 - 6 * H), chars: {} }];

// posted 1 h before our note (« en ligne d'ici quelques minutes »), 10 min after it (we caught the version first),
// 3 h after it (its own version not measured yet: it must NOT land on the old note)
let r = attach(notes, [{ id: '1', date: iso(t0 - H), text: 'avant' }, { id: '2', date: iso(t0 + 10 * M), text: 'juste après' }, { id: '3', date: iso(t0 + 3 * H), text: 'plus tard' }]);
assert.deepEqual(r.notes[0].official.map((o) => o.text), ['avant', 'juste après'], 'the version that comes out after the post');
assert.equal(r.notes[1].official, undefined, 'never on the initial measurement');
assert.deepEqual(r.pending.map((m) => m.id), ['3'], 'its version is not measured yet: it waits');

// the real case of 12 Nov 2026: posted 16:58, previous note 14:41, its version measured 17:10
const real = [{ to: 'old', date: '2026-11-12T14:41:38Z', chars: {} }];
r = attach(real, [{ id: 'x', date: '2026-11-12T16:58:26Z', text: 'clavier-souris' }]);
assert.equal(r.notes[0].official, undefined, 'not on the previous version');
r.notes.unshift({ to: 'new', date: '2026-11-12T17:10:53Z', chars: {} });
r = attach(r.notes, r.pending);
assert.deepEqual(r.notes[0].official.map((o) => o.id), ['x'], 'on the version measured after it');

// the robot caught the version 12 s before the post, the next version came 9 min later: the closest one
r = attach([{ to: 'n2', date: '2026-11-12T14:41:38Z', chars: {} }, { to: 'n1', date: '2026-11-12T14:32:00Z', chars: {} }], [{ id: 'a', date: '2026-11-12T14:32:12Z', text: 'a' }, { id: 'b', date: '2026-11-12T14:37:37Z', text: 'b' }]);
assert.deepEqual([r.notes[0].official.map((o) => o.id), r.notes[1].official.map((o) => o.id)], [['b'], ['a']], 'each message on its own version');

// two notes after the post: the closest one
r = attach([{ to: 'c2', date: iso(t0 + 2 * H), chars: {} }, { to: 'c1', date: iso(t0 + 30 * M), chars: {} }], [{ id: '4', date: iso(t0), text: 'x' }]);
assert.equal(r.notes[1].official.length, 1);
assert.equal(r.notes[0].official, undefined);

// running twice never duplicates
r = attach(r.notes, [{ id: '4', date: iso(t0), text: 'x' }]);
assert.equal(r.notes[1].official.length, 1);

assert.equal(keep({ id: '9', timestamp: 'x', content: '', embeds: [] }), null, 'empty message ignored');
assert.equal(keep({ id: '9', timestamp: 'x', content: 'Patch 1.2', embeds: [{ title: 'Nerfs', description: 'MISTER Y' }] }).text, 'Patch 1.2\n\nNerfs\nMISTER Y');
assert.equal(keep({ id: '9', type: 12, timestamp: 'x', content: 'World of Bagarre #mises-à-jour' }), null, 'follow notice ignored');
const fw = keep({ id: '10', type: 0, timestamp: 'forward-time', content: '', message_snapshots: [{ message: { timestamp: 'original-time', content: '', embeds: [{ title: 'Mise à jour du 12 novembre', description: '• balle' }] } }] });
assert.deepEqual([fw.text, fw.date], ['Mise à jour du 12 novembre\n• balle', 'original-time'], 'forwarded announcement: original text and date');
console.log('discord OK');
