#!/bin/sh
set -eu

mkdir -p backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
database_archive="backups/media-pipeline-${stamp}.dump"
object_archive="backups/media-objects-${stamp}.tgz"

docker compose exec -T postgres \
  pg_dump -U media_admin -d media_pipeline -Fc >"$database_archive"

object_container="$(docker compose ps -q object-store)"
docker run --rm \
  --volumes-from "$object_container" \
  -v "$PWD/backups:/backup" \
  node:22.22.2-alpine \
  tar -C /data -czf "/backup/$(basename "$object_archive")" .

sha256sum "$database_archive" "$object_archive" \
  >"backups/media-authority-${stamp}.sha256"

printf '%s\n%s\n' "$database_archive" "$object_archive"
