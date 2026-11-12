// node scripts/discord.test.mjs : official messages attach before/after our note, never to the initial one
import assert from 'node:assert';
import { attach, keep } from './discord.mjs';

const H = 3600 * 1000, t0 = Date.parse('2026-11-20T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const notes = [{ to: 'b', date: iso(t0), chars: {} }, { initial: true, to: 'a', date: iso(t0 - 6 * H), chars: {} }];

// message 1 h BEFORE our note, message 3 h AFTER, one 5 days later (next patch not measured yet)
let r = attach(notes, [{ id: '1', date: iso(t0 - H), text: 'avant' }, { id: '2', date: iso(t0 + 3 * H), text: 'après' }, { id: '3', date: iso(t0 + 120 * H), text: 'plus tard' }]);
assert.deepEqual(r.notes[0].official.map((o) => o.text), ['avant', 'après'], 'both land on our note, in time order');
assert.equal(r.notes[1].official, undefined, 'never on the initial measurement');
assert.deepEqual(r.pending.map((m) => m.id), ['3'], 'too far: waits for our next note');

// our next note appears: the pending one attaches; running twice never duplicates
r.notes.unshift({ to: 'c', date: iso(t0 + 121 * H), chars: {} });
r = attach(r.notes, r.pending);
r = attach(r.notes, [{ id: '3', date: iso(t0 + 120 * H), text: 'plus tard' }]);
assert.equal(r.notes[0].official.length, 1);
assert.equal(r.pending.length, 0);

assert.equal(keep({ id: '9', timestamp: 'x', content: '', embeds: [] }), null, 'empty message ignored');
assert.equal(keep({ id: '9', timestamp: 'x', content: 'Patch 1.2', embeds: [{ title: 'Nerfs', description: 'MISTER Y' }] }).text, 'Patch 1.2\n\nNerfs\nMISTER Y');
assert.equal(keep({ id: '9', type: 12, timestamp: 'x', content: 'World of Bagarre #mises-à-jour' }), null, 'follow notice ignored');
console.log('discord OK');
