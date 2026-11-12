// Posts each new patch note once on Discord, with the NDS bot.
// env: DISCORD_BOT_TOKEN (secret), DISCORD_PATCH_CHANNEL (channel id). Without them: does nothing.
// data/announced.json keeps { last: <commit of the last note announced> } so a note is never posted twice.
import fs from 'node:fs';

const SITE = 'https://nds-tournament.fr/patchnotes/';
const TAG = { buff: '▲ buff', nerf: '▼ nerf', 'ajusté': '● ajusté' };

// pure: the Discord text of a note (names from the measured data of that version)
export function message(note, chars = {}) {
  const name = (id) => (chars[id] && chars[id].name) || id;
  const date = new Date(note.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  const list = Object.entries(note.chars || {}).sort((a, b) => b[1].changes.length - a[1].changes.length);
  const lines = [`🆕 **World of Bagarre : patch du ${date}**`];
  if (note.added && note.added.length) lines.push(`Nouveaux persos : ${note.added.map(name).join(', ')}`);
  if (list.length) {
    lines.push(`${list.length} perso${list.length > 1 ? 's' : ''} modifié${list.length > 1 ? 's' : ''} :`);
    for (const [id, c] of list.slice(0, 15)) lines.push(`• ${c.name || name(id)} ${TAG[c.verdict] || ''} (${c.changes.length} changement${c.changes.length > 1 ? 's' : ''})`);
    if (list.length > 15) lines.push(`… et ${list.length - 15} autres`);
  } else if (!(note.added && note.added.length)) lines.push('Aucun chiffre de combat n\'a bougé (changement hors combat).');
  lines.push(`👉 Le détail coup par coup : ${SITE}`);
  return lines.join('\n').slice(0, 1900);
}

if ((process.argv[1] || '').endsWith('announce.mjs')) {
  const token = process.env.DISCORD_BOT_TOKEN, channel = process.env.DISCORD_PATCH_CHANNEL;
  const notes = fs.existsSync('data/patchnotes.json') ? JSON.parse(fs.readFileSync('data/patchnotes.json', 'utf8')) : [];
  const state = fs.existsSync('data/announced.json') ? JSON.parse(fs.readFileSync('data/announced.json', 'utf8')) : { last: null };
  const n = notes[0];
  if (!n || n.initial || n.to === state.last) { console.log('rien à annoncer'); process.exit(0); }
  if (!token || !channel) { console.log('Annonce Discord non configurée (DISCORD_PATCH_CHANNEL)'); process.exit(0); }
  const file = `data/${n.to}.json`;
  const chars = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).chars : {};
  const r = await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'wob-meta (github actions)' },
    body: JSON.stringify({ content: message(n, chars), allowed_mentions: { parse: [] } }),
  });
  if (!r.ok) { console.error('Discord :', r.status, (await r.text()).slice(0, 200)); process.exit(0); } // never fail the robot for Discord
  fs.writeFileSync('data/announced.json', JSON.stringify({ last: n.to }));
  console.log('annoncé :', n.to);
}
