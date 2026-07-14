# Curate the official catalog and require explicit permission grants

Status: accepted

The initial public ecosystem will use a curated official Trusted Extension Catalog, while third-party catalogs require explicit trust-source configuration and a known publishing identity. Compatibility Host Capabilities remain separate from security-sensitive Extension Permissions for filesystem writes, network access, process execution, secrets and providers, UI and lifecycle registration, and native device authority. Installation requires an Extension Permission Grant, and an upgrade that requests broader authority pauses for renewed confirmation; a stack preset cannot grant permissions silently. This limits ecosystem openness initially in exchange for making third-party code execution and authority changes visible and auditable.

## Considered Options

- Open unmoderated marketplace: lowers publishing friction, but makes catalog browsing an unsafe path to arbitrary code execution.
- Curated official catalog only: strongest default control, but prevents independent publishers from distributing compatible work.
- Curated official catalog plus opt-in trusted catalogs: keeps safe defaults while preserving an explicit path for third parties.
