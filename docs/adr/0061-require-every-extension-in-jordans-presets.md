# Require every extension in Jordan's presets

Status: accepted

Every Extension Bundle selected by the Jordan Base Stack or Jordan Operator Overlay has `required` Preset Entry Criticality. Jordan Stack Completeness therefore requires every selected bundle to install, activate, remain healthy, and pass its accepted live behavior before Main can complete Autonomous Extension Promotion or Live Main Acceptance. A selected bundle cannot be silently disabled or reclassified as optional to produce a superficially green morning state.

Individual Extension Bundles may still use Optional Capabilities with certified degraded behavior. That internal capability degradation is distinct from accepting an unavailable bundle, and it must remain within the bundle's accepted contract.

## Considered Options

- Mark observability or operator tooling optional to maximize uptime: reduces rollbacks, but contradicts the requirement that Jordan's selected stack be fully confirmed working.
- Let nightly temporarily downgrade failing entries to optional: keeps promotion moving, but mutates product expectations without approval.
- Require every selected Jordan bundle while permitting declared optional capability degradation inside it: makes the complete chosen stack the acceptance boundary.
