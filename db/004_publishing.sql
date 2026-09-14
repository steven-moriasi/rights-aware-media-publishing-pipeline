create table rights_grants (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id),
  territory text not null check (territory = 'GLOBAL' or territory ~ '^[A-Z]{2}$'),
  valid_from timestamptz not null,
  valid_until timestamptz not null check (valid_until > valid_from),
  rendition_spec_id text not null references rendition_specs(id),
  destination text not null check (destination = 'sandbox-cdn'),
  state text not null default 'active' check (state in ('active', 'revoked')),
  granted_by text not null,
  revoked_by text,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index rights_grants_evaluation_idx
  on rights_grants (
    asset_id,
    destination,
    territory,
    rendition_spec_id,
    valid_from,
    valid_until
  )
  where state = 'active';

create table publication_intents (
  id uuid primary key default gen_random_uuid(),
  asset_version_id uuid not null references asset_versions(id),
  territory text not null check (territory = 'GLOBAL' or territory ~ '^[A-Z]{2}$'),
  destination text not null check (destination = 'sandbox-cdn'),
  rendition_spec_id text not null references rendition_specs(id),
  idempotency_key text not null unique check (length(idempotency_key) between 8 and 200),
  scheduled_for timestamptz not null,
  state text not null default 'scheduled'
    check (state in ('scheduled', 'executing', 'delivered', 'unknown', 'blocked', 'revoked')),
  requested_by text not null,
  blocked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table publication_attempts (
  id uuid primary key default gen_random_uuid(),
  publication_intent_id uuid not null references publication_intents(id),
  attempt_number integer not null check (attempt_number > 0),
  provider_key text not null,
  outcome text not null check (outcome in ('delivered', 'unknown', 'rejected')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (publication_intent_id, attempt_number),
  unique (provider_key)
);

create table delivery_receipts (
  id uuid primary key default gen_random_uuid(),
  publication_intent_id uuid not null unique references publication_intents(id),
  provider_delivery_id text not null unique,
  rendition_object_key text not null,
  delivered_at timestamptz not null default now()
);

create table publication_revocations (
  id uuid primary key default gen_random_uuid(),
  publication_intent_id uuid not null unique references publication_intents(id),
  reason text not null check (length(reason) between 1 and 1000),
  requested_by text not null,
  created_at timestamptz not null default now()
);

grant select, insert, update on rights_grants, publication_intents to media_app;
grant select, insert on publication_attempts, delivery_receipts, publication_revocations to media_app;
