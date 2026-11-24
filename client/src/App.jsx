import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import GlobeView from './GlobeMap.jsx';
import { io } from 'socket.io-client';
import { ArrowDown, ArrowRight, Check, ChevronRight, Compass, Globe2, LoaderCircle, MapPin, Plus, Search, Shuffle, Sparkles, Star, Trash2, Trophy, Users, Volume2, VolumeX, X } from 'lucide-react';

const socket = io({ autoConnect: false });
const SESSION_STORAGE_KEY = '30anni-session-id';
const continents = ['Europa', 'Asia', 'Africa', 'Nord America', 'Sud America', 'Oceania', 'Antartide'];
const flag = code => code?.length === 2 ? String.fromCodePoint(...code.toUpperCase().split('').map(letter => 127397 + letter.charCodeAt(0))) : '🌍';
const initials = name => name?.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();

function Avatar({ user, size = 'normal', online = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user?.avatarUrl]);
  return <span className={`avatar avatar-${size}`} title={user?.name}>{!failed && user?.avatarUrl ? <img src={user.avatarUrl} alt={user.name} onError={() => setFailed(true)} /> : <span>{initials(user?.name)}</span>}{online && user?.online && <i className="online-dot" />}</span>;
}

function startWalkoutMusic(context) {
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const output = context.createGain();
  master.gain.value = 0.24;
  output.gain.value = 1.7;
  compressor.threshold.value = -14;
  compressor.knee.value = 16;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.2;
  master.connect(compressor).connect(output).connect(context.destination);

  const progression = [
    [146.83, 185, 220, 293.66],
    [123.47, 146.83, 185, 246.94],
    [98, 123.47, 146.83, 196],
    [110, 138.59, 164.81, 220]
  ];
  const arpeggio = [0, 2, 1, 3, 2, 1, 3, 2];
  const beatDuration = 60 / 136;
  const stepDuration = beatDuration / 2;
  const barDuration = beatDuration * 4;
  let step = 0;
  let nextTime = context.currentTime + 0.08;
  let intensity = 0;
  let previousStage = -1;

  function envelope(when, duration, peak, release = 0.0001) {
    const gain = context.createGain();
    const attack = Math.min(0.025, duration * 0.22);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(release, 0.0001), when + duration);
    gain.connect(master);
    return gain;
  }

  function note(frequency, when, duration, peak, type = 'triangle', detune = 0) {
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(type === 'sawtooth' ? 1900 : 3200, when);
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, when);
    oscillator.detune.setValueAtTime(detune, when);
    oscillator.connect(filter).connect(envelope(when, duration, peak));
    oscillator.start(when);
    oscillator.stop(when + duration + 0.03);
  }

  function kick(when) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(170, when);
    oscillator.frequency.exponentialRampToValueAtTime(44, when + 0.17);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.62, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.24);
    oscillator.connect(gain).connect(master);
    oscillator.start(when);
    oscillator.stop(when + 0.3);
  }

  function noiseHit(when, duration, peak, cutoff) {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(cutoff, when);
    source.connect(filter).connect(envelope(when, duration, peak));
    source.start(when);
    source.stop(when + duration + 0.02);
  }

  function scheduleStep() {
    const currentStep = step % 8;
    const bar = Math.floor(step / 8) % progression.length;
    const chord = progression[bar];
    const beat = currentStep / 2;
    if (currentStep % 2 === 0) kick(nextTime);
    if (currentStep === 2 || currentStep === 6) noiseHit(nextTime, 0.24, 0.22 * intensity, 1250);
    noiseHit(nextTime, currentStep % 2 === 0 ? 0.045 : 0.025, (0.025 + intensity * 0.035) * (currentStep % 2 === 0 ? 1 : 0.72), 7200);
    if (currentStep === 0) {
      for (const frequency of chord) {
        note(frequency, nextTime, barDuration * 0.93, 0.065 * intensity, 'sawtooth', -5);
        note(frequency * 2, nextTime, barDuration * 0.88, 0.025 * intensity, 'sawtooth', 5);
      }
    }
    const pitch = chord[arpeggio[beat] % chord.length] * 2;
    note(pitch, nextTime, 0.18, 0.1 + 0.12 * intensity, 'triangle');
    if (currentStep % 2 === 0) note(chord[0] / 2, nextTime, 0.34, 0.18 + 0.16 * intensity, 'sawtooth');
    step++;
    nextTime += stepDuration;
  }

  function riser() {
    const duration = 1.7;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = (Math.random() * 2 - 1) * (index / samples.length);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const start = context.currentTime;
    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(180, start);
    filter.frequency.exponentialRampToValueAtTime(8500, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.2, start + duration * 0.88);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  const scheduler = window.setInterval(() => {
    while (nextTime < context.currentTime + 0.12) scheduleStep();
  }, 25);

  return {
    setIntensity(stage) {
      intensity = [0.52, 0.72, 0.9, 1][stage] ?? 0.52;
      master.gain.setTargetAtTime(0.78 + intensity * 0.22, context.currentTime, 0.28);
      if (stage === 1 || stage === 3 || previousStage === 3 && stage === 0) riser();
      previousStage = stage;
    },
    stop() {
      window.clearInterval(scheduler);
      master.gain.setTargetAtTime(0.0001, context.currentTime, 0.08);
      window.setTimeout(() => { master.disconnect(); compressor.disconnect(); output.disconnect(); }, 500);
    }
  };
}

export default function App() {
  const [state, setState] = useState(null);
  const [userId, setUserId] = useState(() => Number(localStorage.getItem('30anni-user')) || null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const identifiedSocketRef = useRef(null);
  useEffect(() => {
    function connect() {
      setConnected(true);
      identifiedSocketRef.current = null;
    }
    function disconnect() { setConnected(false); }
    function receiveState(nextState) {
      const savedUser = Number(localStorage.getItem('30anni-user')) || null;
      const savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
      const staleProfile = savedUser && (!savedSession || savedSession !== nextState.sessionId);
      if (staleProfile) {
        localStorage.removeItem('30anni-user');
        setUserId(null);
      }
      localStorage.setItem(SESSION_STORAGE_KEY, nextState.sessionId);
      setState(nextState);
      if (savedUser && !staleProfile && identifiedSocketRef.current !== socket.id) {
        identifiedSocketRef.current = socket.id;
        socket.emit('identify', savedUser, response => {
          if (!response?.ok) { localStorage.removeItem('30anni-user'); setUserId(null); }
        });
      }
    }
    socket.on('connect', connect); socket.on('disconnect', disconnect); socket.on('state', receiveState); socket.on('drawCancelled', setError); socket.connect();
    if (socket.connected) connect();
    return () => { socket.off('connect', connect); socket.off('disconnect', disconnect); socket.off('state', receiveState); socket.off('drawCancelled', setError); socket.disconnect(); };
  }, []);
  function chooseUser(id) { localStorage.setItem('30anni-user', id); localStorage.setItem(SESSION_STORAGE_KEY, state.sessionId); setUserId(id); socket.emit('identify', id); }
  function resetProfile() { localStorage.removeItem('30anni-user'); setUserId(null); socket.emit('unidentify'); }
  function send(event, payload = {}) { socket.emit(event, payload, response => { if (!response?.ok) setError(response?.error || 'Operazione non riuscita.'); }); }
  const user = state?.users.find(item => item.id === userId);
  const speaker = state?.users.find(item => item.id === state.speakerId);
  const revealDestinations = state?.speakerDestinations || [];
  return <div className={`app-shell${user?.id === 1 ? ' is-coordinator' : ''}`}>
    <header className="topbar"><a className="brand" href="/" aria-label="Trenta, pagina iniziale"><span className="brand-mark">30<span>°</span></span><span className="brand-divider" /><span className="brand-sub">IL VIAGGIO<br />COMINCIA QUI</span></a><div className="header-right"><span className={`connection ${connected ? '' : 'disconnected'}`}><span />{connected ? 'LIVE' : 'RICONNESSIONE'}</span>{user && <><span className="header-user"><Avatar user={user} size="small" /><span>{user.name}</span></span><button className="change-user" onClick={resetProfile} title="Dimentica il profilo salvato su questo telefono">Resetta profilo</button></>}</div></header>
    {error && <div className="toast" role="alert">{error}<button onClick={() => setError('')} aria-label="Chiudi"><X size={16} /></button></div>}
    {!state ? <div className="loading"><LoaderCircle className="spin" /> Connessione alla serata...</div> : !user ? <UserSelector users={state.users} onSelect={chooseUser} /> : <>
      {['lobby', 'roulette', 'selection', 'reveal'].includes(state.phase) && <LobbyAndGlobe state={state} user={user} send={send} />}
      {state.phase === 'selection' && <div className="overlay backdrop"><motion.div className="modal" initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }}>{speaker?.id === user.id ? <DestinationPicker onSubmit={destinations => send('propose', { destinations })} /> : <div className="waiting"><div className="eyebrow"><span className="tiny-dot" /> IL PROSSIMO CAPITOLO</div><Avatar user={speaker} size="large" /><h2>La scelta è nelle<br />mani di {speaker?.name}.</h2><p>Sta scegliendo le sue destinazioni. Il mondo aspetta insieme a noi.</p><div className="waiting-indicator"><span /><span /><span /></div></div>}</motion.div></div>}
      {state.phase === 'roulette' && <Roulette state={state} />}
      {state.phase === 'reveal' && revealDestinations.length > 0 && <FifaWalkout state={state} destinations={revealDestinations} speaker={speaker} canControl={user.id === 1} onFinish={() => send('finishReveal')} />}
      {state.phase === 'voting' && <VotingView state={state} send={send} canControl={user.id === 1} />}
      {state.phase === 'results' && <Leaderboard state={state} />}
    </>}
  </div>;
}

function UserSelector({ users, onSelect }) {
  return <main className="selector-page"><div className="selector-intro"><div className="eyebrow"><span className="tiny-dot" /> UNA SERATA, MILLE POSSIBILITÀ</div><h1>Il prossimo viaggio<br /><em>inizia da noi.</em></h1><p>Un gruppo di amici, un mondo da esplorare e una destinazione da scegliere insieme.</p><div className="intro-foot"><span>30° COMPLEANNO</span><span> / </span><span>EDIZIONE SPECIALE</span></div></div><section className="selector-panel"><div className="section-index">01 / SI PARTE</div><h2>Tu chi sei?</h2><p>Scegli il tuo profilo per entrare nella serata.</p><div className="user-grid">{users.map(user => <button className="user-choice" key={user.id} onClick={() => onSelect(user.id)}><Avatar user={user} size="large" online /><span>{user.name}</span><ChevronRight size={16} /></button>)}</div><div className="selector-note"><Compass size={17} /> LA DESTINAZIONE È ANCORA DA SCRIVERE</div></section></main>;
}

function LobbyAndGlobe({ state, user, send }) {
  const allPresented = state.users.every(item => item.presented);
  return <main className="lobby"><section className="globe-section"><div className="globe-heading"><div><div className="eyebrow"><span className="tiny-dot" /> LA NOSTRA MAPPA</div><h1>Il mondo è<br /><em>tutto nostro.</em></h1><p>Un compleanno importante. Un viaggio da decidere insieme.</p></div><div className="coordinates">IL MONDO CI ASPETTA<br /><strong>01 — 30°</strong></div></div><GlobeView destinations={state.destinations} /><div className="globe-bottom"><div className="map-hint"><span className="hint-icon"><Globe2 size={17} /></span><span>ESPLORA IL MONDO<br /><strong>Trascina per ruotare</strong></span></div><div className="map-counter"><strong>{String(state.destinations.length).padStart(2, '0')}</strong><span>METE<br />SULLA MAPPA</span></div></div></section><aside className="lobby-sidebar"><div className="side-top"><div className="eyebrow"><span className="tiny-dot" /> LA SERATA È INIZIATA</div><h2>La nostra<br />prossima storia<span className="accent">.</span></h2><p>Una persona alla volta, un'idea alla volta. Scopriamo dove ci porteranno i nostri 30 anni.</p></div><div className="progress-block"><div className="progress-label"><span>LE PRESENTAZIONI</span><strong>{state.users.filter(item => item.presented).length} <span>/ {state.users.length}</span></strong></div><div className="progress-track"><span style={{ width: `${state.users.length ? state.users.filter(item => item.presented).length / state.users.length * 100 : 0}%` }} /></div></div><div className="participant-header"><span>IL GRUPPO</span><span>{state.users.filter(item => item.online).length} ONLINE</span></div><div className="participant-list">{state.users.map(item => <div className="participant" key={item.id}><Avatar user={item} online /><div><strong>{item.name}{item.id === user.id && <span className="you"> · TU</span>}</strong><small>{item.online ? 'Online' : 'Offline'}</small></div>{item.presented && <span className="presented"><Check size={12} /> PRESENTATO</span>}</div>)}</div><div className="side-actions"><button className="primary-button" onClick={() => send('draw')} disabled={allPresented || state.phase !== 'lobby'}><Shuffle size={17} />{allPresented ? 'Tutti hanno presentato' : 'Estrai prossimo relatore'}<ArrowRight size={17} /></button><button className="text-button" onClick={() => send('startVoting')} disabled={!state.destinations.length || state.phase !== 'lobby'}>Passa alle votazioni <ArrowRight size={15} /></button></div></aside></main>;
}

function Roulette({ state }) {
  const [now, setNow] = useState(Date.now()); const offset = useRef(state.serverNow - Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 110); return () => clearInterval(timer); }, []);
  const elapsed = Math.max(0, now + offset.current - state.rouletteStartedAt);
  const eligible = state.users.filter(user => state.rouletteCandidateIds?.includes(user.id));
  const candidate = elapsed >= 2700 ? state.users.find(user => user.id === state.speakerId) : eligible[Math.floor(elapsed / 110) % eligible.length];
  return <div className="overlay roulette"><motion.div initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} className="roulette-content"><div className="eyebrow"><span className="tiny-dot" /> IL DESTINO DECIDE</div><h2>Chi ci porta<br /><em>lontano?</em></h2><div className="roulette-avatar"><Avatar user={candidate} size="huge" /></div><div className="roulette-name">{candidate?.name}</div><p>ESTRAZIONE IN CORSO</p></motion.div></div>;
}

function guessContinent(latitude, longitude) {
  if (latitude < -60) return 'Antartide'; if (longitude >= 110 && latitude < 0) return 'Oceania'; if (longitude < -30) return latitude < 12 ? 'Sud America' : 'Nord America'; if (longitude >= -20 && longitude < 55 && latitude < 35) return 'Africa'; if (longitude >= 40) return 'Asia'; return 'Europa';
}
function DestinationPicker({ onSubmit }) {
  const [query, setQuery] = useState(''); const [results, setResults] = useState([]); const [selected, setSelected] = useState(null); const [continent, setContinent] = useState('Europa'); const [picked, setPicked] = useState([]); const [loading, setLoading] = useState(false); const [searchError, setSearchError] = useState('');
  useEffect(() => {
    if (query.trim().length < 2 || selected) { setResults([]); setLoading(false); return; }
    const controller = new AbortController(); const timer = setTimeout(async () => {
      setLoading(true); setSearchError('');
      try { const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=8&language=it&format=json`, { signal: controller.signal }); if (!response.ok) throw new Error(); const data = await response.json(); setResults((data.results || []).filter(item => item.country_code)); }
      catch (error) { if (error.name !== 'AbortError') setSearchError('Ricerca non disponibile. Controlla la connessione internet.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 350); return () => { clearTimeout(timer); controller.abort(); };
  }, [query, selected]);
  function select(item) { setSelected(item); setQuery(item.name); setContinent(guessContinent(item.latitude, item.longitude)); }
  function addDestination() {
    if (!selected) return;
    const key = `${selected.name.trim().normalize('NFKC').toLocaleLowerCase('it-IT').replace(/\s+/g, ' ')}|${selected.country_code.toUpperCase()}`;
    if (picked.some(destination => destination.key === key)) { setSearchError('Hai già aggiunto questa città e questo Paese.'); return; }
    setPicked(current => [...current, { key, city: selected.name, country: selected.country, countryCode: selected.country_code, continent, latitude: selected.latitude, longitude: selected.longitude }]);
    setSelected(null); setQuery(''); setSearchError('');
  }
  return <div className="picker"><div className="eyebrow"><span className="tiny-dot" /> TOCCA A TE</div><h2>Le tue mete</h2><p>Cerca e aggiungi tutte le destinazioni che vuoi presentare. Almeno una è necessaria.</p><label htmlFor="city-search">AGGIUNGI UNA DESTINAZIONE</label><div className="search-box"><Search size={20} /><input id="city-search" autoFocus placeholder="Cerca una città..." value={query} onChange={event => { setSelected(null); setSearchError(''); setQuery(event.target.value); }} />{loading && <LoaderCircle className="spin" size={18} />}</div>{searchError && <p className="form-error">{searchError}</p>}{results.length > 0 && <div className="search-results">{results.map(item => <button key={item.id} onClick={() => select(item)}><MapPin size={16} /><span><strong>{item.name}</strong><small>{[item.admin1, item.country].filter(Boolean).join(', ')}</small></span><span>{flag(item.country_code)}</span></button>)}</div>}{selected && <><div className="selected-destination"><span>{flag(selected.country_code)}</span><div><strong>{selected.name}</strong><small>{selected.country}</small></div><Check size={18} /></div><label htmlFor="continent">CONTINENTE</label><select id="continent" value={continent} onChange={event => setContinent(event.target.value)}>{continents.map(item => <option key={item}>{item}</option>)}</select><button className="add-destination-button" onClick={addDestination}><Plus size={16} /> Aggiungi questa meta</button></>}{picked.length > 0 && <section className="picked-list"><div className="picked-heading">METE AGGIUNTE <strong>{picked.length}</strong></div>{picked.map((destination, index) => <div className="picked-item" key={destination.key}><span className="picked-index">{String(index + 1).padStart(2, '0')}</span><span className="picked-flag">{flag(destination.countryCode)}</span><span className="picked-name"><strong>{destination.city}</strong><small>{destination.country}</small></span><button aria-label={`Rimuovi ${destination.city}`} onClick={() => setPicked(current => current.filter(item => item.key !== destination.key))}><Trash2 size={16} /></button></div>)}</section>}<button className="primary-button" disabled={picked.length === 0} onClick={() => onSubmit(picked.map(({ key, ...destination }) => destination))}><Sparkles size={18} /> Lancia presentazione · {picked.length} {picked.length === 1 ? 'meta' : 'mete'} <ArrowRight size={18} /></button></div>;
}

function FifaWalkout({ state, destinations, speaker, canControl, onFinish }) {
  const [now, setNow] = useState(Date.now()); const offset = useRef(state.serverNow - Date.now());
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioContextRef = useRef(null);
  const musicRef = useRef(null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer); }, []);
  useEffect(() => () => { musicRef.current?.stop(); audioContextRef.current?.close(); }, []);
  const elapsed = Math.max(0, now + offset.current - state.revealStartedAt);
  const slideDuration = 20000;
  const slideIndex = Math.min(Math.floor(elapsed / slideDuration), destinations.length - 1);
  const slideElapsed = Math.max(0, elapsed - slideIndex * slideDuration);
  const stage = slideElapsed < 5000 ? 0 : slideElapsed < 10000 ? 1 : slideElapsed < 15000 ? 2 : 3;
  const destination = destinations[slideIndex];
  const isComplete = elapsed >= destinations.length * slideDuration;
  useEffect(() => {
    musicRef.current?.setIntensity(stage);
  }, [slideIndex, stage]);

  async function toggleAudio() {
    if (audioEnabled) {
      musicRef.current?.stop();
      musicRef.current = null;
      await audioContextRef.current?.close();
      audioContextRef.current = null;
      setAudioEnabled(false);
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    await context.resume();
    audioContextRef.current = context;
    musicRef.current = startWalkoutMusic(context);
    musicRef.current.setIntensity(stage);
    setAudioEnabled(true);
  }

  return <div className={`overlay walkout walkout-stage-${stage}`}><div className="walkout-rays" /><div className="walkout-lines" /><motion.div key={`${slideIndex}-${stage}`} className="walkout-flash" initial={{ opacity: 0.8 }} animate={{ opacity: 0 }} transition={{ duration: 0.9 }} /><div className="walkout-index" aria-hidden="true">{String(slideIndex + 1).padStart(2, '0')}</div><div className="walkout-top"><span>30° / LA GRANDE SCELTA</span><div className="walkout-controls"><span>META {slideIndex + 1} / {destinations.length}</span><button className="walkout-audio" onClick={toggleAudio} aria-label={audioEnabled ? 'Disattiva musica' : 'Attiva musica'} title={audioEnabled ? 'Disattiva musica' : 'Attiva musica'}>{audioEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}<span>{audioEnabled ? 'MUSICA ON' : 'ATTIVA MUSICA'}</span></button></div></div><AnimatePresence mode="wait"><motion.div key={`${slideIndex}-${stage}`} className="walkout-content" initial={{ opacity: 0, y: 50, scale: .82, filter: 'blur(12px)' }} animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -30, scale: 1.08, filter: 'blur(8px)' }} transition={{ duration: .72, ease: [0.16, 1, 0.3, 1] }}>
    {stage === 0 && <><div className="walkout-kicker">IL PROSSIMO VIAGGIO CI PORTA IN</div><div className="walkout-title">{destination.continent}</div></>}
    {stage === 1 && <><div className="walkout-kicker">LA PROPOSTA DI</div><div className="speaker-card"><Avatar user={speaker} size="huge" /><strong>{speaker?.name}</strong><span>IL NOSTRO ESPLORATORE</span></div></>}
    {stage === 2 && <><div className="walkout-kicker">PREPARATE LE VALIGIE PER</div><div className="walkout-flag">{flag(destination.countryCode)}</div><div className="walkout-title">{destination.country}</div></>}
    {stage === 3 && <><div className="walkout-kicker">LA DESTINAZIONE È</div><div className="walkout-city">{destination.city}</div><div className="walkout-country">{flag(destination.countryCode)} &nbsp; {destination.country} &nbsp; / &nbsp; {destination.continent}</div>{isComplete && canControl && <button className="primary-button" onClick={onFinish}>Vai al mappamondo <ArrowRight size={18} /></button>}{isComplete && !canControl && <p className="wait-coordinator">In attesa del coordinatore...</p>}</>}
  </motion.div></AnimatePresence><div className="walkout-bottom"><span>IL MONDO CI ASPETTA</span><span>✦</span><span>30 ANNI INSIEME</span></div></div>;
}

function VotingView({ state, send, canControl }) {
  const complete = state.destinations.every(item => state.ownVotes[item.key]);
  return <main className="content-page"><div className="page-heading"><div><div className="eyebrow"><span className="tiny-dot" /> IL MOMENTO DELLA VERITÀ</div><h1>La scelta è<br /><em>nelle tue mani.</em></h1><p>Una stella o cinque? Dai un voto a ogni destinazione.</p></div><div className="vote-status"><Users size={20} /><strong>{state.completed}<span> / {state.users.length}</span></strong><small>HANNO VOTATO</small></div></div><div className="list-heading"><span>LE DESTINAZIONI</span><span>IL TUO VOTO</span></div><div className="destination-list">{state.destinations.map((destination, index) => <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .06 }} className="destination-row" key={destination.key}><div className="destination-number">{String(index + 1).padStart(2, '0')}</div><div className="destination-info"><h2>{destination.city} <span>{flag(destination.countryCode)}</span></h2><p>{destination.country} <span> / </span> {destination.continent}</p><div className="proposed-by"><div className="avatar-stack">{destination.proposers.map(proposer => <Avatar key={proposer.id} user={proposer} size="small" />)}</div><span>PROPOSTA DA {destination.proposers.map(proposer => proposer.name.toUpperCase()).join(' E ')}</span></div></div><div className="stars" role="group" aria-label={`Voto per ${destination.city}`}>{[1, 2, 3, 4, 5].map(star => <button key={star} aria-label={`${star} ${star === 1 ? 'stella' : 'stelle'}`} aria-pressed={state.ownVotes[destination.key] === star} onClick={() => send('vote', { key: destination.key, stars: star })}><Star size={26} fill={star <= (state.ownVotes[destination.key] || 0) ? 'currentColor' : 'none'} /></button>)}</div></motion.div>)}</div><div className="voting-footer"><p>{complete ? 'Hai votato tutte le mete. Puoi cambiare idea fino alla chiusura.' : 'I tuoi voti rimarranno segreti fino alla classifica.'}</p>{canControl && <button className="primary-button" disabled={state.completed !== state.users.length} onClick={() => send('showResults')}><Trophy size={18} /> Svela classifica finale <ArrowRight size={18} /></button>}</div></main>;
}

function Leaderboard({ state }) {
  return <><section className="content-page podium-intro">
    <div className="result-hero">
      <div className="page-heading"><div><div className="eyebrow"><span className="tiny-dot" /> IL VERDETTO È ARRIVATO</div><h1>Il prossimo capitolo<br /><em>si chiama {state.ranking[0]?.city}.</em></h1><p>Avete scelto insieme. Ora non resta che partire.</p></div></div>
      <div className="result-globe"><GlobeView destinations={[...state.ranking].reverse()} /></div>
    </div>
    <div className="podium">{[1, 0, 2].map(position => { const destination = state.ranking[position]; return destination ? <motion.div className={`podium-place place-${position + 1}`} key={destination.key} initial={{ opacity: 0, y: 35 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: position * .15, duration: .6 }}><span className="podium-flag">{flag(destination.countryCode)}</span><strong>{destination.city}</strong><span className="podium-score"><Star size={13} fill="currentColor" /> {destination.average.toFixed(1)}</span><div className="podium-step">{position + 1}</div></motion.div> : <div key={position} />; })}</div>
  </section><LeaderboardDetails state={state} /></>;
}

function LeaderboardDetails({ state }) {
  return <main className="content-page results-page"><div className="page-heading"><div><div className="eyebrow"><span className="tiny-dot" /> IL VERDETTO È ARRIVATO</div><h1>Il prossimo capitolo<br /><em>si chiama {state.ranking[0]?.city}.</em></h1><p>Avete scelto insieme. Ora non resta che partire.</p></div><div className="result-icon"><Trophy size={32} /></div></div><div className="list-heading"><span>LA CLASSIFICA FINALE</span><span>VOTO MEDIO</span></div><div className="ranking-list">{state.ranking.map((destination, index) => <motion.div key={destination.key} initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .12 }} className={`ranking-row ${index === 0 ? 'winner' : ''}`}><div className="rank">{String(index + 1).padStart(2, '0')}<small>{index === 0 ? ' / PRIMO POSTO' : index === 1 ? ' / SECONDO POSTO' : index === 2 ? ' / TERZO POSTO' : ''}</small></div><div className="rank-destination"><h2>{destination.city} <span>{flag(destination.countryCode)}</span></h2><p>{destination.country} · proposta da {destination.proposers.map(person => person.name).join(' e ')}</p><div className="vote-details">{destination.votes.map((vote, voteIndex) => <span key={voteIndex}>{vote.user} <Star size={12} fill="currentColor" /> {vote.stars}</span>)}</div></div><div className="rank-score"><Star fill="currentColor" size={17} /><strong>{destination.average.toFixed(1)}</strong><span>/ 5</span></div></motion.div>)}</div><div className="closing-line">IL VIAGGIO COMINCIA ADESSO <ArrowDown size={16} /></div></main>;
}