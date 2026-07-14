# Start with capability families derived from current seams

Status: accepted

The first T3 Extension Host contract is limited to Host Capabilities required by accepted conversions and groups their discovery under ten Host Capability Families:

1. settings and configuration registration;
2. typed server RPC and service registration;
3. web and mobile UI slots and navigation;
4. client-runtime state and event contributions;
5. provider prompts, settings, usage, and control actions;
6. project services and project-scoped UI;
7. desktop IPC, shell automation, and MCP tools;
8. routed HTTP and WebSocket exposure;
9. telemetry and observability;
10. host-owned storage, migrations, permissions, and lifecycle.

These are discovery and documentation families, not ten monolithic interfaces. Each concrete Host Capability remains independently named, versioned, permission-scoped, certifiable, and optional or required per Extension Bundle. A capability is added only when an accepted extension needs a stable product contract; current file paths and symbols are adapter evidence, not public APIs.

## Considered Options

- Expose the current repository modules directly: quickest conversion, but binds extensions to unstable paths and recreates patch fragility.
- Design a comprehensive SDK before converting a tracer bullet: might appear complete, but would guess at seams without executable extension evidence.
- Start with capability families derived from current integrations and add small contracts on demand: requires disciplined evolution, but keeps the Host narrow and evidence-led.
