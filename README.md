# 30°: il viaggio comincia qui

App per scegliere insieme una destinazione, con React, globo 3D, Socket.IO e SQLite. Node.js 20.19+ oppure 22.3+ consigliato; usare Node 22 LTS per la migliore compatibilità con il modulo SQLite nativo.

## Preparazione

1. Modifica la lista `friends` in [server/seed.js](server/seed.js): assegna un ID numerico distinto, nome e percorso foto a ogni persona. Fallo prima della prima esecuzione del seed; non riutilizzare o cambiare gli ID dopo l'inizio della serata.
2. Metti le foto in `client/public/avatars/`, con i nomi indicati nel seed, ad esempio `client/public/avatars/marco.jpg`. Se una foto manca, l'app mostra le iniziali.
3. Dalla cartella del progetto, installa e inizializza:

```bash
npm install --prefix server
npm install --prefix client
npm run seed --prefix server
```

Il seed aggiorna gli ID indicati senza eliminare altri partecipanti o i dati esistenti. Per cambiare la composizione del gruppo dopo un seed precedente, prepara prima un database nuovo. Il database è `server/serata.db` e contiene anche fase corrente e voti. Per iniziare una nuova serata, arresta il server, conserva eventualmente una copia del database e dei suoi file `-wal` e `-shm`, quindi elimina quei file e rilancia il seed: questa operazione cancella la serata precedente.

## Avvio in LAN

Apri due terminali nella cartella del progetto:

```bash
npm start --prefix server
```

```bash
npm run dev --prefix client
```

Su macOS trova l'IP Wi-Fi con:

```bash
ipconfig getifaddr en0
```

Se non restituisce nulla, verifica l'interfaccia Wi-Fi in Impostazioni di Sistema > Rete. Su Windows usa `ipconfig`; su Linux `hostname -I`. Condividi `http://IP-WIFI:5173`, ad esempio `http://192.168.1.12:5173`. Tutti devono essere sulla stessa rete Wi-Fi. Se la porta 5173 è occupata, usa quella mostrata da Vite. Consenti a Node.js le connessioni in ingresso nel firewall e disattiva l'isolamento tra client sul router se necessario. Il server ascolta sulla porta 3001; il proxy Vite inoltra automaticamente le connessioni Socket.IO, quindi non serve configurare l'IP nel codice.

La ricerca delle città usa Open-Meteo e richiede Internet. Il globo genera la propria texture dai confini geografici locali; i font sono caricati da Google Fonts, con alternative di sistema disponibili offline. Il continente suggerito è approssimativo e può essere corretto nel menu. L'estrazione sceglie solo fra i partecipanti online che non hanno ancora presentato.

L'identità è basata sulla sola scelta del profilo: chiunque sulla rete può impersonare un partecipante. I voti non vengono inviati agli altri profili prima della classifica, ma questa non è autenticazione sicura. Usare solo su una rete fidata. Per svelare la classifica devono votare tutti i partecipanti nel seed, anche quelli offline; chiunque può avviare le fasi e chiudere il reveal.

## Verifica

```bash
npm test --prefix server
npm run build --prefix client
```

I dati dei confini provengono da [geo-countries](https://github.com/datasets/geo-countries); l'immagine nella schermata iniziale dagli esempi di [three-globe](https://github.com/vasturiano/three-globe).