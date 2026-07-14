# Migrate topics incrementally starting with prompt settings

Status: accepted

Legacy Replay Topics will move into the catalog through one Extension Conversion at a time rather than a big-bang rewrite. `prompt-settings` is the first tracer-bullet Extension Bundle because it exercises contracts, persisted settings, a visible settings panel, server behavior, provider integration, capability degradation, and the full install/disable/uninstall/reinstall lifecycle without the risk and scale of Remote Access or On-the-Go. A Legacy Replay Topic remains authoritative until the catalog bundle passes its Conversion Parity Gate on clean upstream; cutover is atomic and the legacy and catalog implementations cannot be active together.

## Considered Options

- Convert the entire stack together: reaches the final shape quickly, but makes host, installer, and feature regressions impossible to isolate.
- Pilot a tiny follow-up fix: lowers initial effort, but does not exercise enough host surfaces to validate the architecture.
- Pilot `prompt-settings` and migrate incrementally: delivers a representative vertical slice while keeping rollback and comparison tractable.
