# Use a separate public extension monorepo

Status: accepted

The T3 Extension Catalog and Jordan Extension Stack will live in a separate public monorepo, provisionally `J-Giggles/t3code-extensions`, rather than inside the ping.gg-derived T3 Code repository. The Extension Catalog Repository owns host contracts and adapters, bundles, catalog metadata, presets, installer tooling, compatibility evidence, and documentation; T3 Code consumes immutable releases and retains only its minimal host attachment and installation state. One monorepo keeps cross-cutting compatibility and release work coherent while the ecosystem is young, and catalog identities must remain portable so a bundle can move to its own repository later.

## Considered Options

- Keep the catalog inside the T3 Code fork: simplest local development, but couples reusable extension history and distribution to upstream rebases.
- Use a Git submodule: separates history but leaks source-layout coupling into every adopter's checkout.
- Separate public monorepo with released artifacts: adds a two-repository integration boundary, but gives the extension ecosystem an independent lifecycle and public contribution surface.
