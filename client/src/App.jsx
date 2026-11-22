import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import GlobeView from './GlobeMap.jsx';
import { io } from 'socket.io-client';
import { ArrowDown, ArrowRight, Check, ChevronRight, Compass, Globe2, LoaderCircle, MapPin, Search, Shuffle, Sparkles, Star, Trophy, Users, X } from 'lucide-react';

const socket = io({ autoConnect: false });
const continents = ['Europa', 'Asia', 'Africa', 'Nord America', 'Sud America', 'Oceania', 'Antartide'];
const flag = code => code?.length === 2 ? String.fromCodePoint(...code.toUpperCase().split('').map(letter => 127397 + letter.charCodeAt(0))) : '🌍';
const initials = name => name?.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();

function Avatar({ user, size = 'normal', online = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user?.avatarUrl]);
  return <span className={`avatar avatar-${size}`} title={user?.name}>{!failed && user?.avatarUrl ? <img src={user.avatarUrl} alt={user.name} onError={() => setFailed(true)} /> : <span>{initials(user?.name)}</span>}{online && user?.online && <i className="online-dot" />}</span>;
}

export default function App() {
  const [state, setState] = useState(null);
  const [userId, setUserId] = useState(() => Number(localStorage.getItem('30anni-user')) || null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    function connect() {
      setConnected(true);
      if (userId) socket.emit('identify', userId, response => { if (!response?.ok) { localStorage.removeItem('30anni-user'); setUserId(null); } });
    }
    function disconnect() { setConnected(false); }
    socket.on('connect', connect); socket.on('disconnect', disconnect); socket.on('state', setState); socket.on('drawCancelled', setError); socket.connect();
    if (socket.connected) connect();
    return () => { socket.off('connect', connect); socket.off('disconnect', disconnect); socket.off('state', setState); socket.off('drawCancelled', setError); socket.disconnect(); };
  }, [userId]);
  function chooseUser(id) { localStorage.setItem('30anni-user', id); setUserId(id); }
  function changeUser() { localStorage.removeItem('30anni-user'); setUserId(null); }
  function send(event, payload = {}) { socket.emit(event, payload, response => { if (!response?.ok) setError(response?.error || 'Operazione non riuscita.'); }); }
  const user = state?.users.find(item => item.id === userId);
  const speaker = state?.users.find(item => item.id === state.speakerId);
  const revealDestination = state?.destinations.find(item => item.proposers.some(proposer => proposer.id === state.speakerId));
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Trenta, pagina iniziale"><span className="brand-mark">30<span>°</span></span><span className="brand-divider" /><span className="brand-sub">IL VIAGGIO<br />COMINCIA QUI</span></a><div className="header-right"><span className={`connection ${connected ? '' : 'disconnected'}`}><span />{connected ? 'LIVE' : 'RICONNESSIONE'}</span>{user && <><span className="header-user"><Avatar user={user} size="small" /><span>{user.name}</span></span><button className="change-user" onClick={changeUser}>Cambia utente</button></>}</div></header>
    {error && <div className="toast" role="alert">{error}<button onClick={() => setError('')} aria-label="Chiudi"><X size={16} /></button></div>}
    {!state ? <div className="loading"><LoaderCircle className="spin" /> Connessione alla serata...</div> : !user ? <UserSelector users={state.users} onSelect={chooseUser} /> : <>
      {['lobby', 'roulette', 'selection', 'reveal'].includes(state.phase) && <LobbyAndGlobe state={state} user={user} send={send} />}
      {state.phase === 'selection' && <div className="overlay backdrop"><motion.div className="modal" initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }}>{speaker?.id === user.id ? <DestinationPicker onSubmit={destination => send('propose', destination)} /> : <div className="waiting"><div className="eyebrow"><span className="tiny-dot" /> IL PROSSIMO CAPITOLO</div><Avatar user={speaker} size="large" /><h2>La scelta è nelle<br />mani di {speaker?.name}.</h2><p>Sta scegliendo la sua destinazione. Il mondo aspetta insieme a noi.</p><div className="waiting-indicator"><span /><span /><span /></div></div>}</motion.div></div>}
      {state.phase === 'roulette' && <Roulette state={state} />}
      {state.phase === 'reveal' && revealDestination && <FifaWalkout state={state} destination={revealDestination} speaker={speaker} onFinish={() => send('finishReveal')} />}
      {state.phase === 'voting' && <VotingView state={state} send={send} />}
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
  const [query, setQuery] = useState(''); const [results, setResults] = useState([]); const [selected, setSelected] = useState(null); const [continent, setContinent] = useState('Europa'); const [loading, setLoading] = useState(false); const [searchError, setSearchError] = useState('');
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
  return <div className="picker"><div className="eyebrow"><span className="tiny-dot" /> TOCCA A TE</div><h2>Dove andiamo?</h2><p>Hai il mondo a disposizione. Scegli la tua meta e preparati a svelarla.</p><label htmlFor="city-search">LA TUA DESTINAZIONE</label><div className="search-box"><Search size={20} /><input id="city-search" autoFocus placeholder="Cerca una città..." value={query} onChange={event => { setSelected(null); setQuery(event.target.value); }} />{loading && <LoaderCircle className="spin" size={18} />}</div>{searchError && <p className="form-error">{searchError}</p>}{results.length > 0 && <div className="search-results">{results.map(item => <button key={item.id} onClick={() => select(item)}><MapPin size={16} /><span><strong>{item.name}</strong><small>{[item.admin1, item.country].filter(Boolean).join(', ')}</small></span><span>{flag(item.country_code)}</span></button>)}</div>}{selected && <div className="selected-destination"><span>{flag(selected.country_code)}</span><div><strong>{selected.name}</strong><small>{selected.country}</small></div><Check size={18} /></div>}<label htmlFor="continent">CONTINENTE</label><select id="continent" value={continent} onChange={event => setContinent(event.target.value)}>{continents.map(item => <option key={item}>{item}</option>)}</select><button className="primary-button" disabled={!selected} onClick={() => onSubmit({ city: selected.name, country: selected.country, countryCode: selected.country_code, continent, latitude: selected.latitude, longitude: selected.longitude })}><Sparkles size={18} /> Lancia presentazione! <ArrowRight size={18} /></button></div>;
}

function FifaWalkout({ state, destination, speaker, onFinish }) {
  const [now, setNow] = useState(Date.now()); const offset = useRef(state.serverNow - Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer); }, []);
  const elapsed = Math.max(0, now + offset.current - state.revealStartedAt); const stage = elapsed < 2500 ? 0 : elapsed < 5000 ? 1 : elapsed < 7500 ? 2 : 3;
  return <div className="overlay walkout"><div className="walkout-lines" /><div className="walkout-top"><span>30° / LA GRANDE SCELTA</span><span>UNA DESTINAZIONE ALLA VOLTA</span></div><AnimatePresence mode="wait"><motion.div key={stage} className="walkout-content" initial={{ opacity: 0, y: 35, scale: .94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -25, scale: 1.03 }} transition={{ duration: .5 }}>
    {stage === 0 && <><div className="walkout-kicker">IL PROSSIMO VIAGGIO CI PORTA IN</div><div className="walkout-title">{destination.continent}</div></>}
    {stage === 1 && <><div className="walkout-kicker">LA PROPOSTA DI</div><div className="speaker-card"><Avatar user={speaker} size="huge" /><strong>{speaker?.name}</strong><span>IL NOSTRO ESPLORATORE</span></div></>}
    {stage === 2 && <><div className="walkout-kicker">PREPARATE LE VALIGIE PER</div><div className="walkout-flag">{flag(destination.countryCode)}</div><div className="walkout-title">{destination.country}</div></>}
    {stage === 3 && <><div className="walkout-kicker">LA DESTINAZIONE È</div><div className="walkout-city">{destination.city}</div><div className="walkout-country">{flag(destination.countryCode)} &nbsp; {destination.country} &nbsp; / &nbsp; {destination.continent}</div><button className="primary-button" onClick={onFinish}>Vai al mappamondo <ArrowRight size={18} /></button></>}
  </motion.div></AnimatePresence><div className="walkout-bottom"><span>IL MONDO CI ASPETTA</span><span>✦</span><span>30 ANNI INSIEME</span></div></div>;
}

function VotingView({ state, send }) {
  const complete = state.destinations.every(item => state.ownVotes[item.key]);
  return <main className="content-page"><div className="page-heading"><div><div className="eyebrow"><span className="tiny-dot" /> IL MOMENTO DELLA VERITÀ</div><h1>La scelta è<br /><em>nelle tue mani.</em></h1><p>Una stella o cinque? Dai un voto a ogni destinazione.</p></div><div className="vote-status"><Users size={20} /><strong>{state.completed}<span> / {state.users.length}</span></strong><small>HANNO VOTATO</small></div></div><div className="list-heading"><span>LE DESTINAZIONI</span><span>IL TUO VOTO</span></div><div className="destination-list">{state.destinations.map((destination, index) => <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .06 }} className="destination-row" key={destination.key}><div className="destination-number">{String(index + 1).padStart(2, '0')}</div><div className="destination-info"><h2>{destination.city} <span>{flag(destination.countryCode)}</span></h2><p>{destination.country} <span> / </span> {destination.continent}</p><div className="proposed-by"><div className="avatar-stack">{destination.proposers.map(proposer => <Avatar key={proposer.id} user={proposer} size="small" />)}</div><span>PROPOSTA DA {destination.proposers.map(proposer => proposer.name.toUpperCase()).join(' E ')}</span></div></div><div className="stars" role="group" aria-label={`Voto per ${destination.city}`}>{[1, 2, 3, 4, 5].map(star => <button key={star} aria-label={`${star} ${star === 1 ? 'stella' : 'stelle'}`} aria-pressed={state.ownVotes[destination.key] === star} onClick={() => send('vote', { key: destination.key, stars: star })}><Star size={26} fill={star <= (state.ownVotes[destination.key] || 0) ? 'currentColor' : 'none'} /></button>)}</div></motion.div>)}</div><div className="voting-footer"><p>{complete ? 'Hai votato tutte le mete. Puoi cambiare idea fino alla chiusura.' : 'I tuoi voti rimarranno segreti fino alla classifica.'}</p><button className="primary-button" disabled={state.completed !== state.users.length} onClick={() => send('showResults')}><Trophy size={18} /> Svela classifica finale <ArrowRight size={18} /></button></div></main>;
}

function Leaderboard({ state }) {
  return <><section className="content-page podium-intro"><div className="page-heading"><div><div className="eyebrow"><span className="tiny-dot" /> IL VERDETTO È ARRIVATO</div><h1>Il prossimo capitolo<br /><em>si chiama {state.ranking[0]?.city}.</em></h1><p>Avete scelto insieme. Ora non resta che partire.</p></div><div className="result-icon"><Trophy size={32} /></div></div><div className="podium">{[1, 0, 2].map(position => { const destination = state.ranking[position]; return destination ? <motion.div className={`podium-place place-${position + 1}`} key={destination.key} initial={{ opacity: 0, y: 35 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: position * .15, duration: .6 }}><span className="podium-flag">{flag(destination.countryCode)}</span><strong>{destination.city}</strong><span className="podium-score"><Star size={13} fill="currentColor" /> {destination.average.toFixed(1)}</span><div className="podium-step">{position + 1}</div></motion.div> : <div key={position} />; })}</div></section><LeaderboardDetails state={state} /></>;
}

function LeaderboardDetails({ state }) {
  return <main className="content-page results-page"><div className="page-heading"><div><div className="eyebrow"><span className="tiny-dot" /> IL VERDETTO È ARRIVATO</div><h1>Il prossimo capitolo<br /><em>si chiama {state.ranking[0]?.city}.</em></h1><p>Avete scelto insieme. Ora non resta che partire.</p></div><div className="result-icon"><Trophy size={32} /></div></div><div className="list-heading"><span>LA CLASSIFICA FINALE</span><span>VOTO MEDIO</span></div><div className="ranking-list">{state.ranking.map((destination, index) => <motion.div key={destination.key} initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .12 }} className={`ranking-row ${index === 0 ? 'winner' : ''}`}><div className="rank">{String(index + 1).padStart(2, '0')}<small>{index === 0 ? ' / PRIMO POSTO' : index === 1 ? ' / SECONDO POSTO' : index === 2 ? ' / TERZO POSTO' : ''}</small></div><div className="rank-destination"><h2>{destination.city} <span>{flag(destination.countryCode)}</span></h2><p>{destination.country} · proposta da {destination.proposers.map(person => person.name).join(' e ')}</p><div className="vote-details">{destination.votes.map((vote, voteIndex) => <span key={voteIndex}>{vote.user} <Star size={12} fill="currentColor" /> {vote.stars}</span>)}</div></div><div className="rank-score"><Star fill="currentColor" size={17} /><strong>{destination.average.toFixed(1)}</strong><span>/ 5</span></div></motion.div>)}</div><div className="closing-line">IL VIAGGIO COMINCIA ADESSO <ArrowDown size={16} /></div></main>;
}