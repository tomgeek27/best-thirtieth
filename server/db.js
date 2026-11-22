import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const databasePath = process.env.DB_PATH || fileURLToPath(new URL('./serata.db', import.meta.url));
export const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    avatar_url TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS proposals (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    city TEXT NOT NULL,
    country TEXT NOT NULL,
    country_code TEXT NOT NULL,
    continent TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    destination_key TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS votes (
    user_id INTEGER NOT NULL REFERENCES users(id),
    destination_key TEXT NOT NULL,
    stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
    PRIMARY KEY (user_id, destination_key)
  );
  CREATE TABLE IF NOT EXISTS evening_state (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    phase TEXT NOT NULL DEFAULT 'lobby',
    speaker_id INTEGER REFERENCES users(id),
    reveal_started_at INTEGER,
    roulette_started_at INTEGER
  );
  INSERT OR IGNORE INTO evening_state (id) VALUES (1);
`);

export function destinationKey(city, countryCode) {
  return `${city.trim().normalize('NFKC').toLocaleLowerCase('it-IT').replace(/\s+/g, ' ')}|${countryCode.toUpperCase()}`;
}

export function destinations() {
  const rows = db.prepare(`SELECT p.*, u.name, u.avatar_url FROM proposals p JOIN users u ON u.id = p.user_id ORDER BY p.id`).all();
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.destination_key)) grouped.set(row.destination_key, {
      key: row.destination_key, city: row.city, country: row.country, countryCode: row.country_code,
      continent: row.continent, latitude: row.latitude, longitude: row.longitude, proposers: []
    });
    grouped.get(row.destination_key).proposers.push({ id: row.user_id, name: row.name, avatarUrl: row.avatar_url });
  }
  return [...grouped.values()];
}