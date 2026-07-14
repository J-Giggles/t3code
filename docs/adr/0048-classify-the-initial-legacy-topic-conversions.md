# Classify the initial legacy topic conversions

Status: accepted

The initial legacy topic inventory converts according to the following catalog boundary:

- Public Extension Bundles: `remote-access` for generic Tailscale support, `runtime`, `project-git`, `provider-settings`, `composer`, `prompt-settings`, `app-automation`, `project-agent-files`, and `observability`.
- Parent Extension Fold-Ins: `remote-access-reserved-routes`, `remote-access-staging-tailnet-paths`, `remote-access-staging-asset-prefixes`, and `remote-access-public-verifier-hardening` fold into `remote-access`; `runtime-staging-identity` folds into `runtime`.
- Jordan Operator Overlay: `dev-launch` and `nightly-omarchy-launcher` remain private or local-only. Reusable launch-profile behavior may later be proposed as a separate public contract, but machine-specific Omarchy wiring does not become public by implication.
- Platform Evidence Components: `desktop-tests`, `operations-docs`, and `topic-replay-safeguards` remain platform verification, documentation, and operations infrastructure rather than selectable catalog entries.
- Future public conversion: `on-the-go` becomes a public Extension Bundle only after it completes its Conversion Parity Gate.

This is a product classification, not a requirement to preserve current commit boundaries. Follow-up fixes become acceptance behavior of the owning bundle, while evidence components travel with and verify the platform or owning extensions.

## Considered Options

- Publish every replay topic as one extension: mechanically direct, but exposes historical commit boundaries and implementation-only topics as confusing product choices.
- Publish only the simplest UI topics: lowers initial scope, but leaves broadly reusable server, automation, and operations capabilities trapped in the fork.
- Classify by independently selectable user capability and fold supporting topics into owners: requires deliberate conversion, but produces a coherent public catalog and private overlay.
