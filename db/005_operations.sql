alter table audit_events
  add column previous_hash text,
  add column event_hash text;

create or replace function hash_audit_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  prior_hash text;
begin
  perform pg_advisory_xact_lock(482917);
  select event_hash
  into prior_hash
  from public.audit_events
  order by id desc
  limit 1;

  new.previous_hash := prior_hash;
  new.event_hash := encode(
    public.digest(
      concat_ws(
        '|',
        coalesce(prior_hash, ''),
        new.event_type,
        new.aggregate_type,
        new.aggregate_id,
        new.actor_id,
        new.detail::text,
        new.occurred_at::text
      ),
      'sha256'
    ),
    'hex'
  );
  return new;
end
$$;

create trigger audit_event_hash
before insert on audit_events
for each row execute function hash_audit_event();

create or replace function prevent_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit events are append-only';
end
$$;

create trigger audit_events_append_only
before update or delete on audit_events
for each row execute function prevent_audit_mutation();

create table cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  expired_uploads integer not null check (expired_uploads >= 0),
  removed_parts integer not null check (removed_parts >= 0),
  actor_id text not null,
  created_at timestamptz not null default now()
);

grant select, insert on cleanup_runs to media_app;
