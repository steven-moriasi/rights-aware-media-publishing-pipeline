# Threat model

## Protected assets

Source media, rendition objects, upload integrity, immutable lineage, review decisions, rights boundaries, delivery state, and audit evidence.

## Material threats and controls

| Threat | Control | Evidence |
|---|---|---|
| Oversized or multipart exhaustion | 25 MiB total, 5 MiB parts, 100-part cap, two-hour expiry | schema constraints and ingest tests |
| Content-type spoofing | MP4/WAV signature checks before promotion | hostile fixture tests |
| Malware fixture | deterministic EICAR-signature adapter and quarantine | ingest tests and quarantine state |
| Parser exploitation | read-only worker, no-new-privileges, bounded tmpfs, supported codec scope | Compose configuration |
| Source substitution | SHA-256 recheck before every transform | worker contract |
| Duplicate or conflicting publication | idempotency key, stable provider key, append-only attempts | runtime verification |
| Approval self-dealing | requester cannot decide the same review | review decision tests |
| Out-of-territory release | execution-time destination, territory, rendition, and time evaluation | rights decision table |
| Timeout interpreted as success | explicit `unknown` state and operator reconciliation | runtime verification |
| Leaked delivery link | five-minute signed scope plus current-state check | token tests and revocation exercise |
| Audit deletion or rewrite | hash chain plus append-only database trigger | verification command |
| Sensitive telemetry | aggregate metrics omit actor, filename, object key, and asset ID | protected metrics endpoint |

## Residual risk

The deterministic scan adapter is not a substitute for a maintained malware engine. FFmpeg remains a high-risk parser and production isolation should add seccomp, egress policy, CPU/memory limits, patched images, and disposable workers. Local secrets and synthetic actor headers are development-only.
