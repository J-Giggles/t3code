# Certify compatibility against upstream commits

Status: accepted

Extension compatibility will be established by Extension Compatibility Certification against exact upstream T3 Code commits or proven commit ranges, not inferred from optimistic semantic-version declarations. Certification records the Extension Host Adapter, exposed capability versions, tested extension versions, supported degradation, checks, and timestamp. Normal installation refuses `unknown` and `unsupported`; `certified-with-degradation` is valid only when every Required Capability passed and the absent Optional Capabilities have explicit verified behavior. A development-only unsafe override may investigate a new upstream version but cannot create a distributable lock or support claim.

## Considered Options

- Trust semantic version ranges: conventional, but unsuitable while upstream interfaces and product seams change without a stable extension contract.
- Attempt installation and accept a green build: catches syntax drift but does not prove behavior, lifecycle, permissions, or invariants.
- Evidence certification against upstream commits: costs continuous test capacity, but makes support claims reproducible and fail-closed.
