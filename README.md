# Rights-Aware Media Publishing Pipeline

A synthetic reference implementation for resumable media ingest, verified immutable promotion, reproducible transformations, accessible time-based review, execution-time rights evaluation, uncertain sandbox delivery outcomes, and compensating revocation.

The implementation is a modular monolith. PostgreSQL owns lifecycle metadata and state machines. MinIO owns staged and promoted binary objects. Next.js provides the product and API surface. Durable workers use PostgreSQL leases and FFmpeg-compatible transform contracts.

## Foundation

- Pinned Next.js, TypeScript, PostgreSQL, and MinIO dependencies.
- Bounded actor roles for producers, reviewers, rights managers, publishers, and operators.
- Upload sessions with explicit expiry, part limits, checksums, and promotion states.
- Browser-managed multipart upload with pause and resume behavior.
- Server-side verification of declared size, SHA-256, bounded media signatures, and a deterministic scanner fixture.
- Immutable asset versions with source-object and checksum lineage.
- Quarantine and append-only audit evidence.
- Idempotent review rendition identity keyed by source checksum and versioned specification.
- PostgreSQL job leases with worker-kill recovery and poison-job quarantine.
- FFmpeg and ffprobe validation inside a read-only, no-new-privileges worker.
- Accessible native media controls, transcript cues, and time-addressed annotation evidence.
- Optimistic review revisions and requester/reviewer separation of duties.
- Time-, territory-, rendition-, and destination-bounded rights grants.
- Scheduled publication intents with idempotency keys and execution-time approval and rights checks.
- Explicit unknown delivery outcomes, operator reconciliation, and append-only receipts.
- Five-minute signed delivery scopes that stop serving immediately after compensating revocation.
- Hash-chained append-only audit events and protected aggregate operations metrics.
- Expired-part cleanup plus PostgreSQL and object-volume backup and restore exercises.
- Local-only object-store and database ports.
- A truth-boundary-first product shell.

## Limits

Fixtures must be self-created, public-domain, or explicitly licensed. Destinations are local or sandboxed. Initial timing guarantees cover constant-frame-rate fixtures only. This is not a DRM, broadcast-compliance, universal frame-accuracy, real CDN, or studio-scale system.

## Local verification

Prerequisites: Node.js 22.22.2, npm, Docker with Compose, `curl`, and `jq`.

```sh
cp .env.example .env
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
docker compose config --quiet
```

The local stack exposes the application at `http://127.0.0.1:3004`, MinIO at loopback ports `9000` and `9001`, and PostgreSQL at loopback port `5436`.

With the stack running:

```sh
npm run verify:stack
npm run verify:audit
npm run verify:benchmark
npm run verify:recovery
```

Architecture, threat boundaries, evidence, operational signals, and response procedures are documented under `docs/`.
