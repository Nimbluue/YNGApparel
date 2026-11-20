#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# YNG Apparel — Backup Database PostgreSQL (pg_dump terenkripsi opsional)
# Jalankan dari server/cron/GitHub Actions eksternal dengan DATABASE_URL terisi.
# Catatan: Backup database TIDAK mencakup isi bucket Supabase Storage
# (designs, payment-proofs, qc-photos, catalog). Ekspor storage secara terpisah.
# ==============================================================================

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Error: DATABASE_URL belum di-set." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date -u +"%Y%m%d_%H%M%S")"
RAW_GZ="${BACKUP_DIR}/yng_apparel_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[backup] Menjalankan pg_dump..."
pg_dump "${DATABASE_URL}" --no-owner --no-acl --format=plain | gzip -9 > "${RAW_GZ}"

if [[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
  ENC_FILE="${RAW_GZ}.enc"
  openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY -in "${RAW_GZ}" -out "${ENC_FILE}"
  rm -f "${RAW_GZ}"
  echo "[backup] Backup terenkripsi tersimpan: ${ENC_FILE}"
  # Cara restore:
  # openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY -in <file.sql.gz.enc> | gunzip | psql "$DATABASE_URL"
else
  echo "[backup] Backup terkompresi tersimpan: ${RAW_GZ}"
  echo "[backup] Tips: isi BACKUP_ENCRYPTION_KEY untuk mengenkripsi arsip backup."
  # Cara restore:
  # gunzip -c <file.sql.gz> | psql "$DATABASE_URL"
fi
