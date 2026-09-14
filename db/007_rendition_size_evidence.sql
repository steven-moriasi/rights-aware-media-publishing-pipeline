alter table transform_jobs
  add column output_size_bytes bigint
    check (output_size_bytes is null or output_size_bytes > 0);
