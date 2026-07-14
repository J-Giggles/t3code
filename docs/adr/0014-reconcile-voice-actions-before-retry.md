# Reconcile state-changing voice actions before retry

Every state-changing Voice Action carries a durable Voice Action Identity. After a disconnect, T3 reconciles that identity before doing anything: completed actions are reported without rerun, actions proven not to have started may be offered for retry, and unknown outcomes block repetition until reconciliation or explicit recovery. Read-only actions may retry automatically. This favors at-most-once side effects over misleading seamless retries.
