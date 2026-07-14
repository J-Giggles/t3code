# Include an authoring kit in the first public release

Status: accepted

The first public extension-platform release includes an Extension Authoring Kit rather than publishing only Jordan's completed bundles. It provides a `create-t3-extension` scaffold; bundle, capability, permission, configuration, data-migration, test, documentation, and visual-contract templates; an isolated local host with deterministic capability and failure fakes; compatibility and acceptance harnesses; catalog, license, provenance, and permission validation; and local artifact build and install flows.

The kit includes one deliberately small reference extension and one multi-surface reference extension demonstrating atomic packaging, brokered execution, UI contribution, lifecycle, failure isolation, certification, visuals, and publication evidence. Authoring-kit checks run in contributor pull requests and must reproduce the same contracts used by official catalog builds.

## Considered Options

- Publish bundles first and document authoring later: accelerates Jordan's conversion, but leaves the catalog effectively closed to outside contributors.
- Provide prose documentation without executable fakes and examples: easier to maintain initially, but makes contributors guess at contracts and CI failures.
- Make the executable authoring kit part of release acceptance: adds initial scope, but proves the ecosystem is reusable rather than merely extracted from one fork.
