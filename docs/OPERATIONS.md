# Operations and recovery

## Signals

- queued and leased transform jobs, oldest queue age, and poison quarantine;
- source storage bytes and immutable version count;
- unknown publication count and age;
- revocation count;
- cleanup run counts;
- correlated `x-request-id` response headers.

Metrics intentionally omit actor IDs, filenames, object keys, asset IDs, annotations, and rights details.

## Recovery contracts

Transform jobs use 45-second leases. A killed worker leaves a lease that another worker can reclaim; the third failed lease quarantines the job. Transform identity prevents duplicate outputs from representing distinct lineage.

Publication timeouts remain unknown. Reconciliation uses the stable sandbox provider key and may add a delivery receipt without publishing a second object. Revocation is a separate append-only command and immediately disables delivery access.

Authority backup includes a PostgreSQL custom-format archive and the object-store data volume, each covered by a SHA-256 manifest. Verification restores PostgreSQL into a disposable database and objects into a disposable volume.
