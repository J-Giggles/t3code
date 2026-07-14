# Use versioned capability contracts

Status: accepted

The T3 Extension Host will expose small versioned Host Capabilities rather than one monolithic host API. Every extension declares required and optional capability ranges: an unmatched Required Capability refuses installation or activation, while an unmatched Optional Capability produces a visible supported degraded state recorded in a Capability Compatibility Report. This allows materially different upstream T3 Code versions to support honest subsets of the catalog and keeps compatibility decisions local to the affected capability, at the cost of maintaining capability versions and dependency resolution.

## Considered Options

- One host version for every surface: simpler version checks, but one unrelated upstream change makes the entire catalog appear incompatible.
- Versioned capabilities: more metadata and contract tests, but compatibility failures remain precise and extensions can degrade deliberately.
