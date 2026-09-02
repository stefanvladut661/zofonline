#!/usr/bin/env bash
# ============================================================
# Pregatirea masinii virtuale (Debian 12, Google Cloud e2-micro).
# Se ruleaza O SINGURA DATA, pe server:
#
#   sudo bash setup-server.sh stoc.zof.ro
#
# Instaleaza Node si Caddy, creeaza utilizatorul si folderele, pune
# serviciul sub systemd si porneste HTTPS-ul. Nu urca cod — asta o
# face publica.ps1 de pe calculatorul tau.
# ============================================================
set -euo pipefail

DOMENIU="${1:-}"
if [[ -z "$DOMENIU" ]]; then
    echo "Utilizare: sudo bash setup-server.sh <domeniu>"
    echo "Exemplu:   sudo bash setup-server.sh stoc.zof.ro"
    exit 1
fi

if [[ $EUID -ne 0 ]]; then
    echo "Ruleaza cu sudo."
    exit 1
fi

echo "==> Pregatesc serverul pentru $DOMENIU"

# --- Pachete de baza -------------------------------------------------------
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https sqlite3

# --- Swap ------------------------------------------------------------------
# e2-micro are 1 GB de RAM. Serverul foloseste sub 100 MB, dar 2 GB de swap
# costa doar spatiu pe disc si il scapa de un OOM la un varf neasteptat.
if [[ ! -f /swapfile ]]; then
    echo "==> Creez 2 GB de swap"
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap -q /swapfile
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# --- Node 24 ---------------------------------------------------------------
# Baza de date foloseste modulul node:sqlite, disponibil doar din Node 22+.
if ! command -v node >/dev/null || [[ "$(node -v | cut -c2-3)" -lt 22 ]]; then
    echo "==> Instalez Node 24"
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
    apt-get install -y -qq nodejs
fi
echo "    Node: $(node -v)"

# --- Caddy -----------------------------------------------------------------
if ! command -v caddy >/dev/null; then
    echo "==> Instalez Caddy"
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy
fi

# --- Utilizator si foldere -------------------------------------------------
# Serverul ruleaza sub un cont fara drept de logare. Datele stau in
# /opt/zof/data, separat de cod, ca un deploy sa nu le poata atinge niciodata.
id -u zof >/dev/null 2>&1 || useradd --system --home /opt/zof --shell /usr/sbin/nologin zof
mkdir -p /opt/zof/{data,dist,server,backups}
chown -R zof:zof /opt/zof

# --- Secretul ---------------------------------------------------------------
# Cripteaza cheile API ale agentilor. Se genereaza o singura data si nu se
# mai schimba niciodata: daca se pierde, toti agentii trebuie reinrolati.
if [[ ! -f /opt/zof/.env ]]; then
    echo "==> Generez configurarea de productie"
    CHEIE="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"
    cat > /opt/zof/.env <<EOF
# Generat de setup-server.sh la $(date -Iseconds)
# ATENTIE: fara acest fisier, cheile agentilor devin indescifrabile. Fa-i backup.
ZOF_SECRET_KEY=$CHEIE
ZOF_DB_FILE=/opt/zof/data/zof.db
PORT=3011
# Doar Caddy trebuie sa ajunga la Node. Legat de interfata locala, portul 3011
# nu e accesibil din internet nici daca cineva ar deschide firewall-ul.
ZOF_HOST=127.0.0.1
NODE_ENV=production
ZOF_CORS_ORIGINS=https://$DOMENIU
EOF
    chown zof:zof /opt/zof/.env
    chmod 600 /opt/zof/.env
    echo "    Secret generat. Fa-i backup: sudo cat /opt/zof/.env"
else
    echo "==> /opt/zof/.env exista deja, nu il ating"
fi

# --- Serviciul --------------------------------------------------------------
AICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$AICI/zof.service" /etc/systemd/system/zof.service
systemctl daemon-reload
systemctl enable zof >/dev/null

# --- Caddy: domeniul --------------------------------------------------------
sed "s/stoc\.zof\.ro/$DOMENIU/g" "$AICI/Caddyfile" > /etc/caddy/Caddyfile
mkdir -p /var/log/caddy && chown caddy:caddy /var/log/caddy
systemctl reload caddy 2>/dev/null || systemctl restart caddy

# --- Backup zilnic ----------------------------------------------------------
cp "$AICI/backup.sh" /opt/zof/backup.sh
chmod +x /opt/zof/backup.sh
cat > /etc/cron.d/zof-backup <<'EOF'
# Backup al bazei in fiecare noapte la 03:15
15 3 * * * root /opt/zof/backup.sh >/dev/null 2>&1
EOF

echo
echo "============================================================"
echo " Serverul e pregatit."
echo
echo " Backend-ul inca nu porneste — nu are cod. Urmatorul pas, de"
echo " pe calculatorul tau:   .\\deploy\\publica.ps1"
echo
echo " Apoi, tot aici, creezi contul si agentii:"
echo "   cd /opt/zof && sudo -u zof node --env-file=.env server/cli.js user"
echo "============================================================"
