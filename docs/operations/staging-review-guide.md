# Staging Review Guide

This guide explains the staged feature stack in reviewer terms. It is written
for someone who does not already know the implementation history, so it focuses
on the problem each topic solves, the shape of the solution, and the areas that
need careful review.

The stack is intentionally split into topic commits. Reviewers should be able
to read one commit at a time, understand the user problem, inspect the relevant
surface area, and decide whether the behavior is correct.

The authoritative replay list is
`docs/operations/jordan-topic-stack.manifest.json`. Each manifest topic has a
matching repo-internal plugin folder under `local-plugins/<topic>/` with owned
paths, schema v2 componentization metadata, focused implementation snippets,
replay notes, and verification commands. Run
`pnpm run topic-plugins:check` when reviewing a stack metadata change.
The same command enforces each topic README's Replay Checklist Items under
`Added Features`, `Added UI`, `Added Server And Runtime Behavior`, and
`Added Tests`. Reviewers should treat those checked items as the behavior-level
list that must survive an upstream replay.

## Review Order

Review in this order:

1. Remote access through Tailscale HTTPS links.
2. Durable worktree launch profiles.
3. Worktree context and controlled runtime recovery.
4. Project Git dashboard and VCS reconciliation.
5. Provider usage, reset, and T3 access controls.
6. Composer mentions, slash menus, chat context, and worktree naming.
7. Configurable prompt settings.
8. Desktop shell MCP automation controls.
9. Project agent file schemas, CRUD, and scaffold safety.
10. Local observability hub, Grafana provisioning, and digest metrics.
11. On-the-Go voice companion and durable Theo orchestration.
12. Headed desktop verification coverage.
13. Patch-stack maintenance workflow and promotion governance.
14. Autonomous topic replay, checklist, and audit safeguards.
15. Nightly Omarchy launcher and public verifier.
16. Durable Main supervision, rollback, and strict promotion proof.

The order matters because later topics reuse earlier infrastructure. The app
launcher depends on correct advertised endpoints. Runtime recovery and project
Git dashboards depend on the shared environment/client runtime. Provider,
composer, prompt, automation, and project-agent file surfaces build on those
contracts. Observability and headed Electron checks then verify the whole local
stack. `docs/operations/jordan-topic-stack.md` is the authoritative rebuild and
tree-equality workflow for future upstream refreshes.

The June 26 follow-up topic
`fix(remote-access): harden public staging verification` should be reviewed with
the remote-access and durable-launcher topics. On future upstream rebuilds, fold
the web/server/verifier pieces into remote access and the generated
`t3code-tailscale-reconcile` helper into durable launchers, or replay the
follow-up only after both base topics exist.

Routine upstream refreshes should use
`docs/operations/nightly-upstream-agent.md`. The server-owned nightly agent
rebuilds `.worktrees/nightly` only; promotion remains an explicit review step.
Each topic carries a structured Replay Contract. Routine conflicts are repaired
within declared topic paths and verified on the completed stack. Linear asks
for a decision only when preserving the feature requires a fundamental product,
architecture, security, or operator choice. Each actionable run writes
`topic-audit.md`, `nightly-agent-report.md`, `topic-catalog.md`,
`control-plane-sync.json`, and a matching Linear run issue. Use
`$premote-nightly` after the issue reaches `In Review` and all evidence agrees.

## Autonomous Replay Safeguards

Review the nightly workflow as a feature-preservation system, not as a generic
merge helper:

- Replay Contracts must describe the behavior to preserve, allowed routine repairs, stop conditions, and proof commands (`local-plugins/topic-replay-safeguards/plugin.json`).
- Exact Repair Memory may reuse a decision only for the same topic commit and canonical Git conflict-stage fingerprint (`scripts/lib/nightly-repair-memory.ts`).
- The repair worker may edit only declared topic paths or files authored by the replay commits; the parent process validates the patch, conflict state, and cherry-pick identity (`scripts/lib/nightly-upstream-agent.ts`, `scripts/lib/nightly-topic-repair-scope.ts`).
- Dependency reconciliation must retain local additions while preventing an old topic from downgrading an exact dependency pin below current upstream (`scripts/lib/nightly-dependency-reconciliation.ts`).
- Success requires the completed-stack frozen install, repository checks, full typecheck, topic-plugin validation, and any repaired-topic verification commands (`scripts/lib/nightly-upstream-agent.ts`).
- Linear runs should show upstream changes, applied topics, repair status, proof, and a topic catalog suitable for agent follow-up questions (`docs/operations/nightly-upstream-agent.md`).
- Promotion must match the Linear issue to `linear-run.json`, the current nightly SHA, the upstream base, and `control-plane-sync.json` before staging moves (`docs/operations/premote-nightly.md`).

## Required Verification

Every change in this stack must pass:

```bash
vp check
vp run typecheck
pnpm run topic-plugins:check
```

Because this stack touches mobile runtime code, also run:

```bash
vp run lint:mobile
```

For UI-sensitive review, use the visible Electron staging workflow in
`docs/operations/headed-staging.md`. Prefer screenshots or recordings of the
actual changed workflow over static code inspection alone.

## Topic 1: Remote Access Through Tailscale HTTPS Links

### User Problem

T3 Code can run locally, but connected clients need stable HTTPS links when the
desktop app is exposed through Tailscale Serve. The old assumptions were too
simple: they treated the app as if it always lived at a root URL on localhost.
That breaks when several worktrees or apps share the same Tailscale device and
are separated by URL paths.

The visible symptoms were:

- Pairing links could point at the wrong origin or lose the configured path.
- WebSocket and HTTP calls could resolve relative to the wrong base path.
- Desktop, browser, and mobile clients could disagree about the advertised
  endpoint for the same running server.
- Tailscale Serve route setup had no single place to validate and normalize the
  public HTTPS URL.

### What Changed

The stack adds explicit support for hosted access under a path prefix, including
Tailscale Serve paths.

Important implementation areas:

- `packages/shared/src/publicPath.ts` centralizes path-prefix normalization.
- The same shared module also owns single-segment user-managed Tailscale route
  validation and reserved-route ownership policy for `/main`, `/original`, and
  `/staging`.
- `packages/shared/src/advertisedEndpoint.ts` centralizes advertised endpoint
  parsing and path handling.
- `packages/tailscale/src/tailscale.ts` manages Tailscale Serve route parsing,
  path support, route availability probing, conflict reporting, and MagicDNS
  validation.
- `apps/desktop/src/backend/DesktopServerExposure.ts` owns desktop-side
  exposure setup, route probing, reserved-route checks, no-overwrite
  provisioning, and published endpoints.
- `apps/desktop/src/backend/tailscaleEndpointProvider.ts` resolves the
  Tailscale HTTPS endpoint used by the desktop app.
- `apps/server/src/http.ts` and server config wire the public path into served
  HTTP assets and runtime configuration.
- `apps/server/src/server.ts` checks route availability before Tailscale Serve
  startup provisioning so a backend never overwrites an existing route target.
- `apps/web/src/publicPath.ts`, `apps/web/src/localApi.ts`, and Vite config make
  the web app resolve assets, API calls, and WebSocket transport from the same
  base path.
- `apps/web/src/components/settings/ConnectionsSettings.tsx` validates custom
  route edits, probes availability before apply, and blocks reserved or
  already-taken routes.
- `apps/web/src/components/settings/pairingUrls.ts` keeps pairing URLs aligned
  with the clean public origin.
- `apps/desktop/scripts/verify-staging-public.mjs` is the live staging gate. It
  verifies the primary-interface network path, loads the public URL, opens a
  project, sends `Hi`, and waits for a non-empty assistant response.
- The nightly verifier passes the launcher dev URL to `project add`, keeping
  verifier projects in the same `dev/state.sqlite` lane as the running nightly
  backend.
- Mobile remote-environment registry changes preserve the advertised endpoint
  seen by paired mobile clients.

### Why This Shape

The path-prefix behavior is shared by server, web, desktop, mobile, and tests.
Keeping normalization in shared utilities avoids each package making slightly
different decisions about leading slashes, trailing slashes, root paths, and
relative URL joins.

The desktop exposure manager remains the owner of mutable Tailscale Serve state.
The web app consumes the resulting endpoint instead of trying to infer it from
`window.location` in every place.

Reserved routes are intentionally not force-takeover-capable from the UI.
Reviewers should verify that `/staging` can only be claimed by the actual
staging branch/worktree, `/main` by the root main checkout on branch `main`, and
`/original` by `.worktrees/original` on branch `original`.

### Review Focus

Reviewers should check:

- Path normalization is deterministic for root paths, nested paths, and empty
  values.
- Public origins are cleaned without losing the required Serve path.
- Reserved worktree routes such as `/main`, `/staging`, and `/original` come from
  launcher env before persisted desktop settings, so stale saved routes cannot
  create doubled or cross-worktree asset paths like `/staging/t3code-staging/...`
  or `/staging/main/...`.
- Pairing links do not accidentally include local-only origins when hosted
  access is available.
- Web assets, HTTP API calls, and WebSocket connections use the same base path.
- The backend handles the configured public path prefix for static files, HTTP
  API routes, and WebSocket routes, because Tailscale Serve forwards the
  external path prefix through to the local backend.
- Existing localhost development still works when no hosted path is configured.
- Tailscale route mutation is only performed by desktop/server code that owns
  that responsibility.
- Tailscale Serve upstreams point at `http://127.0.0.1:<port>` loopback targets,
  never at another public, LAN, or hosted URL.
- MagicDNS validation rejects unusable endpoints before exposing bad launch URLs.

### Suggested Manual Checks

- Launch desktop staging with a `T3CODE_WORKSPACE_SLUG`.
- Confirm Settings shows the hosted Tailscale URL with the expected path.
- Run `vp run --filter @t3tools/desktop e2e:smoke -- connections.spec.ts`
  and confirm the Connections settings page renders local and remote access
  controls instead of the app error boundary.
- Copy a pairing link and verify it contains the HTTPS origin and path exactly
  once.
- Open the hosted URL in a browser and confirm projects are visible, a new chat
  can send `Hi`, and a non-empty assistant response renders. For live staging,
  run `vp run verify:staging-public`.
- Confirm the verifier's `network-preflight.json` used the primary interface and
  resolved the tailnet host to the machine's Tailscale IPv4 address. If the
  desktop browser times out while loopback checks pass, inspect `ss -tnp` and
  `ip route get <tailnet-ip> oif <primary-interface>` before accepting the
  route.
- For nightly, confirm the selected verifier project resolves to the durable
  `.worktrees/nightly` checkout and was not seeded into the inactive
  `userdata/state.sqlite` lane.
- Confirm assets, API calls, and WebSocket connection all load under the path
  prefix.
- Inspect the first generated module script and confirm it returns JavaScript
  with a JavaScript MIME type, not the app HTML fallback.
- Confirm the shell HTML rewrites stale reserved prefixes to the active route;
  `/main/assets/...` in static HTML must become `/staging/assets/...`, not
  `/staging/main/assets/...`.
- Fetch a prefixed metadata/API route such as
  `/staging/.well-known/t3/environment` and confirm it returns JSON, not the app
  HTML fallback.

## Topic 2: Project App Launcher From Chat

### User Problem

Coding agents often create or modify a web app, but the user still has to switch
to a terminal, know the correct package command, pick a free port, start the
dev server, and then manually open the right local or remote URL.

That is slow and brittle, especially when:

- A repo has multiple runnable apps.
- A package needs setup before it can launch.
- A port is already occupied.
- The user is connected from another browser or device.
- The app should be available through the same Tailscale HTTPS route as T3 Code.
- The active branch or worktree matters for understanding what will launch.

### What Changed

The stack adds an app launcher that can be surfaced from the chat UI and backed
by desktop or server runtime code.

Important implementation areas:

- `.t3code/dev-apps.json` defines launch profiles for this repo.
- `packages/contracts/src/devLaunch.ts` defines the protocol payloads.
- `packages/shared/src/devLaunch.ts` defines profile parsing and shared launch
  metadata.
- `packages/shared/src/devAppLaunchRuntime.ts` contains shared process/runtime
  behavior used by app launchers.
- `apps/desktop/src/backend/DesktopDevAppLaunchManager.ts` launches local apps
  for the Electron desktop backend.
- `apps/server/src/devLaunch/ServerDevAppLaunchManager.ts` supports server-side
  launching for remote app stacks.
- `apps/server/src/project/Layers/ProjectDevLaunchResolver.ts` resolves project
  launch profiles and setup commands.
- `scripts/dev-runner.ts` keeps a launched T3 Code checkout's local
  `.env.local` identity ahead of inherited parent app-launch environment.
  It also rejects reserved Tailscale routes when the actual git branch/worktree
  does not own that reservation.
- `apps/web/src/components/chat/ThreadDevLaunchControl.tsx` presents launch,
  setup, status, URL, route-conflict, and error states in chat.
- IPC and preload changes bridge the Electron renderer to the desktop launcher.

### Behavior Covered

The topic folds in the later launcher fixes so reviewers see one coherent
feature:

- Launch profiles can be discovered from project metadata.
- Repos without profiles can still show a setup action when applicable.
- Environment bindings are passed to child processes.
- The public URL can be opened after launch.
- Serve paths are preserved for app proxy URLs.
- Tailscale setup ownership is clear and stays on the current workspace.
- Branch and worktree context is visible before launch.
- Tailscale MagicDNS is validated before launch.
- Tailscale Serve route conflicts are reported with the route and the existing
  versus expected proxy target.
- Connected clients can see launcher capabilities exposed by the server.
- Occupied local ports are rejected instead of silently stealing traffic.
- Failed starts clean up child processes and state.
- Slower app startups are tolerated without premature failure.
- Launcher menus use grouped labels so longer text wraps predictably.
- Launching a second T3 Code checkout from an existing T3 Code instance does
  not accidentally reuse the parent instance's `T3CODE_PORT_OFFSET` when the
  child checkout defines its own `T3CODE_DEV_INSTANCE`.

### Why This Shape

The launcher needs shared contracts because the same UI can talk to either a
desktop backend or a server-backed remote stack. The process-management details
live outside React so UI state remains a projection of launcher state rather
than the source of truth.

The profile format is repository-local because launch commands are project
specific. The runtime helpers live in `packages/shared` because port selection,
environment binding, process cleanup, and public URL construction must stay
consistent across launchers.

### Review Focus

Reviewers should check:

- Profile parsing rejects ambiguous or unsafe configuration.
- Child processes receive the intended environment without leaking unrelated
  secrets into generated URLs or logs.
- Failed launches clean up processes, listeners, and occupied-state records.
- Port collision handling is explicit and predictable.
- Route collision handling is explicit and does not overwrite the existing
  Tailscale Serve owner.
- Remote/public URLs preserve both the app route and Tailscale Serve path.
- The UI does not offer launch actions for a backend that cannot execute them.
- The setup helper cannot run against the wrong workspace.
- Repo-local `.env.local` identity wins over inherited app-launch environment
  without dropping unrelated inherited values such as `HOST` or `PORT`.
- Long labels and status messages remain readable in the chat header/control.

### Suggested Manual Checks

- Open a chat in the staging desktop app and inspect the app-launch control.
- Launch a configured app and verify the opened URL reaches the expected dev
  server.
- Start a conflicting process on the same port and verify the launcher reports a
  clear occupied-port error.
- Start a non-staging checkout with `/staging` and verify the dev runner fails
  before launch with a suggested non-reserved route.
- Attempt a launch whose Tailscale Serve route is already owned and verify chat
  renders the route conflict with the existing proxy target.
- Use a connected hosted client and confirm it sees the same launch capability
  and public URL state.

## Topic 3: Running Worktree And Branch Context

### User Problem

Local Electron and Vite windows can look identical while pointing at different
worktrees or branches. That is risky during staging because a reviewer can be
looking at a connected or hosted window and assume it is the app running from
the worktree they meant to inspect.

The UI needs compact local-context signals that answer: which running worktree
is this window attached to, and which branch does that worktree report? When the
app does not have local server cwd or git-ref data, it should avoid showing a
guessed or stale label.

### What Changed

The stack adds running app context to local review surfaces.

Important implementation areas:

- `apps/web/src/components/Sidebar.tsx` reads the server cwd and primary
  launcher-injected dev identity, then renders a compact `worktree / branch`
  pill in the sidebar header when local worktree metadata exists.
- `apps/web/vite.config.ts` injects dev worktree and branch metadata from
  explicit env or Git discovery for browser-based Vite review.
- `apps/web/src/branding.ts` uses legacy `VITE_DEV_*` values and the current
  `VITE_T3_*` launcher identity for the web display name and sidebar stage
  badge, deriving the worktree label from `VITE_T3_WORKTREE_PATH` when needed.
- `apps/web/src/components/Sidebar.logic.ts` keeps sidebar label normalization
  in testable helpers and preserves explicit local dev labels over generic
  nightly package-channel detection.
- `apps/web/src/components/Sidebar.logic.test.ts` and
  `apps/web/src/branding.test.ts` cover branch-label trimming, empty-ref
  handling, dev metadata precedence, and fallback behavior.

### Why This Shape

The sidebar header is visible in both Electron and browser-based Vite review,
so it is the lowest-friction place to show the running context. Those values
come from launcher-injected browser env values because those are the runtime
facts already selected by the worktree launcher; the component does not shell
out or infer a different identity from the hosted URL.

The browser display name covers the other common review cue: window titles and
tabs. Vite computes that metadata at startup from explicit env values or Git. In
dev builds, the web app prefers that explicit worktree/branch metadata ahead of
generic desktop `Dev` branding and ahead of nightly server-version detection;
hosted builds without local dev metadata continue to use their hosted
release-channel labels.

The sidebar label is deliberately compact. It replaces the generic stage badge
in this spot because the worktree and branch are more useful during staging
review than another static environment label.

### Review Focus

Reviewers should check:

- The pill appears only when a worktree slug or branch label is available.
- Empty, whitespace-only, or unavailable git refs do not render misleading
  branch text.
- Long worktree and branch names truncate without resizing the sidebar header.
- The tooltip exposes the full worktree path and branch when available.
- Vite/browser display names use dev checkout metadata ahead of generic desktop
  `Dev` branding and nightly server-version labels while preserving hosted
  release-channel labels when dev metadata is absent.
- Hosted or connected windows without local cwd/ref data do not present guessed
  local context.

### Suggested Manual Checks

- Open the Electron staging window and confirm the sidebar header shows the
  staging worktree and current branch.
- Open the Vite/browser review window against the same local server and confirm
  the same running context is visible in the sidebar and browser title.
- Inspect a window without local server cwd or git-ref data and confirm the
  header does not show a stale or fabricated worktree/branch pill.

## Topic 4: Session Recovery After Provider Or Server Restarts

### User Problem

T3 Code is meant to supervise long-running coding sessions. Before this work,
provider restarts, server restarts, reconnects, and partial streams could leave
the UI without enough context to explain what happened or recover the active
session cleanly.

The missing pieces were:

- A provider startup recovery path that can reconnect to surviving provider
  processes when possible.
- A way to detect provider/process state after interruption.
- Durable thread lifecycle data for projections.
- Connected-device notifications when important session state changes.

### What Changed

The stack adds session recovery and lifecycle projection infrastructure.

Important implementation areas:

- `apps/server/src/provider/Layers/ProviderSessionStartupRecovery.ts` performs
  startup recovery for provider sessions.
- `apps/server/src/provider/providerConnection.ts` and
  `apps/server/src/provider/processTree.ts` support provider/process discovery.
- `apps/server/src/orchestration/Layers/ProjectionPipeline.ts` and
  `ProjectionSnapshotQuery.ts` update projected thread state.
- `apps/server/src/persistence/Migrations/033_ProjectionThreadLifecycle.ts`
  stores thread lifecycle state.
- `apps/server/src/persistence/Migrations/034_AuthSessionPushNotifications.ts`
  stores push-notification metadata for auth sessions.
- `apps/server/src/orchestration/Layers/ConnectedDeviceNotifications.ts`
  emits connected-device notifications.
- `apps/mobile/src/lib/pushNotifications.ts` registers mobile clients for
  paired push notifications.

### Why This Shape

Recovery is server-owned because the server supervises provider processes and
persists projections. The web app should not guess whether a provider process is
recoverable; it should render explicit lifecycle state from the server.

Connected-device notification handling is separated from the projection
pipeline so notification delivery does not become a hidden side effect of every
projection query.

### Review Focus

Reviewers should check:

- Recovery distinguishes a live recoverable provider from a dead or unrelated
  process.
- Projection updates remain idempotent across reconnects and restarts.
- Migrations are safe for existing databases and initialize nullable state
  deliberately.
- Push registration stores only the data needed to notify paired devices.
- The UI shows recovered, unavailable, and uncertain session states without
  implying work was saved when it was not.

### Suggested Manual Checks

- Start a provider-backed chat, restart the server, and inspect whether the
  session resumes or reports its unrecoverable state clearly.
- Pair a mobile client and confirm notification registration does not break
  existing remote-environment registration.

## Topic 5: Project Git Dashboard From Chat

### User Problem

Reviewers and users need to understand the repository state for the active
project while they are still in the chat. The existing git action controls can
run actions, but they do not explain the current worktree layout, dirty files,
ahead/behind counts, remotes, or recent commits in one place.

That makes review slower because the user has to leave the UI, run terminal
commands, and manually connect that output back to the current thread.

### What Changed

The stack adds a Project Git dashboard opened from the chat header.

Important implementation areas:

- `apps/server/src/workspaceGit/WorkspaceGitSnapshot.ts` captures workspace git
  status in a structured form.
- `packages/contracts/src/git.ts` defines the workspace git snapshot contract.
- `packages/contracts/src/rpc.ts` exposes the `workspaceGit.snapshot` WebSocket
  RPC.
- `packages/client-runtime/src/wsRpcClient.ts` exposes the snapshot method to
  client code.
- `apps/web/src/components/workspace-git/WorkspaceGitDashboard.tsx` renders the
  dashboard, worktree tabs, changed files, recent commits, and commit/push
  actions.
- `apps/web/src/components/chat/ChatHeader.tsx` adds the Project Git trigger for
  active project threads.

### Why This Shape

The snapshot is server-owned because the server has workspace filesystem access
and can normalize git output before sending it to clients. The UI receives a
structured snapshot instead of shelling out or parsing command output in the
browser.

The dashboard lives separately from the existing quick git action control. The
quick control remains a compact action launcher, while Project Git is a review
surface for understanding repo state before deciding what to commit or push.

### Review Focus

Reviewers should check:

- Git scanning is bounded by depth, timeout, buffer size, and excluded folders.
- Snapshot root scoping cannot accidentally scan unrelated directories.
- Clean repos, dirty repos, untracked files, detached heads, and missing remotes
  are represented clearly.
- Ahead/behind counts and recent commit pushed-state parsing are correct enough
  for reviewer decisions.
- The chat-header trigger only appears when a thread has an active project root.
- Commit, push, and commit-push actions are disabled when a worktree lacks the
  required state, such as a remote.
- Snapshot and UI errors are readable and do not imply git actions succeeded.

### Suggested Manual Checks

- Make workspace file changes and confirm Project Git shows the expected
  branch, status, changed files, and counts.
- Open a repo with multiple worktrees and confirm each worktree appears with a
  stable label and path.
- Test a repo with no remote and verify push-oriented actions are disabled with
  an understandable reason.
- Run a commit or commit-push action from the dashboard and confirm the snapshot
  refreshes afterward.

## Topic 6: Runtime Restart Flow For Connected Clients

### User Problem

During staging, T3 Code development can rebuild web, server, or desktop code
while the Electron app and hosted clients are active. Immediate automatic
restart or renderer hot reload interrupts users and makes remote-client
verification difficult. But if the process needs a restart, connected clients
need a clear, server-backed way to know that and request it safely.

### What Changed

The stack adds a server runtime restart flow.

Important implementation areas:

- `apps/server/src/serverLifecycleEvents.ts` publishes lifecycle state that
  clients can observe.
- `apps/server/src/serverRuntimeRestart.ts` owns restart request handling.
- `apps/server/scripts/dev-supervisor.mjs` replaces server `node --watch`
  restarts with a loopback-controlled supervisor for T3 Code dev modes.
- `apps/web/vite.config.ts` suppresses Vite hot reload/full reload in manual
  mode and publishes restart-required notifications instead.
- `apps/web/src/rpc/serverState.ts` exposes client-side server-state transport
  helpers and tests.
- The headed staging workflow documents how `T3CODE_DEV_CHANGE_POLICY=manual`
  enables the restart-toast path. `T3CODE_DESKTOP_DISABLE_RESTART_ON_CHANGE=1`
  remains a backwards-compatible alias.

### Why This Shape

Restart state is server-owned because clients should not infer restart safety
from local build events. The server can advertise whether a restart is needed,
whether an action is available, and which endpoint is responsible for handling
the restart.

Keeping this separate from session recovery matters: recovery handles provider
or session continuity after interruption, while runtime restart handles the
controlled act of replacing the running backend.

### Review Focus

Reviewers should check:

- Restart controls are only exposed when the runtime can actually service them.
- Loopback-only restart endpoints are not accidentally advertised as public
  control surfaces.
- Connected clients receive consistent lifecycle state.
- The UI can show restart-required state without breaking unsupported servers.
- Tests cover both supported and unsupported restart paths.

### Suggested Manual Checks

- Run desktop staging with `T3CODE_DEV_CHANGE_POLICY=manual`.
- Trigger a web, server, or desktop code change that requires restart.
- Confirm Electron and hosted clients show the same restart-required state.
- Click restart from the UI and confirm the backend restarts cleanly.

## Topic 7: Provider Account Usage In Chat

### User Problem

Codex account usage and rate-limit details were hidden from the main chat
workflow. Users could see whether a provider was ready or unavailable, but they
could not tell whether the selected Codex account was near a limit or whether
usage data was available at all.

That makes provider failures harder to diagnose and makes it easy to start a
long task without noticing account limits that may interrupt it.

### What Changed

The stack adds provider account usage fetch and display for Codex.

Important implementation areas:

- `packages/contracts/src/server.ts` defines the provider usage schema attached
  to provider snapshots.
- `apps/server/src/provider/providerSnapshot.ts` preserves optional usage data
  when building `ServerProvider` snapshots.
- `apps/server/src/provider/Layers/CodexProvider.ts` fetches
  `account/usage/read` and `account/rateLimits/read`, normalizes token summary
  and rate-limit windows, and omits usage when no meaningful data is returned.
- `apps/web/src/components/chat/ProviderUsagePopover.tsx` shows provider usage
  details, rate-limit remaining percentages, reset times, summary tokens, and a
  hover/focus refresh path.
- `apps/web/src/components/chat/ChatComposer.tsx` places the usage popover in
  the composer footer for the selected provider instance.
- `apps/desktop/e2e/specs/chat-layout.spec.ts` requires the provider usage
  button and popover alongside the context-window meter in headed Electron
  smoke coverage.

### Why This Shape

Usage data belongs on provider snapshots because provider availability, account
state, model lists, skills, and usage all describe the currently selected
provider instance. Keeping the field optional preserves compatibility for
providers that cannot expose account usage.

Codex usage fetches are best-effort. The provider can still be listed when usage
or rate-limit endpoints fail, and the UI can render an unavailable/empty state
instead of treating missing usage as a provider failure.

### Review Focus

Reviewers should check:

- `account/usage/read` and `account/rateLimits/read` failures do not make Codex
  unavailable by themselves.
- Rate-limit window normalization clamps percentages and formats reset times
  correctly.
- Usage snapshots are omitted when no limits, daily buckets, or summary values
  exist.
- Provider snapshots remain compatible when `usage` is absent.
- The popover refresh path calls `server.refreshProviders` for the selected
  provider instance and applies the updated provider list.
- The usage icon color reflects the lowest remaining rate-limit window without
  overstating accuracy.
- Headed chat-layout smoke fails if the composer footer has the context-window
  meter but drops the selected-provider usage button.

### Suggested Manual Checks

- Open a Codex-backed chat and hover/focus the provider usage icon in the
  composer footer.
- Confirm limits show remaining percentages and reset times when Codex returns
  rate-limit data.
- Confirm the popover shows a clear unavailable message when usage data is not
  returned.
- Refresh provider status and verify usage data updates without disrupting the
  current composer draft.

## Topic 8: Chat Context Attachments From The Composer

### User Problem

The chat composer had limited access to useful local context. Users could not
easily attach previous chats, terminal sessions, reusable prompt templates, or
provider skills to a new prompt.

That made it harder to give an agent the right context without copying from
other screens or manually pasting terminal output.

### What Changed

The stack adds composer context attachments and richer slash-menu discovery.

Important implementation areas:

- `apps/web/src/components/chat/composerSlashMenuItems.ts` defines slash-menu
  items for templates, provider commands, and provider skills.
- `apps/web/src/components/chat/ChatComposer.tsx` inserts selected past-chat and
  terminal-context references into prompts.
- `apps/web/src/components/chat/ComposerCommandMenu.tsx` groups files, folders,
  past chats, terminals, running dev environments, skills, and templates.
- `apps/server/src/terminal/Layers/Manager.ts` exposes terminal context data.
- `packages/contracts/src/terminal.ts` defines terminal context payloads.

### Why This Shape

Context selection belongs in the composer UI, but the data has to come from
server-owned sessions and terminals. The contracts make the payload explicit so
web, server, and mobile tests agree on the shape.

### Review Focus

Reviewers should check:

- Context references are inserted in a stable, parseable form.
- Slash-menu filtering works with chats, terminals, templates, provider
  commands, and skills.
- Terminal context does not include unintended private data.
- Composer layout remains stable with attached context references.
- Composer layout remains reachable when the right panel and terminal drawer are
  open; the terminal drawer must move the composer above it instead of covering
  the prompt box.
- Terminal read-only/owner metadata is consistent between server snapshots and
  client state.

### Suggested Manual Checks

- Open the composer slash menu and attach a past chat.
- Attach a terminal session and confirm the inserted reference is readable.
- Run `vp run --filter @t3tools/desktop e2e:smoke -- chat-layout.spec.ts`
  after changing chat layout, context-window, sidebar-history, right-panel, or
  terminal-drawer behavior.
- Search slash menu templates and provider skills with one query and verify the
  item ordering is predictable.

## Topic 9: Isolated Headed Electron Staging Checks

### User Problem

Many changes in this stack are not fully reviewable in a browser-only dev
server. Desktop behavior involves Electron, IPC, local config roots, Tailscale
Serve, provider processes, and CDP inspection. Without an isolated headed
workflow, manual review can accidentally reuse personal desktop state or miss
desktop-only failures.

### What Changed

The stack adds a controlled headed Electron staging workflow and test harness.

Important implementation areas:

- `apps/desktop/e2e/support/electronHarness.ts` launches an isolated desktop
  stack for Playwright tests.
- `apps/desktop/e2e/support/preflight.ts` decides when external dependencies
  such as Tailscale or providers are available.
- `apps/desktop/e2e/specs/*.spec.ts` cover composer, chat layout, connections,
  dev launch, pairing paths, recovery lifecycle, provider recovery, and
  workspace git state.
- `apps/desktop/scripts/run-e2e.mjs` wraps the Playwright E2E entry point.
- `apps/desktop/scripts/dev-electron.mjs` adds staging-friendly controls such as
  disabling auto-restart on change.
- `apps/web/src/components/settings/ConnectionsSettings.tsx` gets UI support
  and coverage for the new staging-visible flows.
- `docs/operations/headed-staging.md` documents manual launch, CDP inspection,
  smoke testing, and full headed test runs.

### Why This Shape

The harness isolates `HOME`, `XDG_CONFIG_HOME`, `T3CODE_HOME`, app ports, and
Electron CDP ports so tests and manual verification do not mutate a personal
desktop session. External services remain opt-in so CI can run the smoke suite
without requiring Tailscale or provider credentials.

### Review Focus

Reviewers should check:

- The harness always uses isolated state directories.
- External-service tests skip by default and only mutate real services when
  explicit opt-in environment variables are set.
- CDP ports and backend ports do not collide with normal local development.
- Headed smoke tests cover the flows most likely to regress in Electron.
- The Connections settings UI remains understandable when external preflight
  skips a flow.

### Suggested Manual Checks

- Follow `docs/operations/headed-staging.md` to launch staging Electron.
- Use CDP port `9332` to capture screenshots of changed UI paths.
- Run `vp run test:desktop-e2e:smoke`.
- Run the full headed suite only when local Tailscale/provider mutation is
  explicitly acceptable.

## Topic 10: Staging Review, Verification, And Promotion Workflow

### User Problem

The repository has a reserved staging worktree and multiple feature worktrees.
Without explicit process documentation, it is easy to merge unverified work into
staging, run the wrong checks, or review a stack without knowing which workflows
are mandatory.

### What Changed

The stack documents the staging workflow and CI expectations.

Important implementation areas:

- `AGENTS.md` defines required checks, worktree rules, and staging promotion
  expectations.
- `docs/operations/ci.md` explains CI quality gates and desktop E2E behavior.
- `docs/operations/headed-staging.md` explains visible Electron staging
  verification.
- `.github/workflows/ci.yml` includes the desktop E2E smoke job.
- `.gitignore` excludes local staging environment files and artifacts.
- This review guide gives reviewers a map for the staged feature stack.

### Why This Shape

Process rules live in `AGENTS.md` because coding agents read it before working
in the repo. Human-facing operational detail lives under `docs/operations` so it
can be reviewed, linked, and updated like normal documentation.

### Review Focus

Reviewers should check:

- The branch/worktree rules match how the team actually wants staging used.
- Required commands are explicit and realistic for every stack touched here.
- CI behavior does not require secrets or mutable external services by default.
- The headed staging guide gives enough detail to reproduce UI verification.
- The review guide stays high level enough to remain useful after minor
  implementation details move.

## Topic 11: Manual Dev Restart Supervision

### User Problem

During staging review, automatic Vite, server, or Electron restarts can disrupt
the exact UI state being inspected. Connected browser and Tailscale clients also
need a server-backed way to know when a restart is required instead of relying
on local dev-server assumptions.

### What Changed

The follow-up topic `feat(dev-runtime): supervise manual dev restarts` adds a
manual restart path for T3 Code dev sessions.

Important implementation areas:

- `apps/server/scripts/dev-supervisor.mjs` supervises the server process and
  exposes a loopback-only restart control endpoint in supported dev modes.
- `apps/server/src/devSupervisor.test.ts` and
  `apps/server/src/serverRuntimeRestart.test.ts` cover restart signaling and
  unsupported-runtime behavior.
- `apps/web/src/devSourceChangeNotifications.ts` and
  `apps/web/src/lib/devRestartNotification.ts` publish renderer restart-needed
  notifications instead of forcing immediate reloads.
- `scripts/lib/dev-change-policy.ts` and `scripts/dev-runner.ts` centralize the
  `manual` versus `auto` dev-change policy.
- `docs/operations/headed-staging.md` documents the isolated launch variables,
  restart toast behavior, and clean-exit keepalive behavior.

### Review Focus

Reviewers should check:

- Restart controls are only available for supervised loopback runtimes.
- Manual mode is the default for T3 Code dev launchers, while `auto` remains
  available for explicit old behavior.
- Clean Electron exits can keep the supervised dev process alive without
  preventing normal supervisor shutdown on process signals.
- Connected clients receive consistent restart-required state.

## Topic 12: Durable Omarchy Dev Launchers

### User Problem

Local Omarchy launchers need to stay durable across upstream pulls and local
worktree resets. Hand-maintained launcher scripts are easy to drift from the
documented ports, app-data roots, and branch/worktree topology.

### What Changed

The follow-up topic `feat(dev-launchers): render durable Omarchy launchers`
adds a repository script that renders local launcher scripts and desktop entries
from a typed source of truth.

Important implementation areas:

- `scripts/lib/omarchy-dev-launchers.ts` renders launcher scripts and desktop
  entries for `original`, `main`, `staging`, and the rolling `nightly` replay
  worktree, plus the shared
  `t3code-tailscale-reconcile` helper.
- `scripts/lib/omarchy-dev-launchers.test.ts` verifies generated paths, ports,
  process names, kill mode, route repair behavior, shell syntax, and dry-run
  behavior.
- `scripts/install-omarchy-dev-launchers.ts` is the CLI entry point exposed by
  `pnpm omarchy:install-dev-launchers`.
- `docs/operations/omarchy-dev-launchers.md` records install, dry-run, and
  validation steps.

### Review Focus

Reviewers should check:

- Generated launchers target the documented worktrees and ports.
- The nightly launcher accepts only branch `nightly`,
  exposes `/nightly`, and can be stopped with `t3code-dev-nightly --kill`.
- Tailscale Serve path refresh and same-host tailnet route repair are generated
  from source, not hand-edited only in `~/.local/bin`.
- Machine-local scripts remain outside the repo under `~/.local/bin` and
  `~/.local/share/applications`.
- Dry-run output is safe by default and install requires an explicit action.

## Topic 13: Compact Chat, Sidebar, And Desktop Window UI Hardening

### User Problem

Staging review exposed several compact-layout failures: changed-file blocks were
too expanded by default, sidebar controls could become unreachable at small
sizes, mobile chat header actions could wrap poorly, and Linux desktop windows
showed native controls that conflicted with the app chrome.

### What Changed

The follow-up topic `fix(web-ui): stabilize compact chat and sidebar controls`
groups the UI hardening fixes with their tests.

Important implementation areas:

- `apps/web/src/components/chat/MessagesTimeline.tsx` and
  `apps/web/src/uiStateStore.ts` collapse changed files by default.
- `apps/web/src/components/Sidebar.tsx` and `components/ui/sidebar.tsx` keep
  sidebar controls reachable on constrained widths.
- `apps/web/src/components/chat/ChatHeader.tsx` and `ChatView.tsx` stabilize
  mobile header layout, toolbar wrapping, and sticky top-bar behavior.
- `apps/desktop/src/window/DesktopWindow.ts` removes Linux window controls and
  tests titlebar/window option behavior.

### Review Focus

Reviewers should check:

- Long labels, chat titles, and toolbar actions wrap or collapse without
  overlapping.
- Changed-file expansion state remains user-toggleable after defaulting closed.
- Desktop window options are platform-specific and do not regress macOS or
  Windows titlebar handling.

## Topic 14: Provider Usage And Runtime Stream Coalescing

### User Problem

Provider usage snapshots need deterministic ordering, and provider runtime
streams can become noisy under reconnects or assistant streaming bursts. The UI
should not thrash on repeated connection events, and server projections should
avoid redundant work while still preserving correctness.

### What Changed

Two follow-up topics cover this area:

- `fix(provider-usage): stabilize Codex limit ordering`
- `perf(runtime): coalesce reconnects and assistant streaming`

Important implementation areas:

- `apps/server/src/provider/Layers/CodexProvider.ts` normalizes Codex usage and
  rate-limit window ordering with test coverage.
- `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts` coalesces
  runtime ingestion events and assistant stream updates.
- `packages/contracts/src/providerRuntime.ts` updates shared runtime event
  contracts.
- `apps/web/src/rpc/wsConnectionState.ts`, `apps/web/src/session-logic.ts`, and
  `packages/client-runtime/src/wsTransport.ts` debounce or coalesce reconnect
  state without hiding real disconnects.

### Review Focus

Reviewers should check:

- Usage ordering is deterministic when multiple Codex windows share reset
  times or missing fields.
- Coalescing never drops terminal states such as completed turns, errors, or
  reconnect-required state.
- Missing usage data remains non-fatal for provider readiness.

## Topic 15: Composer Mention, Slash-Menu, And Pasted-Chat-Reference Parsing

### User Problem

The composer needs to present more context sources without becoming difficult
to navigate. It also needs pasted chat-context references to resolve to the
right thread content instead of being sent as raw unresolved markup.

### What Changed

The follow-up topic `feat(composer): improve at-mentions and slash menus`
combines menu navigation and pasted chat-reference handling.

Important implementation areas:

- `apps/web/src/components/chat/ChatComposer.tsx` builds active context, path,
  instruction-rule, chat, terminal, provider skill, and template menu items.
- `apps/web/src/components/chat/ComposerCommandMenu.tsx` and
  `composerMenuNavigation.ts` provide grouped keyboard navigation.
- `apps/web/src/chatContextReferences.ts` expands pasted chat references before
  sending prompts.
- `packages/shared/src/composerTrigger.ts` keeps trigger parsing shared between
  tests and UI.
- Provider registry and WebSocket contract changes expose provider skills and
  context sources to the composer.

### Review Focus

Reviewers should check:

- File mentions, instruction-rule entries, provider skills, and templates have
  predictable ordering and keyboard behavior.
- Pasted chat references are expanded only for the current project/thread scope
  and avoid recursive self-reference.
- Current main's shared inline-token parser remains the source of truth for
  mentions, file links, skills, and source ranges.

## Topic 16: Configurable Prompt Settings

### User Problem

Prompt construction had hardcoded provider/developer instruction behavior. Users
need explicit settings for prompt defaults, reusable prompt text, and generation
behavior that applies consistently across providers and dev-launch helpers.

### What Changed

The follow-up topic `feat(settings): add configurable prompt settings` adds a
settings route, shared prompt helpers, and server provider wiring.

Important implementation areas:

- `packages/shared/src/prompts.ts` defines shared prompt configuration helpers.
- `packages/contracts/src/settings.ts` adds the prompt settings contract.
- `apps/server/src/textGeneration/TextGenerationPrompts.ts` applies prompt
  settings across text-generation providers.
- `apps/server/src/provider/CodexDeveloperInstructions.ts` delegates hardcoded
  instruction construction to the new shared helpers.
- `apps/web/src/components/settings/PromptSettingsPanel.tsx` and
  `apps/web/src/routes/settings.prompts.tsx` expose prompt settings in the UI.
- `apps/web/src/proposedPlan.ts` respects the configured prompt behavior.

### Review Focus

Reviewers should check:

- Defaults preserve previous behavior when no settings are changed.
- Settings schemas reject invalid or partial prompt configuration.
- Provider-specific prompt wiring does not duplicate logic across providers.
- Prompt settings apply to proposed-plan and dev-launch helper prompts.

## Topic 17: Effect Test Runner Resolution

### User Problem

Effect tests were not consistently resolving under the Vite/Vitest runner used
by the repo. This made the required `vp test` and package test scripts less
predictable after adding more Effect-based coverage.

### What Changed

The follow-up topic `fix(test-runner): resolve Effect tests under Vite` updates
root package/config wiring so Effect tests resolve consistently.

Important implementation areas:

- `package.json` includes the required test-runner dependency.
- `vite.config.ts` wires the runner resolution.
- `pnpm-lock.yaml` records the dependency change.

### Review Focus

Reviewers should check:

- The dependency change is limited to test infrastructure.
- `vp test` and package-level test scripts use the same runner resolution.

## Topic 18: Provider Reset And T3 Access Settings

### User Problem

Users need a first-class way to reset native provider state and inspect/manage
T3-specific provider access without relying on manual filesystem or provider
process cleanup.

### What Changed

The follow-up topic `feat(provider-settings): add provider reset and T3 access
settings` adds provider-native reset support and a settings surface for T3
access.

Important implementation areas:

- `apps/server/src/provider/Drivers/CodexNativeReset.ts` implements Codex
  native reset behavior with tests.
- Provider driver, registry, and service contracts expose reset capabilities
  across Codex, Claude, Cursor, Grok, and OpenCode adapters.
- `apps/server/src/mcp/t3ProviderMcpCatalog.ts` exposes the T3 provider MCP
  catalog.
- `packages/contracts/src/server.ts`, `rpc.ts`, `ipc.ts`, and `settings.ts`
  define the reset/access protocol and settings payloads.
- `apps/web/src/components/settings/SettingsPanels.tsx` and
  `apps/web/src/routes/settings.t3-access.tsx` expose the T3 access settings UI.

### Review Focus

Reviewers should check:

- Reset actions are only enabled for providers that explicitly advertise reset
  support.
- Reset failures are surfaced without corrupting provider registry state.
- T3 access settings do not expose local-only or privileged provider metadata
  beyond what the UI needs.
- The settings route remains reachable alongside prompt and connection
  settings.

## Topic 19: Desktop Shell Automation Tools

### User Problem

Agents need a product-native way to inspect and control the visible T3 Code
Electron shell, distinct from browser preview control. CDP is useful for manual
staging inspection, but it is not the app-level API agents should rely on for
shell screenshots, clicks, keyboard input, waits, or focused app status.

### What Changed

The follow-up topic `feat(app-automation): add desktop shell control tools`
adds desktop shell automation ownership, IPC/RPC contracts, and MCP `app_*`
tools for the Electron app.

Important implementation areas:

- `packages/contracts/src/appAutomation.ts` and
  `packages/contracts/src/browserAutomation.ts` define the shared app/browser
  automation contracts.
- `packages/contracts/src/rpc.ts` and `packages/contracts/src/ipc.ts` expose
  app automation RPC and desktop IPC payloads.
- `packages/client-runtime/src/wsRpcClient.ts` wires app automation methods
  into the client runtime.
- `apps/desktop/src/appAutomation/AppAutomationManager.ts` and
  `apps/desktop/src/ipc/methods/appAutomation.ts` execute desktop shell
  automation in Electron.
- `apps/web/src/components/app/AppAutomationOwner.tsx` owns the visible shell
  automation session from inside the routed app tree.
- `apps/server/src/mcp/AppAutomationBroker.ts` and
  `apps/server/src/mcp/toolkits/app/tools.ts` expose the MCP `app_*` tools.
- `docs/operations/headed-staging.md` documents the split between `preview_*`
  browser-preview control, `app_*` Electron-shell control, and CDP inspection.
- `scripts/lib/agent-chrome-browser.ts` and
  `scripts/setup-agent-chrome-browser.ts` configure the official Playwright
  Extension as the canonical authenticated Chrome surface without copying
  profile databases into Electron.
- `scripts/verify-agent-chrome-browser.ts` and the `SharedChromePageObject`
  helper perform the live headed tab, 1440×900 viewport, shared-session cookie,
  no-failure, and no-fallback assertions and write a secret-free flow evidence
  matrix.
- `packages/shared/src/prompts.ts` selects extension-backed `browser_*` tools
  first, requires a 1440×900 viewport, and preserves `preview_*` as the
  explicit unavailable-browser fallback.
- `docs/operations/agent-chrome-browser.md` documents one-time extension/token
  setup, health checks, recovery, and browser-surface ownership.

### Review Focus

Reviewers should check:

- `AppAutomationOwner` is rendered inside `RouterProvider` so router hooks are
  valid and the Electron renderer cannot blank before the app shell loads.
- `app_*` tools only target the active desktop shell owner and reject stale
  thread ownership.
- The app automation broker, session registry, and MCP HTTP server clean up
  owners and pending requests when clients disconnect.
- IPC and RPC schemas preserve the distinction between preview automation and
  full app automation.
- Headed staging docs describe when to use product-native MCP tools versus CDP
  inspection.
- Authenticated web tasks reuse the operator's real agent-only Chrome state,
  while dev-preview and unsupported-extension tasks retain the collaborative
  preview fallback.
- The setup command pins the Playwright MCP package, keeps the extension token
  out of user-provided command-line options and output, pins the existing
  `Default` Chrome profile through a singleton launcher, and recognizes
  configuration drift.
- `pnpm run agent-browser:verify` passes against the real headed Chrome
  extension before promotion.

## Topic 20: Composer-Created Worktree Semantic Naming

### User Problem

The composer's New worktree mode created Git worktrees with temporary
`t3code/<hex>` branch names. The first provider turn could later rename the
branch semantically, but the worktree folder was already created from the
temporary branch name, leaving local worktree paths hard to identify.

### What Changed

The follow-up topic `feat(composer): name worktrees semantically` reuses the
existing configurable Branch name text-generation prompt before `git worktree
add` runs for composer-created worktrees.

Important implementation areas:

- `packages/shared/src/git.ts` owns the shared `t3code/...` worktree branch
  sanitizer used by both bootstrap creation and the post-turn rename safety net.
- `apps/server/src/ws.ts` resolves a semantic worktree branch during bootstrap,
  checks existing refs for collisions, suffixes duplicate generated names, and
  falls back to the client-supplied temporary branch when generation or safe
  resolution fails.
- `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts` keeps the
  existing temporary-branch rename behavior for older or fallback flows.
- `apps/server/src/server.test.ts` covers semantic creation, generated-name
  suffixing, fallback behavior, setup-script path preservation, and the existing
  bootstrap dispatch ordering.

### Review Focus

Reviewers should check:

- Client bootstrap payloads remain backward-compatible and still provide a
  temporary branch fallback.
- The existing Settings -> Prompts -> Text Generation -> Branch name prompt is
  the only user-facing prompt control involved.
- A text-generation failure, settings read failure, or ref-list failure does not
  block the first send in New worktree mode.
- Generated branch collisions use deterministic numeric suffixes before
  worktree creation.
- The setup script receives the actual created worktree path after semantic
  branch resolution.

## Topic 21: Local Cross-App Observability Hub

### User Problem

Main, staging, and dev worktrees can all be running at the same time, but their
logs, traces, and metrics were split across local files, stdout, and optional
per-process OTLP configuration. That made it hard for an agent to answer which
worktree is failing, whether staging already differs from main, or which dev
topic introduced a regression.

### What Changed

The follow-up topic `7d9cd8de8` `feat(observability): add local cross-app hub`
adds a local-only OpenTelemetry Collector and Grafana LGTM stack. Apps emit
standard OTLP to `http://127.0.0.1:4318`; the Collector routes logs to Loki,
traces to Tempo, and metrics to Prometheus. Grafana provides a provisioned T3
Code local observability dashboard.

Important implementation areas:

- `scripts/local-observability.ts` starts or reuses stable Docker containers
  for the local Collector and LGTM stack, binds ports to loopback, and warns
  without blocking app startup when Docker is unavailable.
- `infra/local-observability/otel-collector.yaml` defines local OTLP
  receivers, batching, memory limits, and LGTM exporters.
- `infra/local-observability/grafana/` provisions the local dashboard.
- `scripts/dev-runner.ts` injects OTLP env vars and worktree identity
  attributes before starting server/web/desktop dev processes.
- `packages/shared/src/observabilityResource.ts` centralizes T3 resource
  attributes for worktree, git, runtime, thread, turn, and provider identity.
- Server, desktop, web, and provider logging paths export OTLP logs in addition
  to existing local trace/provider files.
- `/api/observability/v1/logs` mirrors the browser trace proxy for authenticated
  browser log forwarding.
- `observability_*` MCP tools expose read-only local diagnostics for agents and
  fall back to local files when LGTM is unavailable.

### Review Focus

Reviewers should check:

- Apps target the local Collector endpoint, not Loki/Tempo/Prometheus/Grafana
  directly.
- Docker startup is best-effort and does not block app startup.
- All hub ports are loopback-bound.
- Worktree and git identity attributes are present on emitted telemetry.
- Browser log forwarding uses the same auth model as browser trace forwarding.
- MCP observability tools are read-only, idempotent, and non-destructive.
- Hosted analytics providers and hosted credentials are not introduced.
- Local file fallback still works when Docker or LGTM is unavailable.

### Suggested Manual Checks

- Run `vp run observability:local`.
- Open `http://127.0.0.1:3030/d/t3code-local-observability/t3-code-local-observability?orgId=1`.
- Launch main and staging, trigger a known warning, and filter by
  `t3.worktree.role`.
- Use `observability_recent_errors` for `worktreeRole=main` and confirm it can
  retrieve the same event or fall back to local files.

## Topic 22: Desktop Observability Closed-Pipe Hardening

### User Problem

The desktop main process could crash with `Error: write EPIPE` when development
console mirroring attempted to forward backend child output to an Electron
stdout or stderr pipe that the launcher had already closed.

### What Changed

The follow-up topic `d423efcf4` `fix(desktop): ignore closed observability
output pipes` keeps development console mirroring best-effort. Closed or
otherwise failing stdout/stderr writes are ignored, while backend child output
continues to be persisted to `server-child.log` and exported through the
observability path.

Important implementation areas:

- `apps/desktop/src/app/DesktopObservability.ts` catches development console
  mirror write failures before they can escape the Electron main process.
- `apps/desktop/src/app/DesktopObservability.test.ts` covers an `EPIPE` from
  `process.stdout.write` and verifies the structured backend child output
  record is still persisted.

### Review Focus

Reviewers should check:

- Only development console mirroring is best-effort; structured child process
  output logging still runs.
- The fix does not hide server-child output from local files or OTLP logs.
- The regression test models the launcher-closes-stdio failure mode from the
  Electron main process.

## Topic 23: Grafana Datasource And Dashboard Provisioning

### User Problem

The local LGTM container could receive telemetry, but Grafana itself depended on
image defaults for datasources. That left operators without stable datasource
UIDs, cross-links between logs/traces/metrics, or dashboard variables for
filtering main, staging, and dev worktrees.

### What Changed

The follow-up topic `a1b06eaf6` `feat(observability): provision Grafana
datasources` adds checked-in Grafana datasource provisioning for the local LGTM
stack. Loki, Tempo, and Prometheus now have stable local UIDs and Explore
correlations. The local dashboard also uses those UIDs directly and adds
worktree, service, and provider variables plus expanded rate/resource panels.

Important implementation areas:

- `infra/local-observability/grafana/provisioning/datasources/t3code.yaml`
  provisions `Loki`, `Tempo`, and `Prometheus` with stable UIDs.
- Loki derived fields link `trace_id` values to Tempo.
- Tempo links traces back to Loki logs and nearby Prometheus metric queries.
- Prometheus exemplars with `trace_id` or `traceID` link to Tempo.
- `infra/local-observability/grafana/dashboards/t3code-local-observability.json`
  now uses datasource UIDs and dashboard variables instead of image-default
  datasource names.
- `scripts/local-observability.test.ts` verifies the professional datasource
  provisioning remains checked in.

### Review Focus

Reviewers should check:

- The Grafana setup remains local-only and does not add hosted datasource URLs
  or credentials.
- Dashboard queries filter by worktree/service/provider variables without
  hard-coding one checkout.
- Logs, traces, metrics, and exemplars have useful cross-navigation paths.
- Existing container startup still mounts the whole provisioning directory.
- Operators can reload provisioning by restarting `t3code-otel-lgtm` without
  changing app OTLP endpoints.

## Topic 24: Observability Digest And Worktree Metric Labels

### User Problem

The local hub can collect logs, traces, and metrics, but agents need a compact
way to inspect the combined signal without manually building Grafana queries.
The first live digest also exposed two attribution gaps: a staging process could
inherit `T3CODE_WORKTREE_ROLE=main`, and Prometheus metric series did not carry
worktree labels even though logs and traces did.

### What Changed

The follow-up topic `9d9990fbb` `feat(observability): add local digest and
worktree metric labels` adds a read-only CLI digest and tightens worktree
identity propagation.

The follow-up test commit `a08b2836e` `test(dev-runner): isolate worktree
identity env fixture` makes the dev-runner identity test pass an explicit
fixture cwd so it verifies the intended `dev-*` behavior no matter whether the
suite runs from main, staging, or another worktree.

Important implementation areas:

- `scripts/observability-digest.ts` queries local Loki, Prometheus, and Tempo
  and prints recent issues, top RPC/git totals, trace samples, metric label
  coverage, and identity mismatches for agents.
- `scripts/dev-runner.ts` now lets known local paths for `main`, `staging`,
  `original`, and `dev-*` override stale inherited `T3CODE_WORKTREE_ROLE`
  values.
- `apps/server/src/observability/Metrics.ts` maps local T3 resource attributes
  onto Prometheus-safe labels such as `t3_worktree_role`, `t3_git_branch`, and
  `t3_dev_instance`.
- `docs/operations/observability.md` documents `vp run observability:digest`
  and worktree-aware Prometheus query patterns.

### Review Focus

Reviewers should check:

- The digest is read-only and only queries loopback local observability APIs.
- New metric labels are useful for local worktree comparison without changing
  the app's OTLP contract.
- Relaunched main/staging/dev apps identify their own checkout even when
  launched from a parent process with stale T3 env.
- Existing metrics continue to emit method, operation, provider, and outcome
  labels alongside the new worktree labels.

## Topic 25: Durable Main Uptime And Promotion Guard

### User Problem

Main was launched as an ordinary desktop session and could remain down after a
crash. An interrupted or duplicate replay could also leave the live checkout
conflicted, causing a permanent restart loop. Promotion relied on shallow route
checks that did not prove the real app workflow.

### What Changed

The `main-uptime` topic makes the Linux user systemd manager the sole durable
Main supervisor. It records one approved SHA, checks Git integrity every five
seconds, and checks public and loopback health every 30 seconds with startup
grace and consecutive-failure hysteresis. Route-only failures repair Tailscale
without restarting the app. Integrity recovery preserves a complete incident
bundle before restoring unauthorized changes.

Promotion opens a short lock for one exact candidate. The candidate can be
started on the live route, but it cannot become approved or be published to
GitHub and the Mac until the canonical Main verifier reaches the app through
the primary interface, finds a project, creates a chat, sends `Hi`, receives an
assistant response, and writes a fresh proof receipt plus screenshot.

Important implementation areas:

- `scripts/localTopics/mainUptime/index.ts` renders and installs the machine-local service files.
- `scripts/localTopics/mainUptime/templates/t3code-main-uptime.sh` owns integrity checks, evidence capture, restore, promotion locks, proof validation, and abort.
- `apps/desktop/scripts/verify-staging-public.mjs` owns the reusable strict Main proof.
- `docs/operations/main-uptime.md` defines install, promotion, and recovery operations.
- `.codex/skills/premote-nightly` and `.codex/skills/premote-staging` enforce proof-before-publication order.

### Review Focus

Reviewers should check:

- A service starts only from the approved SHA or the exact active promotion candidate.
- Guard recovery archives dirty files, index stages, refs, and a verified bundle before resetting anything.
- Expired or abandoned promotion locks converge back to the approved SHA.
- Old, wrong-SHA, non-canonical, or pre-lock proof cannot approve a candidate.
- GitHub Main and the Mac remain unchanged until the exact Staging revision has fresh approval and both Main
  launchers pass the coordinated transaction.
- Standalone Main verification outside a promotion does not change approval state.

## Topic 26: On-the-Go Voice Companion And Theo Orchestration

### User Problem

T3 Code normally requires visual attention for new agent responses, follow-up
questions, approvals, and prompt submission. That makes it difficult to keep a
coding session moving while walking, commuting, or working away from the
keyboard, and ordinary browser dictation cannot safely distinguish discussion
from an authorized send or preserve queued work across reconnects.

### What Changed

The topic commit recorded in `local-plugins/on-the-go/plugin.json`
`feat(on-the-go): add voice-first Theo companion` adds a replayable voice layer
across contracts, server, web/Electron, and native mobile.
Follow-up topic `fix(on-the-go): add reliable local voice transcription`
replaces Electron's network-backed browser recognizer with the bounded
active-environment Whisper path described below.
Follow-up topic `fix(on-the-go): restore macOS microphone permission identity`
keeps the development launcher as a signed LaunchServices-owned app, adds the
native microphone consent gate, and prevents shutdown from leaving a detached
Electron process.
Follow-up topic `refactor(on-the-go): isolate macOS launcher runtime` keeps that
behavior behind the topic-owned module and isolates headed CDP/profile state
from the normal macOS login profile and keychain.
Follow-up topic `fix(on-the-go): normalize cached macOS frameworks` repairs
flattened framework aliases in an existing Electron install before signing, so
the durable Staging launcher remains restart-safe without replacing app data.
Follow-up topic `fix(on-the-go): harden local whisper input` converts captured
PCM to a private temporary 16 kHz WAV for the supported `whisper-cli` file
interface and treats early subprocess exits as ordinary transcription failures
instead of crashing the backend with an unhandled stdin `EPIPE`.

Important implementation areas:

- `packages/contracts/src/localTopics/onTheGo` owns commands, durable records,
  settings, notifications, Follow checkpoints, and RPC schemas.
- `apps/server/src/localTopics/onTheGo` owns authenticated device binding,
  durable queues, server-lifetime provider event ingestion, bounded/redacted
  context fetches, Theo conversation and fallbacks, and exact Prepared Prompt
  revisions.
- `packages/client-runtime/src/localTopics/onTheGo` owns shared conversation
  control, command vocabulary, Barge-In behavior, notification delivery, and
  mandatory `Send it` authorization.
- `apps/web/src/localTopics/onTheGo` provides the Voice Dock, settings, typed
  reciprocal controls, captions, notification badges, Follow timeline, and
  foreground/browser speech policy. Electron uses bounded PCM capture through
  the active environment's authorized local Whisper RPC instead of depending
  on Chromium's network-backed recognizer.
- `apps/mobile/src/localTopics/onTheGo` and
  `apps/mobile/modules/t3-native-controls` provide native recognition/TTS,
  microphone and audio-focus policy, secure device identity, push-to-talk, and
  the launcher quick action.
- `apps/desktop/e2e/specs/on-the-go.spec.ts` drives recognition through the real
  Electron app and verifies activation, Stop, announcements, Follow, protected
  dictation, reload recovery, queueing, steering, and reciprocal controls. Its
  opt-in `@audio` case also creates a transient PipeWire microphone and proves
  a spoken fixture through the real PCM/Whisper path.
- `apps/desktop/scripts/electron-launcher.test.mjs` verifies the macOS app and
  helper signatures, entitlements, Mach-O identity, and LaunchServices command;
  `apps/desktop/src/localTopics/onTheGo/index.test.ts` verifies that renderer
  audio access waits for the native microphone decision.

### Review Focus

Reviewers should check:

- Exactly one authenticated device owns a Voice Session and wake-free local
  Stop remains available even when remote calls are exhausted.
- Discussing or revising a response never sends it; only the exact current
  Prepared Prompt revision is eligible after `Send it`.
- Response and Attention queues survive reconnects without duplicating work,
  and completion tones do not read a new announcement until the user asks.
- Follow Mode narrates conservative provider checkpoints, can switch chats, and
  does not invent progress from unknown provider events.
- Context fetches are bounded, redacted, scoped to the authorized device, and
  treated as untrusted; durable state retains evidence metadata rather than raw
  excerpts.
- Unsupported STT/TTS selections, microphone revocation, calls/audio-focus
  loss, and public-output privacy conflicts fail closed with a visible reason.
- All stable `OTG-UT-001` through `OTG-UT-024` rows retain normal,
  refusal/failure, and durable/safety evidence.

## Cross-Topic Risks

### Endpoint And URL Construction

Remote access, app launch, pairing links, and runtime restart all publish URLs.
Review every boundary where a local URL becomes a public URL. The expected rule
is that public links come from normalized advertised endpoints, not from ad hoc
string concatenation in UI components.

### Process Ownership

Provider recovery, app launch, desktop restart, and E2E harness code all manage
processes. Review cleanup paths carefully. A failed launch or interrupted test
should not leave child processes, occupied port state, or mutable Tailscale
routes behind.

### Connected Client Consistency

Desktop, browser, hosted browser, and mobile clients should agree on:

- The current server endpoint.
- The running worktree and branch context, when local context exists.
- Whether app launch is available.
- Whether the active project's git snapshot is available.
- Whether restart is required.
- Whether provider usage details are available or absent.
- Whether provider reset and T3 access controls are available for the selected
  provider.
- Whether prompt settings are applied consistently to provider and helper
  prompts.
- Whether composer-created worktree branch and folder names reflect the branch
  naming prompt when generation succeeds and preserve temporary fallback behavior
  when it fails.
- Whether local observability identifies main, staging, and dev worktrees
  consistently across logs, traces, metrics, and agent diagnostics.
- Whether On-the-Go ownership, notification counts, Follow state, exact
  Prepared Prompt revision, and `Send it` authorization agree across desktop,
  hosted web, and mobile clients.
- Whether a provider session is recovered, unavailable, or still running.
- Whether app automation ownership follows the active desktop thread and does
  not leak control across threads or environments.

### Project Agent Files And Harness

Project agent file changes affect repo writes, provider startup, and credential
boundaries. Reviewers should confirm:

- Agent Files is only shown when an active project root is available.
- Present provider files under hidden directories such as `.agents`, `.cursor`,
  `.claude`, `.github`, `.codex`, `.windsurf`, and `.devin` are detected.
- Missing recommended files are shown separately from present files.
- Create/update/upsert/delete operations stay relative to the project root.
- Deletes require confirmation in the UI and reject directories, traversal
  paths, absolute paths, and protected root `AGENTS.md`.
- Scaffolding creates missing `.agents/` files and skips existing files.
- Invalid `.agents/harness.json` produces warnings instead of blocking listing.
- Project MCPs are injected after global T3 access MCPs, cannot override
  `t3-code`, and are skipped when required project secrets are missing.
- Project-scoped auth values are stored only in the server secret store and are
  never written into repo files or re-rendered by the UI.

### Security And Scope

Reviewers should pay particular attention to:

- Public URLs should not expose local-only control endpoints.
- Restart actions should only be available for supported supervised runtimes.
- Tailscale mutation should remain explicit and opt-in in tests.
- Provider account usage should not expose more account metadata than the UI
  needs to explain limits.
- Provider reset should not delete or mutate provider state unless the selected
  driver explicitly supports that reset operation.
- Agent file CRUD should not allow path traversal, absolute-path writes, or
  accidental secret persistence into the repository.
- Context attachments should not include terminal data beyond what the user
  intentionally selected.
- Pasted chat references should only expand project-scoped chat content that
  the current client can already access.
- App automation tools should not expose shell control unless the active
  desktop owner and requested thread match.
- Push notification registration should store minimal required device data.
- Voice context, speech, announcements, handoffs, and fallback-model egress
  should share the same sensitive-text redaction and authorization boundary.

## Reviewer Checklist

Use this checklist before approving the stack:

- The topic commits are understandable without reading the old commit history.
- Each feature has tests at the shared utility, server, web, desktop, or mobile
  layer where the behavior actually lives.
- The final tree passes `vp check`, `vp run typecheck`, and
  `vp run lint:mobile`.
- UI-affecting changes have visible Electron verification or a clear reason why
  browser/unit coverage is enough.
- Public endpoint behavior is tested with root paths and nested paths.
- App launcher failure states are tested, not only successful launches.
- Running-context tests cover missing and whitespace-only branch refs, dev
  branding precedence, and static-label fallback.
- Session recovery tests cover both recoverable and unrecoverable providers.
- Project Git tests cover clean, dirty, and remote-less repositories.
- Provider usage tests cover successful limits, missing usage, and failed
  best-effort usage fetches.
- Restart flow tests cover supported and unsupported runtimes.
- Runtime coalescing tests cover reconnect churn and assistant streaming without
  losing terminal provider states.
- Composer tests cover mention parsing, slash-menu navigation, provider skills,
  prompt templates, and pasted chat-reference expansion.
- Prompt settings tests cover schema defaults, provider prompt construction, and
  UI route rendering.
- Provider reset and T3 access tests cover reset support discovery, successful
  reset, failed reset, and settings route rendering.
- App automation tests cover owner registration, stale-owner rejection, MCP tool
  routing, and Electron renderer startup without a blank shell.
- Agent Files tests cover shared provider classification, project RPC schemas,
  server CRUD/scaffold/delete safety, project MCP secret resolution, header
  visibility, and sheet mutation flows.
- Observability tests cover dev-runner env injection, local hub startup warning
  behavior, OTLP log config propagation, browser log forwarding, read-only MCP
  tool registration, and worktree resource attributes.
- Main uptime tests cover dirty and committed mutation preservation, approved-SHA
  restoration, exact-candidate launch, proof rejection, approval, and abort.
- Main promotion proof uses the canonical public route and completes the real
  project/chat workflow before GitHub Main moves.
- On-the-Go tests cover every `OTG-UT-001`–`OTG-UT-024` acceptance row, native
  and desktop voice policy, conservative provider mapping, durable queue caps,
  redaction/SSRF boundaries, exact `Send it`, and the headed recognition flow.
- `AGENTS.md` contains a current topical stack ledger, and this review guide is
  updated in the same branch whenever topics are added, squashed, split,
  renamed, or dropped. If a topic changes contracts, RPC/IPC shapes, MCP tools,
  automation controls, launch behavior, or operator workflows, update the
  relevant API/reference/operations docs in the same branch.
- Documentation explains how to reproduce the important workflows.
