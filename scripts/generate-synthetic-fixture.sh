#!/bin/sh
set -eu

mkdir -p evidence/runtime
docker compose run --rm --no-deps \
  -v "$PWD/evidence/runtime:/fixture" \
  --entrypoint ffmpeg worker \
  -y \
  -f lavfi \
  -i "testsrc=size=320x180:rate=24:duration=2" \
  -pix_fmt yuv420p \
  /fixture/synthetic-review.mp4 >/dev/null 2>&1
printf '%s\n' "evidence/runtime/synthetic-review.mp4"
