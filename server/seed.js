import { db } from './db.js';

// Personalizza questa lista prima della serata; mantieni stabili gli ID dopo l'inizio.
const friends = [
  { id: 1, name: 'Marco', avatarUrl: '/avatars/marco.jpg' },
  { id: 2, name: 'Luca', avatarUrl: '/avatars/luca.jpg' },
  { id: 3, name: 'Sara', avatarUrl: '/avatars/sara.jpg' },
  { id: 4, name: 'Giulia', avatarUrl: '/avatars/giulia.jpg' },
  { id: 5, name: 'Andrea', avatarUrl: '/avatars/andrea.jpg' },
  { id: 6, name: 'Martina', avatarUrl: '/avatars/martina.jpg' },
  { id: 7, name: 'Davide', avatarUrl: '/avatars/davide.jpg' },
  { id: 8, name: 'Chiara', avatarUrl: '/avatars/chiara.jpg' }
];

const upsert = db.prepare(`INSERT INTO users (id, name, avatar_url) VALUES (@id, @name, @avatarUrl)
  ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar_url = excluded.avatar_url`);
db.transaction(() => {
  for (const friend of friends) upsert.run(friend);
})();
console.log(`Seed completato: ${friends.length} partecipanti aggiornati.`);
db.close();