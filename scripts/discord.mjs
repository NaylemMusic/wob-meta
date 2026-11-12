// Reads the game's "update" channel (followed into the NDS server) and attaches each official message to our patch note.
// env: DISCORD_BOT_TOKEN (secret), DISCORD_UPDATE_CHANNEL (channel id). Without them: does nothing.
// data/official.json keeps { lastId, pending: [messages not attached yet] }.
// Rule: a message goes to the measured patch note closest in time within 48 h; if our note does not exist yet, it waits
// in `pending` and is attached on a later run, once the robot has measured the patch.
import fs from 'node:fs';

const WINDOW_MS = 48 * 3600 * 1000;

// pure: attach pending messages to notes (newest first). Returns { notes, pending }
export function attach(notes, pending) {
  const left = [];
  for (const m of pending) {
    const t = Date.parse(m.date);
    let best = null, bestGap = Infinity;
    for (const n of notes) {
      if (n.initial) continue;
      const gap = Math.abs(Date.parse(n.date) - t);
      if (gap <= WINDOW_MS && gap < bestGap) { best = n; bestGap = gap; }
    }
    if (best) {
      best.official = best.official || [];
      if (!best.official.some((o) => o.id === m.id)) best.official.push(m);
      best.official.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    } else left.push(m);
  }
  return { notes, pending: left };
}

// a Discord message → what we keep (text + the text of its embeds; a crossposted announcement keeps its content)
export function keep(msg) {
  if (msg.type) return null; // only normal messages (type 0): skips "channel followed" notices (type 12) and other system messages
  const parts = [msg.content || ''];
  for (const e of msg.embeds || []) parts.push([e.title, e.description].filter(Boolean).join('\n'));
  const text = parts.filter((s) => s && s.trim()).join('\n\n').trim();
  return text ? { id: msg.id, date: msg.timestamp, text } : null;
}

if ((process.argv[1] || '').endsWith('discord.mjs')) {
  const token = process.env.DISCORD_BOT_TOKEN, channel = process.env.DISCORD_UPDATE_CHANNEL;
  const state = fs.existsSync('data/official.json') ? JSON.parse(fs.readFileSync('data/official.json', 'utf8')) : { lastId: null, pending: [] };
  if (token && channel) {
    const url = `https://discord.com/api/v10/channels/${channel}/messages?limit=50${state.lastId ? `&after=${state.lastId}` : ''}`;
    const r = await fetch(url, { headers: { Authorization: `Bot ${token}`, 'User-Agent': 'wob-meta (github actions)' } });
    if (!r.ok) { console.error('Discord :', r.status, (await r.text()).slice(0, 200)); process.exit(0); } // never fail the robot for Discord
    const msgs = (await r.json()).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    for (const m of msgs) { const k = keep(m); if (k) state.pending.push(k); state.lastId = m.id; }
    console.log('messages officiels nouveaux :', msgs.length);
  } else console.log('Discord non configuré (DISCORD_BOT_TOKEN / DISCORD_UPDATE_CHANNEL) : rien à lire');
  const notes = fs.existsSync('data/patchnotes.json') ? JSON.parse(fs.readFileSync('data/patchnotes.json', 'utf8')) : [];
  const res = attach(notes, state.pending);
  state.pending = res.pending;
  fs.writeFileSync('data/patchnotes.json', JSON.stringify(res.notes));
  fs.writeFileSync('data/official.json', JSON.stringify(state));
  console.log('en attente de notre patch note :', state.pending.length);
}
