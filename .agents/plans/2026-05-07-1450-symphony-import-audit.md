# Symphony imported app integration and harness audit

**Branch:** feat/symphony-import-audit
**Worktree:** /home/jgigg/code/t3code-symphony-import-audit
**Started:** 2026-05-07T14:50:00+02:00

## Goal
Add a staged T3 Code integration for Symphony as a separate imported app first, with an embedded T3 Code dashboard and a blocking Harness Engineering audit for imported agentic apps.

## Plan
- [ ] Add shared imported-app contracts for registration, launch state, runtime summary, audit reports, remediation prompts, and activation failures.
- [ ] Add server-side imported-app registry persistence and authenticated HTTP/RPC endpoints for register/list/detail/audit/launch/stop/runtime/activate.
- [ ] Implement a generic Harness Engineering audit service that blocks activation on required failures and generates subagent remediation prompts.
- [ ] Add a Symphony imported-app adapter that detects the local Symphony checkout, launches it as an external process, polls available runtime state, and adds Symphony-specific audit checks.
- [ ] Extend the dev runner to optionally launch registered imported apps alongside T3 Code with attributed process logs and clean shutdown.
- [ ] Add an embedded web dashboard for imported apps, Symphony runtime state, audit findings, activation gating, and copyable remediation prompts.
- [ ] Cover contracts, server endpoints, audit behavior, launcher behavior, Symphony adapter behavior, and web states with focused tests.
- [ ] Run `bun fmt`, `bun lint`, `bun typecheck`, and relevant `bun run test` suites before feature-complete.

## Acceptance criteria
- A local Symphony checkout can be registered in T3 Code without vendoring it into the monorepo.
- One dev workflow can launch T3 Code and the registered Symphony service together.
- T3 Code shows Symphony launch state, runtime summary, audit status, blocking failures, and remediation prompts in an embedded dashboard.
- Imported apps cannot be activated when required Harness Engineering audit checks fail.
- Audit failures include exact evidence, what to fix, and ready-to-paste subagent prompts.
- The imported-app framework is generic enough for future app kinds, with Symphony implemented as the first adapter.

## Notes
- Phase 1 keeps Symphony separate and launched externally; phase 2 can merge Symphony runtime concepts natively after the external integration proves useful.
- Audit policy defaults to block-on-required-failures.
- The audit profile is based on OpenAI's Harness Engineering guidance and the Symphony service specification supplied in the initial request.
- Default source handling is local-path registration for an already-cloned Symphony checkout; automatic cloning is out of scope for the first pass.
- Keep Symphony-specific logic out of the existing provider/session stack. It should sit in a new imported-app domain beside T3 Code's current orchestration/provider layers.
