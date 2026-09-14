#!/bin/sh
set -eu

app_url="${APP_URL:-http://127.0.0.1:3004}"
producer="-H x-actor-id:synthetic-producer -H x-actor-role:producer"
reviewer="-H x-actor-id:synthetic-reviewer -H x-actor-role:reviewer"
rights_manager="-H x-actor-id:synthetic-rights-manager -H x-actor-role:rights-manager"
publisher="-H x-actor-id:synthetic-publisher -H x-actor-role:publisher"
operator="-H x-actor-id:synthetic-operator -H x-actor-role:operator"

attempt=0
until curl --fail --silent "${app_url}/api/ready" \
  | jq -e '.status == "ready"' >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    printf 'Media pipeline did not become ready.\n' >&2
    exit 1
  fi
  sleep 2
done

fixture="$(scripts/generate-synthetic-fixture.sh)"
size="$(wc -c <"$fixture" | tr -d ' ')"
checksum="$(sha256sum "$fixture" | cut -d ' ' -f 1)"

upload="$(
  curl --fail --silent -X POST $producer \
    -H content-type:application/json \
    -d "{
      \"title\":\"Synthetic CFR review reel\",
      \"fileName\":\"synthetic-review.mp4\",
      \"mediaType\":\"video/mp4\",
      \"expectedSize\":${size},
      \"expectedSha256\":\"${checksum}\"
    }" \
    "${app_url}/api/uploads"
)"
upload_id="$(printf '%s' "$upload" | jq -r '.upload.id')"

curl --fail --silent -X PUT $producer \
  --data-binary "@${fixture}" \
  "${app_url}/api/uploads/${upload_id}/parts/1" >/dev/null

completion="$(
  curl --fail --silent -X POST $producer \
    "${app_url}/api/uploads/${upload_id}/complete"
)"
version_id="$(printf '%s' "$completion" | jq -r '.version.id')"
asset_id="$(printf '%s' "$completion" | jq -r '.version.assetId')"

job="$(
  curl --fail --silent -X POST $producer \
    "${app_url}/api/asset-versions/${version_id}/renditions"
)"
job_id="$(printf '%s' "$job" | jq -r '.job.id')"

attempt=0
while :; do
  state="$(
    curl --fail --silent $producer \
      "${app_url}/api/transforms/${job_id}" | jq -r '.job.state'
  )"
  test "$state" = "completed" && break
  test "$state" = "quarantined" && exit 1
  attempt=$((attempt + 1))
  test "$attempt" -lt 60 || exit 1
  sleep 2
done

review="$(
  curl --fail --silent -X POST $producer \
    "${app_url}/api/asset-versions/${version_id}/reviews"
)"
review_id="$(printf '%s' "$review" | jq -r '.review.id')"

curl --fail --silent -X POST $reviewer \
  -H content-type:application/json \
  -d '{"timecodeMs":500,"body":"Synthetic title frame is legible."}' \
  "${app_url}/api/reviews/${review_id}/annotations" >/dev/null

curl --fail --silent -X POST $reviewer \
  -H content-type:application/json \
  -d '{"decision":"approved","expectedRevision":1,"note":"Synthetic review accepted."}' \
  "${app_url}/api/reviews/${review_id}/decision" >/dev/null

curl --fail --silent -X POST $rights_manager \
  -H content-type:application/json \
  -d '{
    "territory":"GB",
    "validFrom":"2026-01-01T00:00:00Z",
    "validUntil":"2030-01-01T00:00:00Z",
    "renditionSpecId":"review-v1",
    "destination":"sandbox-cdn"
  }' \
  "${app_url}/api/assets/${asset_id}/rights" >/dev/null

intent="$(
  curl --fail --silent -X POST $publisher \
    -H content-type:application/json \
    -d "{
      \"territory\":\"GB\",
      \"destination\":\"sandbox-cdn\",
      \"renditionSpecId\":\"review-v1\",
      \"scheduledFor\":\"2026-01-01T00:00:00Z\",
      \"idempotencyKey\":\"synthetic-${version_id}\"
    }" \
    "${app_url}/api/asset-versions/${version_id}/publications"
)"
publication_id="$(printf '%s' "$intent" | jq -r '.intent.id')"

curl --fail --silent -X POST $publisher \
  -H x-sandbox-outcome:unknown \
  "${app_url}/api/publications/${publication_id}/execute" \
  | jq -e '.intent.state == "unknown"' >/dev/null

curl --fail --silent -X POST $operator \
  -H content-type:application/json \
  -d '{"foundDelivered":true}' \
  "${app_url}/api/publications/${publication_id}/reconcile" \
  | jq -e '.intent.state == "delivered"' >/dev/null

access="$(
  curl --fail --silent -X POST $publisher \
    "${app_url}/api/publications/${publication_id}/access"
)"
delivery_url="$(printf '%s' "$access" | jq -r '.url')"
curl --fail --silent "${app_url}${delivery_url}" >/dev/null

curl --fail --silent -X POST $rights_manager \
  -H content-type:application/json \
  -d '{"reason":"Synthetic rights withdrawal exercise."}' \
  "${app_url}/api/publications/${publication_id}/revoke" >/dev/null

status="$(
  curl --silent --output /dev/null --write-out '%{http_code}' \
    "${app_url}${delivery_url}"
)"
test "$status" = "404"

curl --fail --silent \
  -H x-operations-secret:local-operations-secret-change-before-sharing \
  "${app_url}/api/operations/metrics" \
  | jq -e '.queue.queued >= 0 and .publication.revoked >= 1' >/dev/null

scripts/verify-audit-chain.sh
printf 'Live rights-aware media contracts passed.\n'
