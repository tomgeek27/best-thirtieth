import { db } from './db.js';

// Personalizza questa lista prima della serata; mantieni stabili gli ID dopo l'inizio.
const friends = [
  { id: 1, name: 'Tommi', avatarUrl: '/avatars/tommi.jpg' },
  { id: 2, name: 'Bobogol bengvir 🇮🇱', avatarUrl: '/avatars/bobogol.jpg' },
  { id: 3, name: 'Ralf', avatarUrl: '/avatars/ralf.jpg' },
  { id: 4, name: 'Marcoccio', avatarUrl: '/avatars/marcoccio.jpg' },
  { id: 5, name: 'Lelloz', avatarUrl: '/avatars/lelloz.jpg' },
  { id: 6, name: 'Frenkestein', avatarUrl: '/avatars/frenk.jpg' },
  { id: 7, name: 'Piero infame', avatarUrl: '/avatars/piero.jpg' },
  { id: 8, name: 'Gio', avatarUrl: '/avatars/gio.jpg' },
  { id: 9, name: 'Massi', avatarUrl: '/avatars/massi.jpg' }
];

const upsert = db.prepare(`INSERT INTO users (id, name, avatar_url) VALUES (@id, @name, @avatarUrl)
  ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar_url = excluded.avatar_url`);
db.transaction(() => {
  for (const friend of friends) upsert.run(friend);
})();
console.log(`Seed completato: ${friends.length} partecipanti aggiornati.`);
db.close();