# Retain the known-good assembly when upstream breaks a capability

Status: accepted

When a newer upstream T3 Code commit removes or changes a Required Capability, an Extension Host Adapter may use Capability Emulation only if it preserves the complete accepted semantics, permission boundary, failure behavior, and invariants and passes the capability and product evidence at that exact upstream revision. An approximate fallback, silent degradation of a required capability, or broad core patch is not a compatibility success.

If full emulation cannot be proven, certification marks the candidate unsupported and nightly does not promote it. Main remains on its Known-Good Assembly, and the nightly review publishes a decision plan describing the removed seam, affected extensions, available redesign or retirement choices, and the evidence required to resume upstream movement.

## Considered Options

- Always follow latest upstream and disable affected extensions: keeps core current, but silently sacrifices the operator's accepted product contract.
- Carry an unconstrained compatibility patch until tests pass: can mask semantic and security drift and recreates an unbounded fork.
- Emulate only with complete contract proof, otherwise retain known-good Main: may delay upstream adoption, but preserves reliability and makes the required product decision explicit.
