#!/usr/bin/env bash
# One-time setup of Evolution API on the VPS (docs/WHATSAPP.md). Run as the
# deploy user in /opt/halohaul. Safe to run again: existing secrets are kept.
set -euo pipefail
cd "$(dirname "$0")/../.."
umask 077

[ -f .env ] || { echo "Run this in /opt/halohaul, next to .env" >&2; exit 1; }
value() { grep -E "^$1=" "$2" 2>/dev/null | tail -n1 | cut -d= -f2- || true; }

if [ ! -f evolution.env ]; then
  key=$(openssl rand -hex 32)
  dbpass=$(openssl rand -hex 24)
  sed -e "s|@KEY@|$key|" -e "s|@DBPASS@|$dbpass|" deploy/evolution/evolution.env.example > evolution.env
fi
key=$(value AUTHENTICATION_API_KEY evolution.env)
dbpass=$(value DATABASE_CONNECTION_URI evolution.env | sed -E 's|.*://evolution:([0-9a-f]+)@.*|\1|')
[[ "$key" =~ ^[0-9a-f]{64}$ && "$dbpass" =~ ^[0-9a-f]{48}$ ]] || { echo "evolution.env looks edited; fix it first" >&2; exit 1; }

# Its own database and login, which can't open HaloHaul's.
docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'evolution') THEN
    CREATE ROLE evolution LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 6;
  END IF;
END \$\$;
ALTER ROLE evolution PASSWORD '$dbpass';
SELECT 'CREATE DATABASE evolution OWNER evolution' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'evolution') \gexec
REVOKE CONNECT ON DATABASE evolution FROM PUBLIC;
DO \$\$ BEGIN
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', current_database());
END \$\$;
SQL

put() { if grep -qE "^$1=" .env; then sed -i -E "s|^$1=.*|$1=$2|" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi; }
put COMPOSE_PROFILES evolution
put EVOLUTION_API_URL http://evolution:8080
put EVOLUTION_API_KEY "$key"

docker compose up -d evolution
echo "Waiting for Evolution to prepare its database…"
for _ in $(seq 1 60); do
  ready=$(docker compose exec -T postgres sh -c 'psql -At -U "$POSTGRES_USER" -d evolution -c "select to_regclass('"'"'public.\"Message\"'"'"') is not null"' 2>/dev/null || true)
  [ "$ready" = t ] && break
  sleep 3
done
[ "${ready:-}" = t ] || { echo "It didn't start. See: docker compose logs evolution" >&2; exit 1; }

# Evolution keeps messages only to resend lost ones and fetch files. Three days is
# enough; every new message clears older ones.
docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d evolution' <<'SQL'
CREATE OR REPLACE FUNCTION halohaul_prune_messages() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "Message" WHERE "messageTimestamp" < extract(epoch FROM now() - interval '3 days');
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS halohaul_prune ON "Message";
CREATE TRIGGER halohaul_prune AFTER INSERT ON "Message" FOR EACH STATEMENT EXECUTE FUNCTION halohaul_prune_messages();
SQL

docker compose up -d app
echo "Done. Link the phone in Admin → Settings → WhatsApp."
