#!/bin/sh
set -eu

app_url="${APP_URL:-http://127.0.0.1:3004}"
mkdir -p evidence/runtime
output="evidence/runtime/health-latencies.txt"
: >"$output"

index=0
while [ "$index" -lt 100 ]; do
  curl --fail --silent --output /dev/null \
    --write-out '%{time_total}\n' \
    "${app_url}/api/health" >>"$output"
  index=$((index + 1))
done

python3 - "$output" <<'PY'
import json
import pathlib
import statistics
import sys

values = sorted(float(value) * 1000 for value in pathlib.Path(sys.argv[1]).read_text().splitlines())
result = {
    "environment": "single local Docker Compose application container",
    "requests": len(values),
    "concurrency": 1,
    "p50_ms": round(statistics.median(values), 3),
    "p95_ms": round(values[int(len(values) * 0.95) - 1], 3),
    "p99_ms": round(values[int(len(values) * 0.99) - 1], 3),
    "scope": "liveness endpoint only; not a media throughput claim",
}
pathlib.Path("evidence/runtime/benchmark.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
PY
