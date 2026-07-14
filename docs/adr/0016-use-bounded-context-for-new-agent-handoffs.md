# Use bounded context for new-agent handoffs

When Prompt Retargeting creates a new Coding Agent, Theo supplies an Agent Handoff Package containing the exact Prepared Prompt, execution identity, relevant response/history, current plan/diff/checks/blockers/decisions, applicable instructions/preferences, and references back to source threads. Secrets, unrelated chats, raw logs, and Theo reasoning are excluded. Theo summarizes the package before “Send it.” This gives the new agent enough continuity without copying an unbounded or privacy-leaking transcript.
