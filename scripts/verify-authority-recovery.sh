#!/bin/sh
set -eu

archives="$(scripts/backup-authority.sh)"
database_archive="$(printf '%s\n' "$archives" | sed -n '1p')"
object_archive="$(printf '%s\n' "$archives" | sed -n '2p')"
checksum_archive="$(ls -1t backups/media-authority-*.sha256 | head -1)"

sha256sum -c "$checksum_archive"

docker compose exec -T postgres \
  psql -U media_admin -d postgres -v ON_ERROR_STOP=1 \
  -c 'drop database if exists media_pipeline_restore;' \
  -c 'create database media_pipeline_restore;'

docker compose exec -T postgres \
  pg_restore -U media_admin -d media_pipeline_restore \
  --no-owner --no-privileges <"$database_archive"

docker compose exec -T postgres \
  psql -U media_admin -d media_pipeline_restore -v ON_ERROR_STOP=1 -At \
  -c "select count(*) >= 1 from asset_versions;" \
  -c "select count(*) >= 1 from audit_events;"

restore_volume="media-object-restore-$$"
docker volume create "$restore_volume" >/dev/null
docker run --rm \
  -v "$restore_volume:/restore" \
  -v "$PWD/backups:/backup:ro" \
  node:22.22.2-alpine \
  tar -C /restore -xzf "/backup/$(basename "$object_archive")"
docker run --rm -v "$restore_volume:/restore:ro" node:22.22.2-alpine \
  sh -c 'test "$(find /restore -type f | wc -l)" -ge 1'
docker volume rm "$restore_volume" >/dev/null

docker compose exec -T postgres \
  psql -U media_admin -d postgres -v ON_ERROR_STOP=1 \
  -c 'drop database media_pipeline_restore;' >/dev/null

printf 'Database and object authority recovery verified.\n'
