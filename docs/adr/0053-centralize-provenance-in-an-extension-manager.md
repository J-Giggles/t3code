# Centralize provenance in an Extension Manager

Status: accepted

T3 Code will provide a host-owned Extension Manager that exposes each installed or discoverable extension's source catalog, Extension Support Tier, exact version and artifact digest, compatibility certification, requested and granted permissions, retained data state, activation impact, update evidence, and lifecycle actions. Install, update, disable, uninstall, rollback, and purge decisions use this interface and the same underlying host contracts.

Extension-contributed UI must provide Extension Provenance Disclosure in contextual details and whenever an action requests or exercises sensitive authority. Ordinary controls do not carry permanent extension badges or watermarks solely to advertise implementation ownership; the Extension Manager and contextual disclosure must still make ownership reachable and unambiguous.

## Considered Options

- Permanently badge every extension control: maximizes visibility, but clutters the product and makes extensions feel visually second-class.
- Hide extension ownership after install: clean presentation, but prevents informed permission, support, and troubleshooting decisions.
- Centralize full provenance and disclose ownership contextually at sensitive boundaries: preserves a cohesive product while keeping authority and support inspectable.
