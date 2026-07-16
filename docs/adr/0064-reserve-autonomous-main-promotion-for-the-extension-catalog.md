# Reserve autonomous Main promotion for the Extension Catalog

Status: proposed — awaiting explicit acceptance of the revised 2026-07-16 hosted plan

The official T3 Extension Catalog promotion coordinator is the only workflow allowed to promote directly to Main without fresh human approval. This exception applies only to a Contract-Preserving Update assembled by that coordinator and fully proven through the durable Nightly and Staging lanes. Generic promotion commands, manual Staging, ordinary topic replays, external callers, non-catalog workflows, and material behavior or authority changes remain subject to the normal explicit Main-approval policy.

The coordinator mints a single-use autonomous eligibility record only after every required artifact, compatibility, permission, migration, activation, topic-parity, visual, headed, public-route, and product gate passes. The record binds the exact candidate revision, ordered artifact vector, Public Base Lock, Private Overlay Lock, Combined Assembly Digest, accepted behavior-contract revision, and Nightly/Staging proofs. Only the coordinator can mint or consume it. It cannot be enabled through configuration or a generic API. Missing, stale, replayed, tampered, already-consumed, non-catalog, or incomplete eligibility refuses without touching Main.

After consuming eligibility, one coordinated transaction closes admission, completely drains product-owned work, snapshots the Linux primary and Mac launcher checkout, prepares both before activating either, activates and relaunches both, and verifies the live application on both hosts. The drain includes orchestration and SQLite transactions, provider turns through fully processed terminal events, runtime ingestion, migrations, durable writes, streams, reactor/checkpoint queues, thread deletion, and registered background work. Already-admitted work may finish nested operations using inherited authority; unrelated work is refused and admission cannot reopen with unresolved work.

Any failure after either host changes restores both snapshots and verifies the previous Known-Good Assembly on both. A successful public result is `promoted` only when both hosts pass at the same eligible assembly. Otherwise the result is `held`, `refused`, `recovered`, or a critical recovery failure; incomplete proof is never reported as promotion.

Protected artifact health is established by real activation receipts. Proof removes artifact-owned paths from an exact checkout, reinstalls the immutable artifact closure, performs frozen dependency installation, runs focused behavior and launcher checks from the activated tree, and binds all artifact, installed-tree, activation, behavior, path, and receipt digests. Operational logs remain protected and are omitted from public evidence.

On acceptance this ADR narrows ADR 0044's autonomous authority to this one coordinator and expands ADR 0060's drain to the complete two-host product lifecycle. ADR 0045's complete verified rollback remains mandatory on both durable hosts. Any future attempt to expose, copy, configure, or broaden this authority is a Material Extension Change requiring a new accepted hosted plan.

## Considered Options

- Allow every fully verified Staging lane to promote autonomously: convenient, but turns a narrow product decision into generic deployment authority.
- Require approval for the Extension Catalog too: safest generic rule, but prevents the specifically requested fully proven overnight catalog upgrade from reaching Main before Jordan returns.
- Grant one unforgeable catalog-owned exception and keep every other path gated: preserves the requested overnight outcome while making the privilege narrow, testable, and non-reusable.
