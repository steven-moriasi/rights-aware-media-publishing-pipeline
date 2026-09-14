create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'media_app') then
    create role media_app login password 'local-app-password';
  end if;
end
$$;

create table assets (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 160),
  created_by text not null,
  created_at timestamptz not null default now()
);

create table upload_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 160),
  file_name text not null,
  media_type text not null,
  expected_size bigint not null check (expected_size between 1 and 26214400),
  expected_sha256 text not null check (expected_sha256 ~ '^[a-f0-9]{64}$'),
  state text not null default 'initiated'
    check (state in ('initiated', 'uploading', 'verifying', 'promoted', 'quarantined', 'expired')),
  created_by text not null,
  expires_at timestamptz not null default (now() + interval '2 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table upload_parts (
  upload_id uuid not null references upload_sessions(id) on delete cascade,
  part_number integer not null check (part_number between 1 and 100),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  object_key text not null unique,
  created_at timestamptz not null default now(),
  primary key (upload_id, part_number)
);

create table asset_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id),
  version_number integer not null check (version_number > 0),
  source_object_key text not null unique,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  media_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  scan_status text not null check (scan_status in ('clean', 'rejected')),
  status text not null check (status in ('available', 'quarantined')),
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (asset_id, version_number)
);

create table quarantine_records (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null unique references upload_sessions(id),
  reason_code text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create table audit_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  actor_id text not null,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create or replace function prevent_asset_version_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'asset versions are immutable';
end
$$;

create trigger asset_versions_immutable
before update or delete on asset_versions
for each row execute function prevent_asset_version_mutation();

grant usage on schema public to media_app;
grant select, insert, update, delete on assets, upload_sessions, upload_parts, quarantine_records to media_app;
grant select, insert on asset_versions, audit_events to media_app;
grant usage, select on all sequences in schema public to media_app;
