# 30°: il viaggio comincia qui

App per scegliere insieme una o più destinazioni a testa, con React, globo 3D, Socket.IO e SQLite. Ogni partecipante deve proporre almeno una meta; il reveal le mostra in sequenza. Node.js 20.19+ oppure 22.3+ consigliato; usare Node 22 LTS per la migliore compatibilità con il modulo SQLite nativo.

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

Con [just](https://just.systems/) installato, dalla cartella del progetto:

```bash
just start
```

Questo avvia server e frontend e **riutilizza i dati salvati** in `server/serata.db`, senza eseguire il seed. Premi Ctrl+C per fermarli. Per avviarli in due terminali separati usa `just server` e `just client`.

Per riavviare usando uno dei backup creati da `just fresh`, ferma prima il server e passa a `just start` il nome della cartella o il percorso completo. Il database corrente viene archiviato automaticamente in `server/backups/pre-restore-...` prima del ripristino; il seed non viene eseguito.

```bash
just start serata-20261122-213000
```

È valido anche `just start server/backups/serata-20261122-213000` o `just start server/backups/serata-20261122-213000/serata.db`.

Per installare le dipendenze: `just install`. Per aggiornare i profili senza azzerare la serata: `just seed`.

Per iniziare una serata nuova: ferma prima il server, poi esegui `just fresh` e digita `RESET` alla richiesta. Il database precedente, inclusi eventuali file WAL, viene conservato in `server/backups/` prima di creare una serata vuota con i profili del seed. Il task rifiuta il reset se il server è ancora in ascolto sulla porta 3001. Quando i telefoni ricevono la nuova sessione, il profilo salvato viene cancellato e la pagina chiede di scegliere nuovamente chi si è. Il pulsante **Resetta profilo** nell'header fa lo stesso solo sul dispositivo corrente.

`just check` esegue i test backend e la build frontend; `just ip` mostra l'IP Wi-Fi macOS.

In alternativa, trova l'IP Wi-Fi manualmente con:

```bash
ipconfig getifaddr en0
```

Se non restituisce nulla, verifica l'interfaccia Wi-Fi in Impostazioni di Sistema > Rete. Su Windows usa `ipconfig`; su Linux `hostname -I`. Condividi `http://IP-WIFI:5173`, ad esempio `http://192.168.1.12:5173`. Tutti devono essere sulla stessa rete Wi-Fi. Se la porta 5173 è occupata, usa quella mostrata da Vite. Consenti a Node.js le connessioni in ingresso nel firewall e disattiva l'isolamento tra client sul router se necessario. Il server ascolta sulla porta 3001; il proxy Vite inoltra automaticamente le connessioni Socket.IO, quindi non serve configurare l'IP nel codice.

La ricerca delle città usa Open-Meteo e richiede Internet. Il globo genera la propria texture dai confini geografici locali; i font sono caricati da Google Fonts, con alternative di sistema disponibili offline. Il continente suggerito è approssimativo e può essere corretto nel menu. L'estrazione sceglie solo fra i partecipanti online che non hanno ancora presentato.

Il partecipante con ID `1` in `server/seed.js` è il coordinatore: solo il suo profilo può estrarre il prossimo relatore, passare alle votazioni, chiudere il reveal e svelare la classifica. Tutti gli altri possono presentare mete e votare.

L'identità è basata sulla sola scelta del profilo: chiunque sulla rete può impersonare un partecipante. I voti non vengono inviati agli altri profili prima della classifica, ma questa non è autenticazione sicura. Usare solo su una rete fidata. Per svelare la classifica devono votare tutti i partecipanti nel seed, anche quelli offline; chiunque può avviare le fasi e chiudere il reveal.

## Verifica

```bash
npm test --prefix server
npm run build --prefix client
```

I dati dei confini provengono da [geo-countries](https://github.com/datasets/geo-countries); l'immagine nella schermata iniziale dagli esempi di [three-globe](https://github.com/vasturiano/three-globe).