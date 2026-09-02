#!/usr/bin/env bash
# ============================================================
# Backup zilnic al bazei de date. Instalat de setup-server.sh in
# /opt/zof/backup.sh si rulat automat de cron, noaptea la 03:15.
#
# Manual, oricand:  sudo /opt/zof/backup.sh
# ============================================================
set -euo pipefail

BAZA="/opt/zof/data/zof.db"
FOLDER="/opt/zof/backups"
ZILE_PASTRATE=14

mkdir -p "$FOLDER"
STAMPILA="$(date +%Y-%m-%d_%H%M)"
DESTINATIE="$FOLDER/zof-$STAMPILA.db"

# ".backup" e singura metoda sigura cat timp serverul scrie in baza: copierea
# fisierului cu cp poate prinde o tranzactie la jumatate si da un backup corupt.
sqlite3 "$BAZA" ".backup '$DESTINATIE'"

# Verificam ca a iesit o baza valida — un backup necontrolat e doar iluzia
# unui backup. Daca e corupt, il stergem si iesim cu eroare, ca sa se vada.
if [[ "$(sqlite3 "$DESTINATIE" 'PRAGMA integrity_check;')" != "ok" ]]; then
    echo "BACKUP CORUPT: $DESTINATIE" >&2
    rm -f "$DESTINATIE"
    exit 1
fi

gzip -f "$DESTINATIE"
find "$FOLDER" -name 'zof-*.db.gz' -mtime "+$ZILE_PASTRATE" -delete

echo "Backup OK: $DESTINATIE.gz ($(du -h "$DESTINATIE.gz" | cut -f1))"
