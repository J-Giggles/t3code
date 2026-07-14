# Isolate and circuit-break extension runtime failures

Status: accepted

A brokered extension crash, hang, or protocol violation must not crash or indefinitely stall T3 Code. The host terminates the isolated execution boundary, records the exact failure, and may restart it only within a bounded retry and time budget. Exhausting that budget opens an Extension Circuit Breaker, disables the failing bundle, preserves its data, and presents the failure and recovery actions through the Extension Manager and nightly evidence.

If the failed bundle is required by the active stack, the assembly cannot pass Live Main Acceptance and an in-progress Autonomous Extension Promotion performs Verified Promotion Rollback. An optional bundle may remain disabled only when that exact degraded state was declared, compatibility-certified, acceptance-tested, and made visible; otherwise the active assembly is unhealthy.

## Considered Options

- Let extension failures terminate the host: simple process semantics, but violates T3 Code's availability and isolation goals.
- Restart indefinitely: may hide transient failures, but causes loops, load, data risk, and an unpredictable operator experience.
- Bound restarts, circuit-break, and apply stack criticality: adds health state and recovery UX, but contains failures and makes promotion outcomes deterministic.
