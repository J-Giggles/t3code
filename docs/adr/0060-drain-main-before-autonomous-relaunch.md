# Drain Main before autonomous relaunch

Status: accepted

Autonomous Extension Promotion must complete a Main Promotion Drain before mutating or relaunching Main. The drain stops admission of new interruptible work and waits within a declared bounded window for active agent turns, durable writes, extension migrations, streams, and other non-interruptible operations to reach a safe checkpoint. The promotion evidence records what was drained, the deadline, and the resulting durable state.

If Main cannot drain safely within the window, the candidate is held without changing Main and may be retried in a later eligible window. Automation must not terminate an active user or agent session, abandon an unknown write outcome, or force migration interruption merely to complete before the operator returns.

## Considered Options

- Restart at a fixed overnight time regardless of activity: predictable scheduling, but can lose turns, streams, or durable state.
- Wait indefinitely for idleness: preserves work, but can wedge promotion and conceal a stuck operation.
- Use a bounded safe drain and hold on timeout: adds activity tracking and retry orchestration, but protects live work while keeping automation deterministic.
