# Runbooks

## Stuck upload

Inspect upload state and expiry, then run the protected cleanup endpoint. Never promote incomplete parts manually. Confirm the cleanup audit event and removed-part count.

## Malicious or malformed file

Keep the upload quarantined, retain the reason code, and do not expose staged objects. In production, route the digest and scanner evidence to the security process without logging filenames or binary content.

## Poison transform

Inspect the final bounded worker error and source checksum. Do not increase attempts blindly. Validate the fixture against the documented media surface, patch or pin the parser image, then create a new transform specification version before retrying.

## Unknown publication

Do not retry publication as a new intent. Query the destination with the stable provider key, call reconciliation with the observed result, and preserve the unknown attempt.

## Accidental release

Issue a rights-manager revocation with a concise reason. Confirm the publication is `revoked`, existing signed delivery URLs return unavailable, and a revocation audit event exists.

## Authority restore

Run `scripts/verify-authority-recovery.sh`. Review checksum verification, restored database evidence, and restored object-file count before using the same procedure against a controlled target.
