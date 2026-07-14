# Broker extension execution by default

Status: accepted

Extension permissions are an enforceable runtime boundary, not disclosure alone. Brokered Extension Execution is the default for official, community-verified, and external bundles: server logic runs in an isolated worker or process, UI is sandboxed or rendered by host-owned components from validated contributions, and access to T3 Code, the host machine, services, data, and secrets occurs only through granted Host Capabilities and Extension Secret References.

Integrated Extension Execution is an official-only exception for a capability that cannot be safely or adequately implemented through brokering. It runs same-process or at build time, is disclosed as full-trust code, requires Privileged Extension Review and explicit adopter authorization, uses `rebuild` activation, and cannot claim granular runtime containment. Community-verified and external extensions cannot request or be upgraded into integrated execution.

## Considered Options

- Treat source review and signatures as the only sandbox: provides provenance, but arbitrary in-process code can bypass permissions after installation.
- Require every extension to use the same-process host for maximum UI integration: performs well, but turns third-party installation into unrestricted code execution.
- Broker by default with a narrow official full-trust exception: adds process and UI boundary work, but makes permissions meaningful while retaining an honest escape hatch for deep integrations.
