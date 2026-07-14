# Publish stable and immutable tailnet nightly reviews

Status: accepted

Every nightly assembly publishes a self-contained Immutable Nightly Run Page containing its status (`promoted`, `recovered`, `held`, or `needs decision`), exact upstream and source revisions, Stack Assembly Manifest, Extension Installation Lock, per-topic and per-extension changes, accepted or proposed plans, certifications, test evidence, screenshots and diagrams, Live Main Acceptance, and any rollback evidence. The page is bound to its source revision and checksum and remains available after later runs.

One stable tailnet-only Nightly Extension Dashboard points to the latest run and summarizes historical outcomes. A concise morning notification links to the dashboard whenever Main changes, a promotion recovers through rollback, or a run needs attention. The notification is a routing summary; the hosted page remains the authoritative evidence.

## Considered Options

- Replace one mutable report nightly: simple access, but destroys historical evidence and makes past promotion claims unauditable.
- Publish only immutable run URLs: preserves history, but gives the operator no dependable morning entry point.
- Combine a stable latest dashboard with immutable run pages: requires an index and retention policy, but provides both predictable access and durable provenance.
