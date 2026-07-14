# Release each extension as an atomic multi-package bundle

Status: accepted

Each catalog entry will release one user-visible capability as an atomic Extension Bundle with one Extension Bundle Version. A bundle may contain separate contracts, server, client-runtime, web, desktop, mobile, test, and documentation packages, but those parts install, upgrade, verify, remove, and replay together; surfaces that the extension does not need are omitted. This preserves package and component boundaries without allowing one feature's cross-surface behavior, safety contract, or evidence to drift across independently released fragments.

## Considered Options

- Release each platform package independently: maximizes reuse, but creates a compatibility matrix inside every feature and permits partial upgrades.
- Keep every feature in one source package: simple versioning, but weak package boundaries and poor platform-specific ownership.
- One atomic bundle containing surface-specific packages: retains componentization while keeping feature behavior and evidence coherent.
