#!/bin/sh
set -eu

valid="$(
  docker compose exec -T postgres \
    psql -U media_admin -d media_pipeline -qAt -v ON_ERROR_STOP=1 <<'SQL'
with ordered as (
  select
    *,
    lag(event_hash) over (order by id) as expected_previous
  from audit_events
),
verified as (
  select
    previous_hash is not distinct from expected_previous
    and event_hash = encode(
      public.digest(
        concat_ws(
          '|',
          coalesce(previous_hash, ''),
          event_type,
          aggregate_type,
          aggregate_id,
          actor_id,
          detail::text,
          occurred_at::text
        ),
        'sha256'
      ),
      'hex'
    ) as valid
  from ordered
)
select coalesce(bool_and(valid), true) from verified;
SQL
)"

test "$valid" = "t"
printf 'Audit chain verified.\n'
