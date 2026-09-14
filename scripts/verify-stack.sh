#!/bin/sh
set -eu

app_url="${APP_URL:-http://127.0.0.1:3004}"
curl="curl --fail --show-error --silent"
producer="-H x-actor-id:synthetic-producer -H x-actor-role:producer"
reviewer="-H x-actor-id:synthetic-reviewer -H x-actor-role:reviewer"
rights_manager="-H x-actor-id:synthetic-rights-manager -H x-actor-role:rights-manager"
publisher="-H x-actor-id:synthetic-publisher -H x-actor-role:publisher"
operator="-H x-actor-id:synthetic-operator -H x-actor-role:operator"

attempt=0
until $curl "${app_url}/api/ready" \
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

checksum_upload="$(
  $curl -X POST $producer \
    -H content-type:application/json \
    -d "{
      \"title\":\"Checksum rejection fixture\",
      \"fileName\":\"checksum-rejection.mp4\",
      \"mediaType\":\"video/mp4\",
      \"expectedSize\":${size},
      \"expectedSha256\":\"$(printf '0%.0s' $(seq 1 64))\"
    }" \
    "${app_url}/api/uploads"
)"
checksum_upload_id="$(printf '%s' "$checksum_upload" | jq -r '.upload.id')"
$curl -X PUT $producer \
  --data-binary "@${fixture}" \
  "${app_url}/api/uploads/${checksum_upload_id}/parts/1" >/dev/null
checksum_result="$(
  curl --silent -X POST $producer \
    "${app_url}/api/uploads/${checksum_upload_id}/complete"
)"
printf '%s' "$checksum_result" \
  | jq -e '.inspection.reasonCode == "checksum_mismatch"' >/dev/null

hostile_fixture="evidence/runtime/scanner-rejection.mp4"
printf '\000\000\000\030ftypisomEICAR-STANDARD-ANTIVIRUS-TEST-FILE' \
  >"$hostile_fixture"
hostile_size="$(wc -c <"$hostile_fixture" | tr -d ' ')"
hostile_checksum="$(sha256sum "$hostile_fixture" | cut -d ' ' -f 1)"
hostile_upload="$(
  $curl -X POST $producer \
    -H content-type:application/json \
    -d "{
      \"title\":\"Scanner rejection fixture\",
      \"fileName\":\"scanner-rejection.mp4\",
      \"mediaType\":\"video/mp4\",
      \"expectedSize\":${hostile_size},
      \"expectedSha256\":\"${hostile_checksum}\"
    }" \
    "${app_url}/api/uploads"
)"
hostile_upload_id="$(printf '%s' "$hostile_upload" | jq -r '.upload.id')"
$curl -X PUT $producer \
  --data-binary "@${hostile_fixture}" \
  "${app_url}/api/uploads/${hostile_upload_id}/parts/1" >/dev/null
hostile_result="$(
  curl --silent -X POST $producer \
    "${app_url}/api/uploads/${hostile_upload_id}/complete"
)"
printf '%s' "$hostile_result" \
  | jq -e '.inspection.reasonCode == "malware_signature"' >/dev/null

expiry_upload="$(
  $curl -X POST $producer \
    -H content-type:application/json \
    -d "{
      \"title\":\"Expired upload fixture\",
      \"fileName\":\"expired.mp4\",
      \"mediaType\":\"video/mp4\",
      \"expectedSize\":${size},
      \"expectedSha256\":\"${checksum}\"
    }" \
    "${app_url}/api/uploads"
)"
expiry_upload_id="$(printf '%s' "$expiry_upload" | jq -r '.upload.id')"
$curl -X PUT $producer \
  --data-binary "@${fixture}" \
  "${app_url}/api/uploads/${expiry_upload_id}/parts/1" >/dev/null
docker compose exec -T postgres psql -U media_admin -d media_pipeline \
  -v ON_ERROR_STOP=1 -q \
  -c "update upload_sessions set expires_at = now() - interval '1 second' where id = '${expiry_upload_id}';"
cleanup="$(
  $curl -X POST \
    -H x-operations-secret:local-operations-secret-change-before-sharing \
    "${app_url}/api/operations/cleanup"
)"
printf '%s' "$cleanup" \
  | jq -e '.cleanup.expiredUploads >= 1 and .cleanup.removedParts >= 1' \
  >/dev/null

upload="$(
  $curl -X POST $producer \
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

$curl -X PUT $producer \
  --data-binary "@${fixture}" \
  "${app_url}/api/uploads/${upload_id}/parts/1" >/dev/null

completion="$(
  $curl -X POST $producer \
    "${app_url}/api/uploads/${upload_id}/complete"
)"
version_id="$(printf '%s' "$completion" | jq -r '.version.id')"
asset_id="$(printf '%s' "$completion" | jq -r '.version.assetId')"

job="$(
  $curl -X POST $producer \
    "${app_url}/api/asset-versions/${version_id}/renditions"
)"
job_id="$(printf '%s' "$job" | jq -r '.job.id')"

attempt=0
while :; do
  state="$(
    $curl $producer \
      "${app_url}/api/transforms/${job_id}" | jq -r '.job.state'
  )"
  test "$state" = "completed" && break
  test "$state" = "quarantined" && exit 1
  attempt=$((attempt + 1))
  test "$attempt" -lt 60 || exit 1
  sleep 2
done

docker compose stop worker >/dev/null
docker compose exec -T postgres psql -U media_admin -d media_pipeline \
  -v ON_ERROR_STOP=1 -q \
  -c "update transform_jobs set state = 'leased', attempts = 1, worker_id = 'terminated-worker', lease_until = now() - interval '1 second', completed_at = null where id = '${job_id}';"
docker compose start worker >/dev/null
attempt=0
while :; do
  job_recovery="$(
    $curl $producer "${app_url}/api/transforms/${job_id}"
  )"
  state="$(printf '%s' "$job_recovery" | jq -r '.job.state')"
  attempts="$(printf '%s' "$job_recovery" | jq -r '.job.attempts')"
  test "$state" = "completed" && test "$attempts" -ge 2 && break
  attempt=$((attempt + 1))
  test "$attempt" -lt 60 || exit 1
  sleep 2
done

review="$(
  $curl -X POST $producer \
    "${app_url}/api/asset-versions/${version_id}/reviews"
)"
review_id="$(printf '%s' "$review" | jq -r '.review.id')"

$curl -X POST $reviewer \
  -H content-type:application/json \
  -d '{"timecodeMs":500,"body":"Synthetic title frame is legible."}' \
  "${app_url}/api/reviews/${review_id}/annotations" >/dev/null

$curl -X POST $reviewer \
  -H content-type:application/json \
  -d '{"decision":"approved","expectedRevision":1,"note":"Synthetic review accepted."}' \
  "${app_url}/api/reviews/${review_id}/decision" >/dev/null

$curl -X POST $rights_manager \
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
  $curl -X POST $publisher \
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

execution="$(
  $curl -X POST $publisher \
  -H x-sandbox-outcome:unknown \
  "${app_url}/api/publications/${publication_id}/execute" \
)"
printf '%s' "$execution" | jq -e '.intent.state == "unknown"' >/dev/null

reconciliation="$(
  $curl -X POST $operator \
  -H content-type:application/json \
  -d '{"foundDelivered":true}' \
  "${app_url}/api/publications/${publication_id}/reconcile" \
)"
printf '%s' "$reconciliation" \
  | jq -e '.intent.state == "delivered"' >/dev/null

access="$(
  $curl -X POST $publisher \
    "${app_url}/api/publications/${publication_id}/access"
)"
delivery_url="$(printf '%s' "$access" | jq -r '.url')"
$curl "${app_url}${delivery_url}" >/dev/null

$curl -X POST $rights_manager \
  -H content-type:application/json \
  -d '{"reason":"Synthetic rights withdrawal exercise."}' \
  "${app_url}/api/publications/${publication_id}/revoke" >/dev/null

status="$(
  curl --silent --output /dev/null --write-out '%{http_code}' \
    "${app_url}${delivery_url}"
)"
test "$status" = "404"

metrics="$(
  $curl \
  -H x-operations-secret:local-operations-secret-change-before-sharing \
  "${app_url}/api/operations/metrics" \
)"
printf '%s' "$metrics" \
  | jq -e '.queue.queued >= 0 and .publication.revoked >= 1' >/dev/null

scripts/verify-audit-chain.sh
printf 'Live rights-aware media contracts passed.\n'
