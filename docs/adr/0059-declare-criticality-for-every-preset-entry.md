# Declare criticality for every preset entry

Status: accepted

Every extension selected by a preset declares Preset Entry Criticality as `required` or `optional`. This stack-level health role is independent of whether the Extension Bundle itself uses Required or Optional Host Capabilities. A directly installed extension defaults to `required`, because explicit adoption normally means its accepted behavior is part of the desired product.

An entry may be `optional` only when its unavailable and runtime-failed experiences are declared, compatibility-certified, acceptance-tested, visually disclosed, and safe for the rest of the graph. The resolver, installer, nightly assembly, Live Main Acceptance, and runtime health monitor use the same criticality. Automation cannot infer or change an entry to `optional` to avoid refusing an install or rolling back an unhealthy promotion.

## Considered Options

- Treat every installed extension as equally required: strong completeness, but prevents explicitly designed non-critical integrations from degrading safely.
- Infer criticality from Required Capability declarations: conflates an extension's internal dependencies with the stack owner's product expectations.
- Declare criticality per preset entry with evidence for optional behavior: adds preset metadata, but makes health and rollback policy explicit and reusable.
