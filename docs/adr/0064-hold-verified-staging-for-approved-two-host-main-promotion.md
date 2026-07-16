# Hold verified Staging for an approved two-host Main promotion

Status: proposed — awaiting explicit acceptance of the hosted 2026-07-16 plan revision

Nightly automation may autonomously assemble and verify an exact candidate through the durable Nightly and Staging lanes. It then persists an immutable `awaiting-main-approval` record and leaves Main completely untouched: no admission closure, drain, snapshot, launcher stop, checkout movement, or relaunch.

Main promotion requires Jordan's fresh explicit approval bound to the exact held record, candidate revision, artifact vector, Public Base Lock, Private Overlay Lock, Combined Assembly Digest, and Nightly/Staging proofs. Missing, stale, replayed, or tampered approval refuses safely without re-resolving or re-staging the candidate. The hold and approval survive process restart.

Only after approval does one coordinated transaction close admission, completely drain product-owned work, snapshot the Linux primary and Mac launcher checkout, prepare both before activating either, activate and relaunch both, and verify the live application on both hosts. The drain includes orchestration and SQLite transactions, provider turns through fully processed terminal events, runtime ingestion, migrations, durable writes, streams, reactor/checkpoint queues, thread deletion, and registered background work. Already-admitted work may finish nested operations using inherited authority; unrelated work is refused and admission cannot reopen with unresolved work.

Any failure after either host changes restores both snapshots and verifies the previous Known-Good Assembly on both. A successful public result is `promoted` only when both hosts pass at the same approved assembly. Before that point, the only truthful successful automation result is `awaiting-main-approval`.

Protected artifact health is established by real activation receipts. Proof removes artifact-owned paths from an exact checkout, reinstalls the immutable artifact closure, performs frozen dependency installation, runs focused behavior and launcher checks from the activated tree, and binds all artifact, installed-tree, activation, behavior, path, and receipt digests. Operational logs remain protected and are omitted from public evidence.

On acceptance this ADR supersedes ADR 0044's no-human-approval rule and narrows ADR 0060 by placing the drain after exact approval. ADR 0045's complete verified rollback remains mandatory and now applies to both durable hosts.

## Considered Options

- Keep autonomous Main promotion: meets overnight readiness, but conflicts with current repository policy and allows a live two-host mutation without fresh approval of the exact evidence.
- Ask for approval before building Staging: safe but wastes the unattended verification window and gives the operator less evidence.
- Autonomously verify and hold durable Staging, then approve one exact two-host transaction: preserves overnight preparation while making the live mutation explicit, immutable, and recoverable.
