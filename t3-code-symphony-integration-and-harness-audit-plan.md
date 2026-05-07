# T3 Code + Symphony Integration and Harness Audit Plan

## Summary

Build this in two phases.

Phase 1 keeps Symphony and T3 Code as separate applications, but makes T3 Code the operator surface:

- T3 Code can register an imported app/repo, with Symphony as the first supported adapter.
- One shared dev command launches both T3 Code and Symphony.
- T3 Code shows an embedded Symphony dashboard for runtime state, audit status, and remediation prompts.
- Imported apps are blocked from becoming "active integrations" until they pass a required Harness Engineering audit.

Phase 2 collapses the separation:

- Move Symphony’s core runtime into first-class T3 Code server packages.
- Retire the external-service boundary while preserving the same imported-app audit model and UI.

This plan assumes the first deliverable is a reusable imported-app framework, with Symphony as the first concrete adapter.

## Product Intent

T3 Code becomes the control plane for external agent-oriented apps brought into a project. For Symphony specifically, T3 Code should:

- register the repo/service
- launch it alongside T3 Code in local development
- inspect whether it follows the Harness Engineering operating model
- block activation when required harness rules fail
- tell the user exactly what to fix
- generate ready-to-paste subagent prompts for fixing each gap in the imported repo

Out of scope for phase 1:

- rewriting Symphony into native T3 Code runtime code
- supporting non-Symphony adapters beyond the generic model and one concrete implementation
- automatic code modification of the imported repo from T3 Code itself
- full Linear integration inside T3 Code

## Architecture

### 1. New domain: Imported Apps

Add a new imported-app domain in T3 Code server and contracts.

Core entity:

- `ImportedApp`
  - `id`
  - `kind`: initially `"symphony"`
  - `displayName`
  - `source`
    - `repoUrl`
    - `localPath`
    - `defaultBranch`
  - `launch`
    - `mode`: `"external-dev-command" | "http-only"`
    - `command`
    - `cwd`
    - `env`
  - `status`
    - `registrationStatus`
    - `launchStatus`
    - `auditStatus`
    - `activationStatus`
  - `createdAt`
  - `updatedAt`

T3 Code remains system-of-record for imported app registration and audit state. The imported repo remains system-of-record for its own code and docs.

### 2. New domain: Harness Audit

Add a generic audit engine that runs repository checks against an imported app path.

Audit output:

- `ImportedAppAuditReport`
  - `appId`
  - `frameworkVersion`
  - `generatedAt`
  - `overallStatus`: `"pass" | "fail"`
  - `score`
  - `checks`
  - `requiredFailures`
  - `advisoryFailures`
  - `remediationPrompts`

Each check has:

- `checkId`
- `title`
- `severity`: `"required" | "advisory"`
- `status`: `"pass" | "fail" | "not-applicable"`
- `evidence`: file paths, command findings, extracted values
- `whyItMatters`
- `whatToFix`
- `subagentPrompt`

### 3. Symphony adapter

Phase 1 treats Symphony as an external service adapter.

Responsibilities:

- detect and store Symphony repo metadata
- validate that required files exist
- launch Symphony via configured dev command
- poll or read Symphony HTTP status endpoints when available
- normalize Symphony runtime state into T3 Code contracts
- expose adapter-specific audit checks in addition to generic harness checks

Use an adapter boundary so later adapters can plug in without changing the audit engine.

### 4. Embedded web dashboard

Add an imported-app dashboard route in `apps/web` with:

- imported app list
- Symphony detail view
- launch state
- audit scorecard
- blocking failures
- exact remediation text
- one-click copy for subagent prompts
- link or embedded state for Symphony runtime summary

Phase 1 UI should live in T3 Code, not link out as the primary workflow.

### 5. Shared dev launcher

Extend the repo dev runner so one command can start:

- T3 Code server/web
- Symphony service for registered local Symphony apps

The launcher should:

- keep stdout/stderr streams attributable per process
- detect port collisions
- surface startup failures in T3 Code observability/logs
- not require Symphony to be vendored into the monorepo

## Harness Engineering Audit Specification

The audit should be derived from the OpenAI Harness Engineering article dated February 11, 2026 and treated as a concrete policy profile for imported agentic apps.

Primary source:

- https://openai.com/index/harness-engineering/

Supporting Symphony context:

- https://openai.com/index/open-source-codex-orchestration-symphony/

### Required checks that block activation

1. Repository-local system of record

- The imported repo must contain structured, versioned docs for architecture, plans, reliability, and security.
- Passing shape:
  - short top-level navigation doc such as `AGENTS.md`
  - deeper docs in a structured directory
- Fail when:
  - only a giant top-level instruction file exists
  - critical operating knowledge lives nowhere in-repo

2. Plans as first-class artifacts

- The repo must version execution/design plans in-repo.
- Passing shape:
  - plan/spec directories with active/completed artifacts or equivalent
- Fail when:
  - no in-repo planning artifacts exist for substantial work

3. Architectural boundaries

- The repo must expose predictable module boundaries and layering.
- Passing shape:
  - explicit package/domain layering docs
  - code layout that matches those boundaries
- Fail when:
  - cross-domain runtime code is tangled and undocumented

4. Mechanical enforcement

- The repo must enforce at least some invariants mechanically.
- Passing shape:
  - lint/test/CI rules for architecture, docs, schemas, naming, or reliability
- Fail when:
  - standards exist only as prose with no enforcement

5. Agent legibility

- The repo must make core operating knowledge inspectable by agents in-repo.
- Passing shape:
  - schemas, configs, docs, commands, and references are local and discoverable
- Fail when:
  - critical context depends on external docs or human memory only

6. Observability legibility

- The app must expose logs and status in a way an agent can inspect locally.
- Passing shape:
  - structured logs, status API/UI, trace/log docs, or equivalent
- Fail when:
  - runtime debugging requires manual human-only inspection

7. Workspace and execution isolation

- For agent-running apps like Symphony, the repo must clearly define workspace isolation and execution boundaries.
- Passing shape:
  - documented and implemented per-task/per-workspace isolation
- Fail when:
  - agent execution boundaries are implicit or unsafe

### Advisory checks

1. Dependency legibility

- Prefer simpler, inspectable dependencies over opaque abstractions.

2. Quality/cleanup loop

- Presence of quality scoring, doc-gardening, or recurring cleanup tasks.

3. Taste invariants

- File-size limits, structured logging conventions, schema naming, reliability checks.

4. Agent-operable validation loops

- E2E, screenshots, traces, videos, or app-driving capabilities.

### Symphony-specific checks

1. `WORKFLOW.md` or spec-driven workflow contract exists and is documented.
2. Issue tracker polling, workspace isolation, retry logic, and observability match the spec shape.
3. Operator-visible status surface exists via logs or HTTP API.
4. Trust/safety posture is documented explicitly.
5. Workspace hooks, timeout behavior, and failure mapping are documented and test-covered.

## Implementation Plan

### Phase 1: Generic imported-app framework

Add new contracts in `packages/contracts`:

- `ImportedApp`
- `ImportedAppKind`
- `ImportedAppSource`
- `ImportedAppLaunchConfig`
- `ImportedAppAuditReport`
- `ImportedAppAuditCheck`
- `ImportedAppRemediationPrompt`
- `ImportedAppRuntimeSummary`
- client/server RPC or HTTP payloads for registration, audit, launch, and status

Add new server domains in `apps/server/src/importedApps`:

- `Services/ImportedAppRegistry.ts`
- `Layers/ImportedAppRegistry.ts`
- `Services/ImportedAppAuditService.ts`
- `Layers/ImportedAppAuditService.ts`
- `Services/ImportedAppLauncher.ts`
- `Layers/ImportedAppLauncher.ts`
- `Services/ImportedAppAdapterRegistry.ts`
- `Layers/ImportedAppAdapterRegistry.ts`

Persist imported-app records in the existing server persistence layer rather than ad hoc files.

Add server HTTP routes:

- `POST /api/imported-apps/register`
- `GET /api/imported-apps`
- `GET /api/imported-apps/:id`
- `POST /api/imported-apps/:id/audit`
- `POST /api/imported-apps/:id/launch`
- `POST /api/imported-apps/:id/stop`
- `GET /api/imported-apps/:id/runtime`
- `POST /api/imported-apps/:id/activate`

Activation rule:

- refuse activation when any required audit check fails
- return a structured failure envelope including exact failed checks and remediation prompts

### Phase 1: Symphony adapter

Add new adapter code in `apps/server/src/importedApps/adapters/symphony`:

- `SymphonyAdapter.ts`
- `SymphonyAuditProfile.ts`
- `SymphonyRuntimeClient.ts`
- `SymphonyLaunch.ts`

Adapter behavior:

- normalize SSH or HTTPS repo URLs
- identify Symphony repo by remote or by presence of `SPEC.md`/`WORKFLOW.md` and expected runtime files
- accept a local path to an already-cloned repo
- launch Symphony with configured command and cwd
- poll its status API if present; otherwise provide launch/log-only status with degraded runtime detail
- publish a normalized runtime summary into T3 Code

### Phase 1: Shared dev command

Extend root `scripts/dev-runner.ts` to support an opt-in mode such as:

- `node scripts/dev-runner.ts dev --with-imported-apps`
  or equivalent config-driven behavior.

Behavior:

- start T3 Code as today
- discover imported apps marked `autoLaunchInDev`
- start Symphony process using stored launch config
- register process lifecycle for clean shutdown
- expose process status into observability

### Phase 1: Web UI

Add new route tree entries in `apps/web/src/routes`:

- `/imported-apps`
- `/imported-apps/$appId`

Add UI modules:

- imported app list
- registration form
- audit scorecard
- required/advisory findings table
- remediation prompt cards
- Symphony runtime summary panel

UI states:

- unregistered
- registered, unaudited
- audit running
- audit failed
- audit passed
- launching
- running
- stopped
- activation blocked

Use existing T3 Code visual language and event/snapshot model. Do not create a separate app shell.

### Phase 1: Subagent prompt generation

For each failed check, generate prompt templates that assume the target imported repo is opened in its own worktree/chat.

Prompt template fields:

- goal
- exact failing check
- why it failed
- files to inspect first
- expected acceptance criteria
- instruction to use subagents for independent tasks when appropriate
- instruction to encode the fix as docs/tooling/tests, not just prose

Prompt output types:

- `doc-fix`
- `lint-or-structural-check`
- `architecture-boundary-fix`
- `observability-fix`
- `workflow-contract-fix`

### Phase 2: Native merge

Once phase 1 proves the workflow:

- move Symphony runtime concepts into first-class server packages under `apps/server/src/symphony` or `packages/symphony-runtime`
- replace external launch/status boundary with in-process services
- keep the imported-app audit framework because it remains useful for future adapters and repo imports
- migrate the Symphony adapter from "external process" to "native provider/orchestrator module"

Do not start phase 2 until phase 1 is stable and the audit model is validated on a real Symphony checkout.

## Public API and Type Changes

### New contracts

In `packages/contracts`:

- `ImportedAppKind = "symphony"`
- `ImportedApp`
- `ImportedAppAuditReport`
- `ImportedAppAuditCheck`
- `ImportedAppRuntimeSummary`
- `ImportedAppActivationError`
- `RegisterImportedAppInput`
- `LaunchImportedAppInput`
- `ActivateImportedAppInput`

### New server endpoints

In `apps/server` HTTP surface:

- imported app registration/status/audit/launch/activation endpoints listed above

### New web data flows

The web app should consume imported-app snapshots through the same general query/subscription approach used elsewhere in T3 Code. If a push channel is needed, add a dedicated imported-app event stream rather than overloading thread events.

## File and Module Boundaries

Preferred new structure:

- `packages/contracts/src/importedApps.ts`
- `apps/server/src/importedApps/Services/*`
- `apps/server/src/importedApps/Layers/*`
- `apps/server/src/importedApps/adapters/symphony/*`
- `apps/web/src/routes/imported-apps.*`
- `apps/web/src/components/importedApps/*`

Keep responsibilities separate:

- generic registry
- generic audit engine
- generic launcher
- adapter-specific Symphony logic
- UI presentation

Do not bury Symphony-specific logic inside existing provider/session layers in phase 1. T3 Code’s current provider stack is for interactive provider sessions; Symphony is a higher-order orchestrator and should sit beside that stack.

## Testing and Validation

### Contracts

- schema encode/decode for all imported-app and audit types
- invalid activation payloads reject cleanly
- required vs advisory check severity remains stable

### Server unit tests

- register imported app with local path and repo URL
- detect repository identity for SSH GitHub remotes
- audit fails when required harness docs are missing
- audit passes when required file/layout evidence exists
- activation blocked on required failures
- activation allowed on advisory-only failures
- launcher starts/stops Symphony process and reports state
- runtime polling degrades gracefully when Symphony status API is unavailable

### Server integration tests

- imported-app endpoints round-trip through HTTP
- dev runner can start T3 Code plus a mock Symphony process
- process crash updates launch status and preserves audit state
- audit output contains remediation prompts with deterministic structure

### Web tests

- imported-app list renders mixed statuses
- detail page shows blocking failures prominently
- copyable subagent prompts render per finding
- activation button disabled when required failures exist
- runtime summary handles unavailable/degraded states

### Project-level verification

Before calling implementation complete, the repo must still pass:

- `bun fmt`
- `bun lint`
- `bun typecheck`

Use `bun run test` for relevant suites. Do not use `bun test`.

## Rollout

1. Ship contracts and server-only imported-app registry behind a feature flag.
2. Add audit engine and activation gate.
3. Add Symphony adapter and dev launcher support.
4. Add embedded web dashboard.
5. Validate against one real Symphony checkout.
6. Only after phase 1 usage, plan the native merge into T3 Code core.

## Assumptions and Defaults

- Default integration shape: phase 1 keeps Symphony separate, launched alongside T3 Code from one dev command.
- Default UI: embedded dashboard inside T3 Code.
- Default audit policy: block activation on any required Harness Engineering failure.
- Default scope: reusable imported-app framework, with Symphony as the first adapter.
- Default source handling: T3 Code registers an existing local Symphony checkout rather than cloning repos itself in phase 1.
- Default status source: prefer Symphony HTTP runtime status if present; otherwise fall back to process/log status.
- Default audit evidence source: filesystem inspection plus repo-local config/docs/tests, not external SaaS metadata.

## Acceptance Criteria

- A local Symphony repo can be registered in T3 Code without vendoring it into the monorepo.
- One dev workflow can launch both T3 Code and Symphony.
- T3 Code shows Symphony launch state and runtime summary in an embedded dashboard.
- T3 Code audits the imported repo against a concrete Harness Engineering profile.
- Required audit failures block activation and show exact remediation guidance.
- Each failure includes a usable subagent prompt targeted at fixing the imported repo.
- The framework is generic enough to support another imported app kind later without redesigning the core model.
