import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomInt } from 'node:crypto';
import { db, destinationKey, destinations } from './db.js';

const app = express();
app.use(cors());
app.get('/health', (_request, response) => response.json({ ok: true }));
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const online = new Map();
const state = () => db.prepare('SELECT * FROM evening_state WHERE id = 1').get();
const users = () => db.prepare('SELECT id, name, avatar_url AS avatarUrl FROM users ORDER BY id').all();
let rouletteTimer;
let rouletteCandidateIds = [];

function cancelOfflineRoulette() {
  const current = state();
  if (current.phase !== 'roulette' || online.has(current.speaker_id)) return false;
  clearTimeout(rouletteTimer);
  rouletteCandidateIds = [];
  db.prepare("UPDATE evening_state SET phase = 'lobby', speaker_id = NULL, roulette_started_at = NULL WHERE id = 1").run();
  io.emit('drawCancelled', 'Il relatore si è disconnesso. Ripeti l’estrazione.');
  return true;
}

function removeOnline(userId) {
  const count = online.get(userId) || 0;
  if (count <= 1) online.delete(userId);
  else online.set(userId, count - 1);
}

function finishRoulette() {
  const current = state();
  if (current.phase !== 'roulette') return;
  if (cancelOfflineRoulette()) { broadcast(); return; }
  rouletteCandidateIds = [];
  db.prepare("UPDATE evening_state SET phase = 'selection', roulette_started_at = NULL WHERE id = 1").run();
  broadcast();
}

function scheduleRoulette() {
  clearTimeout(rouletteTimer);
  const current = state();
  if (current.phase === 'roulette') {
    if (!rouletteCandidateIds.length) rouletteCandidateIds = [current.speaker_id];
    rouletteTimer = setTimeout(finishRoulette, Math.max(0, current.roulette_started_at + 3500 - Date.now()));
  }
}

function snapshot(userId) {
  const current = state();
  const allDestinations = destinations();
  const proposals = db.prepare('SELECT user_id FROM proposals').all();
  const presented = new Set(proposals.map(proposal => proposal.user_id));
  const votes = db.prepare('SELECT user_id, destination_key, stars FROM votes').all();
  const counts = new Map();
  for (const vote of votes) counts.set(vote.user_id, (counts.get(vote.user_id) || 0) + 1);
  const participants = users().map(user => ({ ...user, online: (online.get(user.id) || 0) > 0, presented: presented.has(user.id) }));
  const completed = participants.filter(user => allDestinations.length > 0 && counts.get(user.id) === allDestinations.length).length;
  const ownVotes = Object.fromEntries(votes.filter(vote => vote.user_id === userId).map(vote => [vote.destination_key, vote.stars]));
  const ranking = current.phase === 'results' ? allDestinations.map(destination => {
    const received = votes.filter(vote => vote.destination_key === destination.key).map(vote => ({
      user: participants.find(user => user.id === vote.user_id)?.name, stars: vote.stars
    }));
    return { ...destination, votes: received, average: received.length ? received.reduce((sum, vote) => sum + vote.stars, 0) / received.length : 0 };
  }).sort((first, second) => second.average - first.average || first.city.localeCompare(second.city)) : [];
  const speakerDestinations = current.phase === 'reveal' ? db.prepare(`SELECT destination_key AS key, city, country,
    country_code AS countryCode, continent, latitude, longitude FROM proposals WHERE user_id = ? ORDER BY id`).all(current.speaker_id) : [];
  return {
    phase: current.phase, speakerId: current.speaker_id, revealStartedAt: current.reveal_started_at,
    speakerDestinations, sessionId: current.session_id,
    rouletteStartedAt: current.roulette_started_at, rouletteCandidateIds: rouletteCandidateIds.filter(id => online.has(id)), serverNow: Date.now(), users: participants,
    destinations: allDestinations, ownVotes, completed, ranking
  };
}

function broadcast() {
  for (const socket of io.sockets.sockets.values()) socket.emit('state', snapshot(socket.data.userId));
}

function fail(message) { throw new Error(message); }
function requireCoordinator(socket) {
  if (socket.data.userId !== 1) fail('Solo il coordinatore con ID 1 può guidare questa fase.');
}
function onAction(socket, event, handler) {
  socket.on(event, (payload, callback) => {
    const reply = typeof callback === 'function' ? callback : () => { };
    try {
      if (!socket.data.userId) fail('Seleziona prima un partecipante.');
      handler(payload);
      broadcast();
      reply({ ok: true });
    } catch (error) {
      reply({ ok: false, error: error.message });
    }
  });
}

io.on('connection', socket => {
  socket.on('identify', (userId, callback) => {
    const reply = typeof callback === 'function' ? callback : () => { };
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(Number(userId));
    if (!user) { reply({ ok: false, error: 'Partecipante non trovato.' }); return; }
    if (socket.data.userId) removeOnline(socket.data.userId);
    socket.data.userId = user.id;
    online.set(user.id, (online.get(user.id) || 0) + 1);
    cancelOfflineRoulette();
    reply({ ok: true });
    broadcast();
  });
  socket.on('unidentify', () => {
    if (!socket.data.userId) return;
    removeOnline(socket.data.userId);
    socket.data.userId = null;
    broadcast();
  });
  socket.emit('state', snapshot(null));

  onAction(socket, 'draw', () => {
    requireCoordinator(socket);
    if (state().phase !== 'lobby') fail('La serata non è nella lobby.');
    const eligible = db.prepare('SELECT id FROM users WHERE id NOT IN (SELECT user_id FROM proposals)').all().filter(user => online.has(user.id));
    if (!eligible.length) fail('Nessun partecipante connesso disponibile per l’estrazione.');
    const selected = eligible[randomInt(eligible.length)];
    rouletteCandidateIds = eligible.map(user => user.id);
    db.prepare("UPDATE evening_state SET phase = 'roulette', speaker_id = ?, roulette_started_at = ? WHERE id = 1").run(selected.id, Date.now());
    scheduleRoulette();
  });

  onAction(socket, 'propose', payload => {
    const current = state();
    if (current.phase !== 'selection' || current.speaker_id !== socket.data.userId) fail('Solo il relatore estratto può scegliere la meta.');
    const proposals = payload?.destinations;
    if (!Array.isArray(proposals) || proposals.length < 1) fail('Aggiungi almeno una meta prima della presentazione.');
    const keys = new Set();
    for (const proposal of proposals) {
      const { city, country, countryCode, continent, latitude, longitude } = proposal || {};
      if (![city, country, continent].every(value => typeof value === 'string' && value.trim().length > 0 && value.length <= 100) ||
        typeof countryCode !== 'string' || !/^[A-Za-z]{2}$/.test(countryCode) ||
        !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) fail('Una delle mete non è valida.');
      const key = destinationKey(city, countryCode);
      if (keys.has(key)) fail('Hai aggiunto due volte la stessa città e lo stesso Paese.');
      keys.add(key);
    }
    db.transaction(() => {
      const insert = db.prepare(`INSERT INTO proposals (user_id, city, country, country_code, continent, latitude, longitude, destination_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const proposal of proposals) {
        const { city, country, countryCode, continent, latitude, longitude } = proposal;
        insert.run(socket.data.userId, city.trim(), country.trim(), countryCode.toUpperCase(), continent.trim(), latitude, longitude, destinationKey(city, countryCode));
      }
      db.prepare("UPDATE evening_state SET phase = 'reveal', reveal_started_at = ? WHERE id = 1").run(Date.now() + 500);
    })();
  });

  onAction(socket, 'finishReveal', () => {
    requireCoordinator(socket);
    const current = state();
    const proposalCount = db.prepare('SELECT COUNT(*) AS count FROM proposals WHERE user_id = ?').get(current.speaker_id).count;
    if (current.phase !== 'reveal' || Date.now() < current.reveal_started_at + proposalCount * 20000) fail('La presentazione è ancora in corso.');
    const remaining = db.prepare('SELECT COUNT(*) AS count FROM users WHERE id NOT IN (SELECT user_id FROM proposals)').get().count;
    db.prepare('UPDATE evening_state SET phase = ?, speaker_id = NULL, reveal_started_at = NULL WHERE id = 1').run(remaining === 0 ? 'voting' : 'lobby');
  });

  onAction(socket, 'startVoting', () => {
    requireCoordinator(socket);
    if (state().phase !== 'lobby' || !destinations().length) fail('Serve almeno una meta presentata.');
    db.prepare("UPDATE evening_state SET phase = 'voting', speaker_id = NULL WHERE id = 1").run();
  });

  onAction(socket, 'vote', payload => {
    if (state().phase !== 'voting') fail('La votazione non è aperta.');
    if (!payload || !destinations().some(destination => destination.key === payload.key) || !Number.isInteger(payload.stars) || payload.stars < 1 || payload.stars > 5) fail('Voto non valido.');
    db.prepare(`INSERT INTO votes (user_id, destination_key, stars) VALUES (?, ?, ?)
      ON CONFLICT(user_id, destination_key) DO UPDATE SET stars = excluded.stars`).run(socket.data.userId, payload.key, payload.stars);
  });

  onAction(socket, 'showResults', () => {
    requireCoordinator(socket);
    const current = snapshot(socket.data.userId);
    if (current.phase !== 'voting' || !current.destinations.length || current.completed !== current.users.length) fail('Attendi che tutti completino la votazione.');
    db.prepare("UPDATE evening_state SET phase = 'results' WHERE id = 1").run();
  });

  socket.on('disconnect', () => {
    if (socket.data.userId) {
      removeOnline(socket.data.userId);
      cancelOfflineRoulette();
      broadcast();
    }
  });
});

scheduleRoulette();
const port = Number(process.env.PORT || 3001);
httpServer.listen(port, '0.0.0.0', () => console.log(`Server pronto su 0.0.0.0:${port}`));