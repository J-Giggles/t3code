# Use a stable Extension Host with a minimal bootstrap patch

Status: accepted

Catalog extensions will integrate through a small stable in-process T3 Extension Host rather than applying feature patches throughout T3 Code. Each materially different upstream T3 Code version may require an Extension Host Adapter, and an upstream version without native host support receives one minimal Bootstrap Patch; source patching remains a host bootstrap and recovery mechanism, not the ordinary extension format. This concentrates upstream compatibility work at one boundary and keeps extension packages independently testable, at the cost of designing and maintaining a deliberate host contract.

## Considered Options

- Continue source-patch installation for every feature: cheapest initially, but repeats upstream merge work across the whole catalog.
- Run every extension out of process: strong isolation, but cannot provide rich in-process UI and platform integration without recreating a host contract anyway.
- Stable in-process host plus version adapters: isolates most upstream movement while retaining deep UI, server, desktop, and mobile integration.
