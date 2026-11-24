import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { io } from 'socket.io-client';

test('serata persistente, mete uniche e voti riservati', { timeout: 30000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), '30anni-test-'));
  const database = join(directory, 'test.db');
  const port = 31000 + Math.floor(Math.random() * 20000);
  const env = { ...process.env, DB_PATH: database, PORT: String(port) };
  assert.equal(spawnSync(process.execPath, ['seed.js'], { cwd: import.meta.dirname, env }).status, 0);
  let server;
  const clients = [];
  async function start() {
    server = spawn(process.execPath, ['server.js'], { cwd: import.meta.dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      server.stdout.once('data', resolve);
      server.once('exit', code => reject(new Error(`Server terminato: ${code}`)));
    });
  }
  async function connect(userId) {
    const client = io(`http://127.0.0.1:${port}`, { forceNew: true });
    clients.push(client);
    await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
    assert.equal((await client.emitWithAck('identify', userId)).ok, true);
    return client;
  }
  function nextState(client, predicate) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { client.off('state', listener); reject(new Error('Stato non ricevuto')); }, 6000);
      function listener(value) { if (predicate(value)) { clearTimeout(timer); client.off('state', listener); resolve(value); } }
      client.on('state', listener);
    });
  }
  async function drawAndPropose(client, places = [{ city: 'Lisbona', country: 'Portogallo', countryCode: 'PT', continent: 'Europa', latitude: 38.72, longitude: -9.14 }]) {
    const selection = nextState(client, value => value.phase === 'selection');
    assert.equal((await client.emitWithAck('draw', {})).ok, true);
    const current = await selection;
    const speaker = await connect(current.speakerId);
    const otherId = current.speakerId === 1 ? 2 : 1;
    const other = await connect(otherId);
    const proposal = { destinations: places };
    assert.equal((await other.emitWithAck('propose', proposal)).ok, false);
    const empty = await speaker.emitWithAck('propose', { destinations: [] });
    assert.equal(empty.ok, false);
    assert.match(empty.error, /almeno una meta/);
    const reveal = nextState(client, value => value.phase === 'reveal');
    const response = await speaker.emitWithAck('propose', proposal);
    assert.equal(response.ok, true, response.error);
    await reveal;
    const connection = new Database(database);
    const revealDuration = places.length * 20000;
    connection.prepare('UPDATE evening_state SET reveal_started_at = ? WHERE id = 1').run(Date.now() - (revealDuration - 1000));
    assert.equal((await client.emitWithAck('finishReveal', {})).ok, false);
    connection.prepare('UPDATE evening_state SET reveal_started_at = ? WHERE id = 1').run(Date.now() - (revealDuration + 1000));
    connection.close();
    assert.equal((await client.emitWithAck('finishReveal', {})).ok, true);
  }
  try {
    await start();
    let client = await connect(1);
    const nonAdmin = await connect(2);
    assert.equal((await nonAdmin.emitWithAck('draw', {})).ok, false);
    await drawAndPropose(client);
    await drawAndPropose(client, [
      { city: 'Lisbona', country: 'Portogallo', countryCode: 'PT', continent: 'Europa', latitude: 38.72, longitude: -9.14 },
      { city: 'Parigi', country: 'Francia', countryCode: 'FR', continent: 'Europa', latitude: 48.86, longitude: 2.35 }
    ]);
    const voting = nextState(client, value => value.phase === 'voting');
    assert.equal((await client.emitWithAck('startVoting', {})).ok, true);
    const votingState = await voting;
    assert.equal(votingState.destinations.length, 2);
    assert.equal(votingState.destinations.find(destination => destination.city === 'Lisbona').proposers.length, 2);
    assert.equal(votingState.destinations.find(destination => destination.city === 'Parigi').proposers.length, 1);
    const keys = votingState.destinations.map(destination => destination.key);
    assert.equal((await nonAdmin.emitWithAck('startVoting', {})).ok, false);
    assert.equal((await client.emitWithAck('showResults', {})).ok, false);
    assert.equal((await nonAdmin.emitWithAck('showResults', {})).ok, false);
    for (const key of keys) assert.equal((await client.emitWithAck('vote', { key, stars: 5 })).ok, true);
    for (const socket of clients) socket.disconnect();
    await new Promise(resolve => { server.once('exit', resolve); server.kill(); });
    await start();
    client = await connect(1);
    const restored = nextState(client, value => value.phase === 'voting');
    assert.equal((await client.emitWithAck('identify', 1)).ok, true);
    const afterRestart = await restored;
    for (const key of keys) assert.equal(afterRestart.ownVotes[key], 5);
    assert.deepEqual(afterRestart.ranking, []);
    const second = await connect(2);
    const privateState = nextState(second, value => value.phase === 'voting');
    await second.emitWithAck('identify', 2);
    assert.deepEqual((await privateState).ownVotes, {});
    for (let id = 2; id <= 3; id++) {
      const voter = id === 2 ? second : await connect(id);
      for (const key of keys) assert.equal((await voter.emitWithAck('vote', { key, stars: 3 })).ok, true);
    }
    const results = nextState(client, value => value.phase === 'results');
    assert.equal((await nonAdmin.emitWithAck('showResults', {})).ok, false);
    assert.equal((await client.emitWithAck('showResults', {})).ok, true);
    const final = await results;
    assert.equal(final.completed, 3);
    assert.equal(final.ranking.length, 2);
    const lisbon = final.ranking.find(destination => destination.city === 'Lisbona');
    assert.ok(Math.abs(lisbon.average - 11 / 3) < 0.0001);
    assert.equal(lisbon.votes.length, 3);
  } finally {
    for (const client of clients) client.disconnect();
    if (server && server.exitCode === null) await new Promise(resolve => { server.once('exit', resolve); server.kill(); });
    rmSync(directory, { recursive: true, force: true });
  }
});

test('migra le proposte legacy preservando i dati e permette piu mete per utente', () => {
  const directory = mkdtempSync(join(tmpdir(), '30anni-migration-test-'));
  const database = join(directory, 'legacy.db');
  const legacy = new Database(database);
  legacy.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, avatar_url TEXT NOT NULL);
    CREATE TABLE proposals (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id), city TEXT NOT NULL,
      country TEXT NOT NULL, country_code TEXT NOT NULL, continent TEXT NOT NULL,
      latitude REAL NOT NULL, longitude REAL NOT NULL, destination_key TEXT NOT NULL
    );
    CREATE TABLE votes (user_id INTEGER NOT NULL, destination_key TEXT NOT NULL, stars INTEGER NOT NULL, PRIMARY KEY(user_id, destination_key));
    CREATE TABLE evening_state (id INTEGER PRIMARY KEY, phase TEXT NOT NULL, speaker_id INTEGER, reveal_started_at INTEGER, roulette_started_at INTEGER);
    INSERT INTO users VALUES (1, 'Marco', '/avatars/marco.jpg');
    INSERT INTO proposals VALUES (1, 1, 'Roma', 'Italia', 'IT', 'Europa', 41.9, 12.5, 'roma|IT');
  `);
  legacy.close();
  try {
    const migrated = spawnSync(process.execPath, ['--input-type=module', '-e', `import { db } from './db.js'; db.prepare("INSERT INTO proposals (user_id, city, country, country_code, continent, latitude, longitude, destination_key) VALUES (1, 'Milano', 'Italia', 'IT', 'Europa', 45.46, 9.19, 'milano|IT')").run(); console.log(db.prepare('SELECT city FROM proposals ORDER BY id').all().map(row => row.city).join(',')); db.close();`], {
      cwd: import.meta.dirname,
      env: { ...process.env, DB_PATH: database },
      encoding: 'utf8'
    });
    assert.equal(migrated.status, 0, migrated.stderr);
    assert.match(migrated.stdout, /Roma,Milano/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('roulette solo online, connessioni multiple e disconnessione', { timeout: 15000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), '30anni-online-test-'));
  const database = join(directory, 'test.db');
  const port = 31000 + Math.floor(Math.random() * 20000);
  const env = { ...process.env, DB_PATH: database, PORT: String(port) };
  assert.equal(spawnSync(process.execPath, ['seed.js'], { cwd: import.meta.dirname, env }).status, 0);
  const connection = new Database(database);
  connection.prepare(`INSERT INTO proposals (user_id, city, country, country_code, continent, latitude, longitude, destination_key)
    VALUES (1, 'Roma', 'Italia', 'IT', 'Europa', 41.9, 12.5, 'roma|IT')`).run();
  connection.close();
  const server = spawn(process.execPath, ['server.js'], { cwd: import.meta.dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const clients = [];
  function nextState(client, predicate) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { client.off('state', listener); reject(new Error('Stato non ricevuto')); }, 6000);
      function listener(value) { if (predicate(value)) { clearTimeout(timer); client.off('state', listener); resolve(value); } }
      client.on('state', listener);
    });
  }
  async function connect(id) {
    const client = io(`http://127.0.0.1:${port}`, { forceNew: true });
    clients.push(client);
    await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
    assert.equal((await client.emitWithAck('identify', id)).ok, true);
    return client;
  }
  try {
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('exit', reject); });
    const observer = await connect(1);
    const resetProfile = await connect(3);
    const profileOffline = nextState(observer, value => !value.users.find(user => user.id === 3).online);
    resetProfile.emit('unidentify');
    await profileOffline;
    const empty = await observer.emitWithAck('draw', {});
    assert.equal(empty.ok, false);
    assert.match(empty.error, /Nessun partecipante connesso disponibile/);
    const first = await connect(2);
    const second = await connect(2);
    assert.equal((await second.emitWithAck('identify', 2)).ok, true);
    assert.equal((await second.emitWithAck('draw', {})).ok, false);
    const afterFirstDisconnect = nextState(observer, value => value.users.find(user => user.id === 2).online);
    first.disconnect();
    await afterFirstDisconnect;
    const drawn = nextState(observer, value => value.phase === 'roulette');
    assert.equal((await observer.emitWithAck('draw', {})).ok, true);
    const roulette = await drawn;
    assert.equal(roulette.speakerId, 2);
    assert.deepEqual(roulette.rouletteCandidateIds, [2]);
    const cancelled = nextState(observer, value => value.phase === 'lobby' && !value.users.find(user => user.id === 2).online);
    const message = new Promise(resolve => observer.once('drawCancelled', resolve));
    second.disconnect();
    assert.match(await message, /disconnesso/);
    await cancelled;
    assert.equal((await observer.emitWithAck('draw', {})).ok, false);
    await connect(2);
    const selection = nextState(observer, value => value.phase === 'selection');
    assert.equal((await observer.emitWithAck('draw', {})).ok, true);
    assert.equal((await selection).speakerId, 2);
  } finally {
    for (const client of clients) client.disconnect();
    if (server.exitCode === null) await new Promise(resolve => { server.once('exit', resolve); server.kill(); });
    rmSync(directory, { recursive: true, force: true });
  }
});