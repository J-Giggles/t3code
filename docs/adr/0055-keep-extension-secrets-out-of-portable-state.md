# Keep extension secrets out of portable state

Status: accepted

Extension presets and locks may carry configuration schemas and schema-validated portable non-secret values through an Extension Configuration Profile. They must never contain credentials, credential material, or machine-specific secret values. An extension requests each credential through an Extension Secret Reference, and the host prompts the adopter to bind that reference to an adopter-controlled local secret store before activation.

Artifacts, catalog metadata, presets, Installation Locks, exports, logs, screenshots, hosted plans, and nightly evidence must redact secret values and may record only the reference name, required scope, binding state, and non-sensitive provenance. Moving a preset or lock to another machine requires new local bindings and cannot silently copy credentials.

## Considered Options

- Store encrypted secret values in the preset: improves portability, but couples distribution state to key management and risks publishing recoverable credentials.
- Let each extension read arbitrary environment variables: easy to implement, but bypasses permission, provenance, redaction, and lifecycle controls.
- Keep portable configuration separate and broker named secret references through the host: adds binding UX, but makes sharing and evidence safe by construction.
