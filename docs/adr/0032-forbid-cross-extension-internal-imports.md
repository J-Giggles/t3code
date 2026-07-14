# Forbid direct imports between extension internals

Status: accepted

Extension Bundles will collaborate only through versioned Host Capabilities; one bundle may act as an Extension Capability Provider, but another bundle cannot import its internal packages or files. Installation resolves a cycle-free Resolved Extension Graph before mutating T3 Code, and optional integrations remain explicit Optional Capabilities. This preserves independent installation and replacement when upstream or another extension changes, at the cost of promoting genuinely shared behavior into a deliberate host capability instead of taking a convenient internal dependency.

## Considered Options

- Permit package imports between extensions: convenient inside one monorepo, but turns the catalog back into an inseparable stack.
- Use capabilities for every cross-extension relationship: requires clearer contracts, but makes dependencies observable, testable, and replaceable.
