# Roll back and verify failed live promotions

Status: accepted

If Live Main Acceptance fails after an Autonomous Extension Promotion, automation must perform a Verified Promotion Rollback to the exact pre-promotion Main commit, Extension Installation Lock, configuration, and required data snapshots. It then relaunches Main and reruns the live acceptance journey against the restored service. The failed candidate, logs, lock, visual evidence, migration evidence, and rollback evidence remain immutable for diagnosis and must not be silently retried as a new promotion.

If the restored Main passes, the incident is reported with Main identified as recovered on the previous lock. If restoration or its live verification fails, automation stops, raises a critical alert, and makes no further candidate or destructive repair attempt.

## Considered Options

- Leave the failed Main candidate running for diagnosis: preserves the failure in place, but knowingly leaves the operator's primary lane unhealthy.
- Revert source only and restart: misses extension artifacts, configuration, and migrated data, so it cannot reproduce the previous known-good state.
- Restore the complete prior state and verify it live: requires snapshots and careful orchestration, but gives rollback the same evidence standard as promotion.
