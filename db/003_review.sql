create table rendition_specs (
  id text primary key,
  version integer not null check (version > 0),
  description text not null,
  output_media_type text not null,
  created_at timestamptz not null default now()
);

insert into rendition_specs (
  id,
  version,
  description,
  output_media_type
)
values (
  'review-v1',
  1,
  'Bounded H.264 or MP3 review rendition for constant-frame-rate synthetic fixtures.',
  'media-dependent'
);

create table transform_jobs (
  id uuid primary key default gen_random_uuid(),
  asset_version_id uuid not null references asset_versions(id),
  spec_id text not null references rendition_specs(id),
  transform_identity text not null unique check (transform_identity ~ '^[a-f0-9]{64}$'),
  state text not null default 'queued'
    check (state in ('queued', 'leased', 'completed', 'failed', 'quarantined')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  worker_id text,
  lease_until timestamptz,
  output_object_key text,
  output_sha256 text check (output_sha256 is null or output_sha256 ~ '^[a-f0-9]{64}$'),
  output_media_type text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index transform_jobs_claim_idx
  on transform_jobs (state, lease_until, created_at);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  asset_version_id uuid not null references asset_versions(id),
  state text not null default 'pending'
    check (state in ('pending', 'approved', 'rejected')),
  revision integer not null default 1 check (revision > 0),
  requested_by text not null,
  decided_by text,
  decision_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (asset_version_id)
);

create table annotations (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references reviews(id) on delete cascade,
  timecode_ms integer not null check (timecode_ms >= 0),
  body text not null check (length(body) between 1 and 2000),
  created_by text not null,
  created_at timestamptz not null default now()
);

create table transcript_cues (
  id uuid primary key default gen_random_uuid(),
  asset_version_id uuid not null references asset_versions(id) on delete cascade,
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null check (end_ms > start_ms),
  body text not null check (length(body) between 1 and 2000),
  unique (asset_version_id, start_ms, end_ms)
);

grant select on rendition_specs to media_app;
grant select, insert, update on transform_jobs, reviews, annotations, transcript_cues to media_app;
