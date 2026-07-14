# Declare per-surface extension activation requirements

Status: accepted

Every Extension Bundle declares an Extension Activation Mode for each supported surface: `hot`, `restart`, `rebuild`, or `unsupported`. Before mutation, the installer presents one Extension Activation Plan for the complete Resolved Extension Graph, including required process restarts, desktop or native rebuilds, unavailable surfaces, and rollback actions. Activation occurs only when the whole graph is ready, so a bundle with native or Electron work cannot be represented as a simple hot install and a partially rebuilt preset cannot become active.

## Considered Options

- Treat every extension as runtime-loadable: attractive UX, but false for native and build-time integrations and unsafe under partial activation.
- Require a full rebuild for every extension: predictable, but needlessly slow for isolated runtime capabilities.
- Declare activation per surface: adds planning metadata, but gives adopters an honest impact and preserves transactional activation.
