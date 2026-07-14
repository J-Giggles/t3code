# Split public and private extension lock state

Status: accepted

The Jordan Base Stack uses a Public Base Lock and non-secret Extension Configuration Profile committed to the public T3 Code fork. The Jordan Operator Overlay uses a Private Overlay Lock and machine-local configuration stored under protected T3 Code state outside the public repository. Secret values remain separate host bindings under the Extension Secret Reference contract and appear in neither lock.

Nightly assembly computes a Combined Assembly Digest binding both locks, the upstream revision, Extension Host Adapter, and Stack Assembly Manifest. Tailnet evidence may disclose the digest, health, versions where safe, and redacted overlay contract results, but not private artifact locations, configuration, identities, or bindings. Verified Promotion Rollback snapshots and restores both sides of the split as one known-good assembly.

## Considered Options

- Commit one combined lock to the public fork: maximizes simple reproducibility, but exposes private extension identities and operational metadata.
- Keep all lock state machine-local: protects privacy, but makes the public base difficult to reproduce, review, or contribute to.
- Commit the public base, protect the private overlay, and bind both by digest: adds split-state tooling, but preserves public reproducibility and private operations together.
