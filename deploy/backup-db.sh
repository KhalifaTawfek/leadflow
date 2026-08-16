#!/usr/bin/env bash
# Simple Postgres backup for the LeadFlow Docker setup.
# Dumps the database to a timestamped, gzipped file and prunes old backups.
# Schedule daily with cron:  30 3 * * * /opt/leadflow/deploy/backup-db.sh
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/leadflow}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
COMPOSE_DIR="${COMPOSE_DIR:-/opt/leadflow}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%F-%H%M)"
OUT="$BACKUP_DIR/leadflow-$STAMP.sql.gz"

cd "$COMPOSE_DIR"
docker compose exec -T db pg_dump -U leadflow leadflow | gzip > "$OUT"
echo "Backup written: $OUT"

# Prune backups older than RETENTION_DAYS
find "$BACKUP_DIR" -name 'leadflow-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
echo "Pruned backups older than ${RETENTION_DAYS} days."
