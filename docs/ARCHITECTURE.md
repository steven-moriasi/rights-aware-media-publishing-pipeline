# Architecture and authority boundaries

FrameRights is a modular monolith with one independently scaled transform worker.

## Systems of record

- PostgreSQL owns upload session state, immutable media-version metadata, transform identity and leases, review decisions, rights grants, publication intent, delivery receipts, revocation, cleanup evidence, and audit hashes.
- MinIO owns staged upload parts, verified source objects, and validated rendition objects. Object keys are immutable after promotion.
- Source binaries are unavailable until declared size, SHA-256, media signature, and deterministic scanner checks pass.
- Renditions are rebuildable from immutable source checksum plus the versioned transform specification.
- The deterministic sandbox publisher owns no authority. Its ambiguous outcome is represented as `unknown` until reconciliation records a receipt.

## Trust boundaries

Browser requests carry a bounded synthetic actor and role. Production deployment would replace this demonstrator context with an authenticated session and asset-scoped authorization. Operations endpoints use a separate secret and return aggregate dimensions only. Delivery tokens are short-lived, publication-scoped HMAC capabilities; the content endpoint checks current publication state so revocation overrides an otherwise unexpired token.

The FFmpeg worker runs read-only with a bounded temporary filesystem and no-new-privileges. It can reach only the local database and S3-compatible service in the reference stack. Transform output is promoted only after ffprobe yields a valid duration and the output checksum is recorded.

## Supported media surface

The ingest demonstrator accepts bounded MP4 and WAV files no larger than 25 MiB and at most 100 parts. Review rendition timing evidence is limited to self-created constant-frame-rate fixtures. Archives, adaptive streaming ladders, variable-frame-rate editorial guarantees, DRM, broadcast signaling, and arbitrary codecs are unsupported.
