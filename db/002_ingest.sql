alter table upload_sessions
  add column promoted_version_id uuid unique references asset_versions(id);

create index upload_sessions_expiry_idx
  on upload_sessions (expires_at)
  where state in ('initiated', 'uploading');

create index asset_versions_asset_idx
  on asset_versions (asset_id, version_number desc);

grant select, update on upload_sessions to media_app;
