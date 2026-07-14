# Install immutable verified extension artifacts

Status: accepted

Normal extension installation will consume immutable provenance-backed Extension Artifacts and create an exact Extension Installation Lock containing artifact identities and integrity, resolved capabilities, the Extension Host Adapter, and the upstream T3 Code target. Installation is one Extension Installation Transaction: resolution, verification, generated registration, checks, and activation either complete together or roll back together. Mutable branches and Git references are development-only; public npm packages with trusted-publishing provenance are preferred for normal bundles, with checksum-verified release archives allowed when native or unusually large assets require them.

## Considered Options

- Install from mutable Git references: convenient for development, but cannot make an installation reproducible or safely auditable.
- Publish independently versioned surface packages: uses normal package tooling, but breaks the atomic Extension Bundle contract.
- Publish one verified artifact with exact lock state: adds installer responsibilities, but makes adoption, rollback, support, and compatibility evidence reproducible.
