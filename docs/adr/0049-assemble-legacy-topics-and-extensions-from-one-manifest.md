# Assemble legacy topics and extensions from one manifest

Status: accepted

During incremental conversion, nightly uses one Stack Assembly Manifest to pin the exact upstream T3 Code commit, Extension Host Adapter and Bootstrap Patch, ordered remaining Legacy Replay Topics, exact Extension Installation Lock, and Platform Evidence Components. Assembly starts from upstream, attaches the host, replays the remaining legacy topics, installs the locked Resolved Extension Graph transactionally, and then runs the combined evidence contract.

Each Extension Conversion completes through one Assembly Cutover that removes the capability from legacy replay and adds its Extension Bundle Version to the lock. Validation rejects duplicate ownership, a topic present in both forms, an unpinned artifact, or evidence that does not match the assembled revision. The mixed-mode model remains until all eligible topics have converted; private/local overlay entries may continue to be locked alongside public bundles without widening their visibility.

## Considered Options

- Maintain independent replay and extension manifests: separates tooling, but allows them to drift and activate duplicate implementations.
- Stop nightly replay until all topics are converted: produces a clean endpoint, but creates an impractical big-bang migration and suspends upstream compatibility proof.
- Assemble both forms from one exact manifest with atomic cutovers: adds a transition schema, but keeps every nightly candidate reproducible and mutually exclusive.
