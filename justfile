set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just --list

# Installa le dipendenze di backend e frontend.
install:
    npm install --prefix server
    npm install --prefix client

# Avvia server e frontend; backup opzionale: nome cartella, percorso cartella o file .db.
start backup="":
    #!/usr/bin/env bash
    set -euo pipefail
    backup_arg="{{backup}}"
    if [[ -n "$backup_arg" ]]; then
      if lsof -nP -iTCP:3001 -sTCP:LISTEN >/dev/null 2>&1; then
        echo "Ferma prima il server sulla porta 3001 (Ctrl+C nel suo terminale)." >&2
        exit 1
      fi
      if [[ -d "$backup_arg" ]]; then
        backup_dir="$backup_arg"
        backup_db="$backup_dir/serata.db"
      elif [[ -d "server/backups/$backup_arg" ]]; then
        backup_dir="server/backups/$backup_arg"
        backup_db="$backup_dir/serata.db"
      elif [[ -f "$backup_arg" ]]; then
        backup_db="$backup_arg"
        backup_dir="$(dirname "$backup_db")"
      else
        echo "Backup non trovato: $backup_arg" >&2
        exit 1
      fi
      if [[ ! -f "$backup_db" ]]; then
        echo "Nel backup non trovo il database: $backup_db" >&2
        exit 1
      fi
      if [[ "$backup_dir" -ef server ]]; then
        echo "Indica una cartella di backup, non la cartella server." >&2
        exit 1
      fi
      saved="server/backups/pre-restore-$(date +%Y%m%d-%H%M%S)"
      if [[ -e server/serata.db || -e server/serata.db-wal || -e server/serata.db-shm ]]; then
        mkdir -p "$saved"
        for file in server/serata.db server/serata.db-wal server/serata.db-shm; do
          if [[ -e "$file" ]]; then mv "$file" "$saved/"; fi
        done
        echo "Database corrente archiviato in $saved"
      fi
      cp "$backup_db" server/serata.db
      for suffix in -wal -shm; do
        if [[ -e "$backup_db$suffix" ]]; then cp "$backup_db$suffix" "server/serata.db$suffix"; fi
      done
      echo "Backup ripristinato: $backup_db"
    fi
    npm run dev --prefix server &
    server_pid=$!
    npm run dev --prefix client &
    client_pid=$!
    cleanup() {
      trap - INT TERM EXIT
      kill "$server_pid" "$client_pid" 2>/dev/null || true
      wait "$server_pid" "$client_pid" 2>/dev/null || true
    }
    trap cleanup INT TERM EXIT
    wait "$server_pid" "$client_pid"

# Avvia solo il server in modalità normale, con i dati già salvati.
server:
    npm start --prefix server

# Avvia solo il server in modalità watch.
server-dev:
    npm run dev --prefix server

# Avvia solo Vite, accessibile sulla rete locale.
client:
    npm run dev --prefix client

# Aggiorna i profili dal seed senza cancellare voti o proposte.
seed:
    npm run seed --prefix server

# Crea una nuova serata dopo conferma; archivia il database esistente.
fresh:
    #!/usr/bin/env bash
    set -euo pipefail
    if lsof -nP -iTCP:3001 -sTCP:LISTEN >/dev/null 2>&1; then
      echo "Ferma prima il server sulla porta 3001 (Ctrl+C nel suo terminale)." >&2
      exit 1
    fi
    read -r -p "Nuova serata: il database attuale verra' archiviato. Scrivi RESET per continuare: " answer
    if [[ "$answer" != "RESET" ]]; then
      echo "Operazione annullata. Database lasciato invariato."
      exit 0
    fi
    if [[ -e server/serata.db || -e server/serata.db-wal || -e server/serata.db-shm ]]; then
      backup="server/backups/serata-$(date +%Y%m%d-%H%M%S)"
      mkdir -p "$backup"
      for file in server/serata.db server/serata.db-wal server/serata.db-shm; do
        if [[ -e "$file" ]]; then mv "$file" "$backup/"; fi
      done
      echo "Database archiviato in $backup"
    fi
    npm run seed --prefix server

# Mostra l'indirizzo Wi-Fi macOS da condividere.
ip:
    ipconfig getifaddr en0

# Test backend e build frontend.
check:
    npm test --prefix server
    npm run build --prefix client