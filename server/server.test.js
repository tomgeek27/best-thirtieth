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
  async function drawAndPropose(client) {
    const selection = nextState(client, value => value.phase === 'selection');
    assert.equal((await client.emitWithAck('draw', {})).ok, true);
    const current = await selection;
    const speaker = await connect(current.speakerId);
    const otherId = current.speakerId === 1 ? 2 : 1;
    const other = await connect(otherId);
    const proposal = { city: 'Lisbona', country: 'Portogallo', countryCode: 'PT', continent: 'Europa', latitude: 38.72, longitude: -9.14 };
    assert.equal((await other.emitWithAck('propose', proposal)).ok, false);
    const reveal = nextState(client, value => value.phase === 'reveal');
    assert.equal((await speaker.emitWithAck('propose', proposal)).ok, true);
    await reveal;
    const connection = new Database(database);
    connection.prepare('UPDATE evening_state SET reveal_started_at = ? WHERE id = 1').run(Date.now() - 8000);
    connection.close();
    assert.equal((await client.emitWithAck('finishReveal', {})).ok, true);
  }
  try {
    await start();
    let client = await connect(1);
    await drawAndPropose(client);
    await drawAndPropose(client);
    const voting = nextState(client, value => value.phase === 'voting');
    assert.equal((await client.emitWithAck('startVoting', {})).ok, true);
    const votingState = await voting;
    assert.equal(votingState.destinations.length, 1);
    assert.equal(votingState.destinations[0].proposers.length, 2);
    const key = votingState.destinations[0].key;
    assert.equal((await client.emitWithAck('showResults', {})).ok, false);
    assert.equal((await client.emitWithAck('vote', { key, stars: 5 })).ok, true);
    for (const socket of clients) socket.disconnect();
    await new Promise(resolve => { server.once('exit', resolve); server.kill(); });
    await start();
    client = await connect(1);
    const restored = nextState(client, value => value.phase === 'voting');
    assert.equal((await client.emitWithAck('identify', 1)).ok, true);
    const afterRestart = await restored;
    assert.equal(afterRestart.ownVotes[key], 5);
    assert.deepEqual(afterRestart.ranking, []);
    const second = await connect(2);
    const privateState = nextState(second, value => value.phase === 'voting');
    await second.emitWithAck('identify', 2);
    assert.deepEqual((await privateState).ownVotes, {});
    for (let id = 2; id <= 8; id++) {
      const voter = id === 2 ? second : await connect(id);
      assert.equal((await voter.emitWithAck('vote', { key, stars: 3 })).ok, true);
    }
    const results = nextState(client, value => value.phase === 'results');
    assert.equal((await client.emitWithAck('showResults', {})).ok, true);
    const final = await results;
    assert.equal(final.completed, 8);
    assert.equal(final.ranking[0].average, 3.25);
    assert.equal(final.ranking[0].votes.length, 8);
  } finally {
    for (const client of clients) client.disconnect();
    if (server && server.exitCode === null) await new Promise(resolve => { server.once('exit', resolve); server.kill(); });
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
    const empty = await observer.emitWithAck('draw', {});
    assert.equal(empty.ok, false);
    assert.match(empty.error, /Nessun partecipante connesso disponibile/);
    const first = await connect(2);
    const second = await connect(2);
    assert.equal((await second.emitWithAck('identify', 2)).ok, true);
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