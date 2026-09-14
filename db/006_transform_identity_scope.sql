alter table transform_jobs
  drop constraint transform_jobs_transform_identity_key;

alter table transform_jobs
  add unique (asset_version_id, transform_identity);
