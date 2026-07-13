# Reconfirm offline prompt handoffs after reconnect

When disconnected, T3 may preserve transcribed content as an Offline Draft, but remote actions and approvals fail closed. Saying “Send it” creates only a Pending Handoff; reconnection reads back the target and requires a fresh “Send it” instead of auto-submitting. Queue state reconciles without replaying old tones. This preserves useful dictation during outages without turning stale offline intent into surprising agent work later.
