# AGENTS.md

## Task Completion Requirements

- `vp check` and `vp run typecheck` must pass before considering tasks completed.
  - If changing native mobile code, `vp run lint:mobile` must also pass.
- Use `vp test` for the built-in Vite+ test command and `vp run test` when you specifically need the `test` package script.
- Prefer visible T3 Code Staging Electron verification for UI changes. Use the controlled workflow in
  `docs/operations/headed-staging.md`, keep its isolated `T3CODE_HOME`, and use the documented CDP port for
  screenshots/inspection.
- For the live staging URL, `https://giggabit.tailfb378a.ts.net/staging/`, a verification pass requires
  `vp run verify:staging-public`. Do not accept loopback-only curls, blank-page screenshots, or a shallow HTTP
  status check as proof. The verifier must prove the public HTTPS path reaches the app, shows projects, creates a
  chat with `Hi`, and receives a non-empty assistant response.

## Local Worktree Topology

- `/home/jgigg/code/t3code` is the root checkout for the `main` branch. This is the default local development
  checkout and tracks `origin/main` from `git@github.com:J-Giggles/t3code.git`.
- Treat `/home/jgigg/code/t3code` as the live `T3 Code Main` checkout. Do not perform implementation work,
  cherry-picks, merges, or broad file edits directly in this checkout while `T3 Code Main` may be running.
- Before making any intentional change in the root `main` checkout, first verify whether `T3 Code Main` is running
  on its documented ports or launcher process. If it is running, do not edit files there unless the user explicitly
  asks for an emergency repair; use a separate `dev-` worktree for normal work.
- `/home/jgigg/code/t3code/.worktrees/original` is reserved for the `original` branch. It is the clean upstream
  mirror of `upstream/main` from `git@github.com:pingdotgg/t3code.git` and may be hard-reset by local sync
  automation after a backup ref and stash are created for dirty or divergent state. Do not make product changes
  there.
- `/home/jgigg/code/t3code/.worktrees/staging` is reserved for the `staging` branch and the staging promotion lane.
  Do not check out feature branches in this path.
- `/home/jgigg/code/t3code/.worktrees/nightly-local` is the rolling upstream replay candidate worktree. It is owned
  by `pnpm run topic-stack:nightly -- --apply`; if it is dirty, nightly replay must fail closed instead of resetting
  it.
- Do all new implementation work in a separate worktree whose directory name starts with `dev-`, for example
  `.worktrees/dev-provider-usage-popover`.
- Keep each `dev-` worktree on its own feature branch with coherent commits. Do not pile unrelated changes into
  another chat's dirty worktree.
- Promote to `staging` only after the `dev-` worktree is clean, committed, and verified. Promotion means
  cherry-picking or merging the feature commits into the reserved staging worktree.
- After a `dev-` worktree's requested work is complete and verified, always merge or cherry-pick its committed
  feature branch back into the reserved `staging` worktree before reporting the task complete.
- Never move unverified or typecheck-failing work into `staging`; leave it in its `dev-` worktree until fixed.

## Topic Commits And Headed E2E

- Squash work into coherent topic commits that behave like replayable plugins on top of the original upstream repo.
  Each topic should be possible to reapply after `.worktrees/original` syncs to a newer upstream `main`.
- Bundle the tests with the topic commit they verify. Do not leave E2E coverage in a later unrelated commit.
- Topical commits should include headed end-to-end tests built around Page Object Model helpers, and those tests must
  be run before promotion.
- For HTTPS Tailscale setup changes, the headed E2E must launch the app, verify the HTTPS forwarding config is
  correctly established, and connect through the HTTPS URL from a separate browser context.
- If the HTTPS forwarding feature can change the exposed URL or trailing route, include an E2E variant that changes
  the route and then reconnects through the updated HTTPS URL.
- Remote-access topic commits must carry their own public-path and verifier coverage. When a fix touches Tailscale
  Serve, Vite base paths, public asset URLs, WebSocket paths, pairing URLs, or same-host route repair, keep the code,
  focused tests, verifier update, and operations docs in the same replayable topic.
- Keep topic commits narrow: one feature/fix plus its tests, docs, and required migration/config updates. Avoid
  mixing multiple replayable topics into one commit.
- The `original` mirror should be synced from upstream and tested nightly so replayable local topics can be checked
  against the latest upstream base. Use `pnpm run topic-stack:nightly -- --dry-run` to inspect the plan and
  `pnpm run topic-stack:nightly -- --apply` to fetch `upstream`, back up and reset `original`, rebuild
  `.worktrees/nightly-local`, and run verification. The nightly script never promotes to `staging`.
- Local replay topics are documented as repo-internal plugins under `local-plugins/<topic>/`. Keep each
  `plugin.json`, topic `README.md`, and `docs/operations/jordan-topic-stack.manifest.json` entry synchronized with
  the replay commit. These are not installable Codex plugins and must not use `.codex-plugin/plugin.json`.
- Topic READMEs must keep checked Replay Checklist Items under `Added Features`, `Added UI`,
  `Added Server And Runtime Behavior`, and `Added Tests`. Each non-N/A item must include backticked evidence such as
  a source path, test path, command, or public route. `pnpm run topic-plugins:check` enforces the checklist shape and
  validates evidence paths that look like repo paths.
- New local topic code should be componentized behind package-local topic modules such as
  `apps/web/src/localTopics/<topic>/index.ts` or `apps/server/src/localTopics/<topic>/index.ts`, then imported from
  main files as thin wiring. Local plugin metadata uses schema v2; code, mixed, and test topics must have
  complete componentization with existing entrypoints, while docs-only topics use `not-applicable`.
- Whenever topic commits are added, squashed, split, renamed, dropped, or promoted, update this ledger and
  `docs/operations/staging-review-guide.md`, `docs/operations/jordan-topic-stack.manifest.json`, and the matching
  `local-plugins/<topic>/` folder in the same branch before promotion. If the topic changes public contracts,
  RPC/IPC shapes, MCP tools, browser/app automation controls, launch behavior, or operator workflows, update the
  relevant API/reference/operations documentation in that same branch.
- Promoting `staging` to `main` requires an explicit user request, clean staging and main worktrees, backup refs for
  both branches, green `vp check` and `vp run typecheck`, applicable lint/E2E verification, and either a
  fast-forward update or a documented non-rewrite reconciliation.

## Current Topical Stack Ledger

This ledger records the local topical stack rebuilt on June 25, 2026 on top of
`upstream/main`. The detailed rebuild, verification, equality, promotion, and
empty-commit handling workflow lives in `docs/operations/jordan-topic-stack.md`.

Current topic order:

1. `feat(remote-access): manage Tailscale and routed browser access`
   - Includes public path normalization, hosted asset/API/WebSocket routing, pairing path preservation, and the
     strict public staging verifier.
   - Also owns user-managed single-segment Tailscale Serve route validation, availability probing, and reserved
     `/main`, `/original`, and `/staging` ownership checks against the actual git branch/worktree.
2. `feat(dev-launch): add durable worktree launch profiles`
   - Includes Omarchy launcher generation and the shared `t3code-tailscale-reconcile` helper for Tailscale Serve
     path refresh and same-host route repair.
   - Dev runner and launch-collision handling must reject reserved Tailscale routes when the actual branch/worktree
     does not own the reservation, even if launcher env claims a reserved role.
3. `feat(runtime): preserve worktree context and controlled recovery`
4. `feat(project-git): add project Git dashboard and VCS reconciliation`
5. `feat(provider-settings): add usage, reset, and T3 access controls`
6. `feat(composer): add mentions, slash menus, chat context, and worktree naming`
   - Includes chat-layout protection for seeded history rows, context-window visibility, right-panel access, and
     terminal-drawer composer offsetting.
7. `feat(prompt-settings): add configurable prompt settings`
8. `feat(app-automation): add desktop shell MCP controls`
9. `feat(project-agent-files): add schemas, CRUD, and scaffold safety`
10. `feat(observability): add local hub, Grafana provisioning, and digest metrics`
11. `test(desktop): add headed desktop verification coverage`
12. `docs(operations): document Jordan patch-stack maintenance workflow`
13. `feat(topic-stack): add replay checklist and audit safeguards`

- Includes machine-enforced Replay Checklist Items for local plugin READMEs, `topic-audit.md` run artifacts, and
  human promotion sign-off documentation.

When upstream changes, prefer the scripted nightly workflow in
`docs/operations/nightly-upstream-replay.md`. It fetches upstream, backs up and
resets `original`, creates or reuses `.worktrees/nightly-local`, creates
`dev/nightly-topic-stack-YYYYMMDD`, cherry-picks the manifest topics in order,
and writes artifacts, including `topic-audit.md`, under `.t3code-nightly-runs/`. Resolve conflicts in the
owning topic, run the verification commands from
`docs/operations/jordan-topic-stack.md`, and compare the final stack against the
unsquashed source branch with `git diff` when applicable. Promotion to
`staging` remains a separate explicit user-requested step and requires human sign-off in the run's
`topic-audit.md`.

Current staging includes the June 26 follow-up topic
`fix(remote-access): harden public staging verification`.
Current staging also includes the replay-safeguards topic that keeps checklist enforcement and run-audit generation in
the manifest.

When the remote-access topic is replayed after an upstream update, also run the focused public-path tests and
`vp run verify:staging-public` from the rebuilt stack. If a local browser reports DNS, timeout, or blank-page errors
while a headless or loopback check passes, treat the verifier as insufficient until it exercises the primary network
interface and the real project/chat flow. During rebuilds, fold the web/server/verifier pieces into the remote-access
topic and the Omarchy reconcile helper into the dev-launch topic; if replaying current staging history as-is, apply
the hardening follow-up only after both topics are present.
When replaying route ownership changes, keep Tailscale route availability and Settings UI route probing in
remote-access, and keep dev-runner reserved-route launch failures and route-collision prompts in dev-launch.

### Superseded June 18 Ledger

This historical ledger records the local topical stack rebuilt on June 18, 2026.
Keep it for provenance when auditing where older staging topics came from.

Rebuilt follow-up topics on top of `main`:

- `b433b7587` `fix(remote-access): preserve Tailscale pairing paths`
  - Source staging commit: `2e496b5ad`.
  - Preserves Tailscale pairing paths in desktop exposure and settings UI.
- `6539efbff` `feat(dev-runtime): supervise manual dev restarts`
  - Source staging commits: `6c6d3f349`, `0f2b6b702`, `2734b02ba`.
  - Adds the dev supervisor, manual restart policy, restart toast wiring, and headed-staging docs.
- `38316ae22` `feat(dev-launchers): render durable Omarchy launchers`
  - Source staging commit: `7c6362634`.
  - Adds the Omarchy launcher renderer, install script, tests, and operations guide.
- `e6c1cffeb` `fix(web-ui): stabilize compact chat and sidebar controls`
  - Source staging commits: `95a69f01d`, `df053b3bd`, `3acc184d1`, `07c72f8e9`, `c4f02424d`.
  - Collapses changed files by default, keeps sidebar/chat/empty-thread controls reachable, and removes Linux window
    controls.
- `2d394a610` `fix(provider-usage): stabilize Codex limit ordering`
  - Source staging commit: `5ff8d9319`.
  - Stabilizes Codex usage and rate-limit ordering.
- `e181246fd` `perf(runtime): coalesce reconnects and assistant streaming`
  - Source staging commit: `5181d301f`.
  - Coalesces runtime reconnects and assistant stream ingestion.
- `87eae68bc` `feat(composer): improve at-mentions and slash menus`
  - Source staging commits: `be928e20d`, `30a73966a`.
  - Adds richer composer menu navigation, slash-menu items, provider skills, and pasted chat references.
- `5229eb4cf` `feat(settings): add configurable prompt settings`
  - Source staging commit: `e8230af0f`.
  - Adds prompt configuration settings, shared prompt helpers, and provider prompt wiring.
- `d0f6e47bf` `fix(test-runner): resolve Effect tests under Vite`
  - Source staging commit: `c4b7f2431`.
  - Adds the Vite/Vitest package and config resolution needed by Effect tests.
- `793eb0d97` `feat(provider-settings): add provider reset and T3 access settings`
  - Source staging commit: `20949c653`.
  - Adds provider-native reset support, the T3 provider MCP catalog, and T3 access settings.
- `89d130745` `feat(app-automation): add desktop shell control tools`
  - Source staging commit: `571abd5c8`.
  - Adds desktop shell automation ownership, app automation RPC/IPC contracts, MCP `app_*` tools, and headed-staging
    control docs.
- `712114b36` `feat(project-agent-files): add repo harness CRUD`
  - Source dev commit: `712114b36`.
  - Adds the Project Agent Files sheet, shared provider-file catalog, project harness manifest schemas/RPCs, repo-safe
    CRUD/scaffold operations, project-scoped MCP secret resolution, provider MCP/env injection, tests, and docs.
- `6ffca379f` `test(project-agent-files): stabilize sheet browser locator`
  - Source dev commit: `6ffca379f`.
  - Narrows the Agent Files browser test file-name locator to avoid list/detail strict-mode ambiguity.
- `06a597474` `feat(composer): name worktrees semantically`
  - Source dev commit: `d19c7fa14`.
  - Source staging commit: `06a597474`.
  - Generates semantic `t3code/...` branch names before composer-created worktrees are added, so the branch and
    derived worktree folder use the existing configurable branch-name prompt while preserving temporary-branch
    fallback behavior.
- `7d9cd8de8` `feat(observability): add local cross-app hub`
  - Source dev commit: `1fbec9aea`.
  - Adds the local OpenTelemetry Collector/LGTM startup, loopback OTLP logs/traces/metrics env wiring, worktree
    identity resource attributes, server/browser/desktop/provider log export, read-only observability MCP tools,
    provisioned Grafana dashboard, tests, and operations docs.
- `d423efcf4` `fix(desktop): ignore closed observability output pipes`
  - Source dev commit: `30c1901ef`.
  - Treats closed Electron stdout/stderr pipes as best-effort development console mirroring failures while preserving
    backend child output in the structured desktop observability log.
- `a1b06eaf6` `feat(observability): provision Grafana datasources`
  - Source dev commit: `4b79cc8ed`.
  - Provisions stable local Loki, Tempo, and Prometheus Grafana datasources with log/trace/metric correlations,
    worktree-aware dashboard variables, expanded operations panels, tests, and documentation.
- `9d9990fbb` `feat(observability): add local digest and worktree metric labels`
  - Source dev commit: `5088a255b`.
  - Adds the agent-readable local observability digest command, makes known local checkout paths override stale
    inherited worktree-role env, and stamps server metrics with Prometheus-safe worktree identity labels.
- `a08b2836e` `test(dev-runner): isolate worktree identity env fixture`
  - Source dev commit: `16376d24a`.
  - Makes the dev-runner worktree identity env test pass an explicit fixture cwd so it does not depend on whether
    the suite is run from main, staging, or a dev worktree.
- `docs(staging): record topic ledger and maintenance rules`
  - Source: this documentation pass.
  - Must stay last when the ledger is rewritten, because it documents the preceding topic hashes.

Source commits intentionally not replayed as new follow-up commits:

- `6a2abeb55` was already represented on `main` as `de50165c7`.
- `28809acf4` resolved to an empty delta because current `main` already includes the provider interrupt and VCS
  status-stall fixes through `012e33bfe` and `787610878`.
- Merge commit `e4c7502c1` was not replayed; its source commit `30a73966a` was folded into the composer topic.

## Local Omarchy Launchers

- Omarchy launcher scripts live outside the repository under `~/.local/bin`, and desktop entries live under
  `~/.local/share/applications`. Keep them local; do not add them to the repo, because upstream pulls and hard
  resets must never overwrite machine-specific launcher wiring.
- `T3 Code Original` uses `~/.local/bin/t3code-dev-original` and
  `~/.local/share/applications/t3code-dev-original.desktop`. It launches `.worktrees/original` on web port `5733`,
  server port `13773`, and desktop debugging port `9230`. Its app data lives in
  `~/.local/share/t3code-dev/original`, and its config lives in `~/.config/t3code-dev/original`.
- `T3 Code Main` uses `~/.local/bin/t3code-dev-main` and
  `~/.local/share/applications/t3code-dev-main.desktop`. It launches `/home/jgigg/code/t3code` on web port `5753`,
  server port `13793`, and desktop debugging port `9231`. Its app data lives in
  `~/.local/share/t3code-dev/main`, and its config lives in `~/.config/t3code-dev/main`.
- `T3 Code Staging` uses `~/.local/bin/t3code-dev-staging` and
  `~/.local/share/applications/t3code-dev-staging.desktop`. It launches `.worktrees/staging` on web port `5793`,
  server port `13833`, and desktop debugging port `9232`. Its app data lives in
  `~/.local/share/t3code-dev/staging`, and its config lives in `~/.config/t3code-dev/staging`.
- `~/.local/bin/t3code-tailscale-reconcile` is the shared support script installed by
  `pnpm run omarchy:install-dev-launchers -- --write`. It keeps Tailscale Serve routes current and repairs the
  same-host route for the machine's 100.x tailnet IP on the primary interface. If Brave/Chromium times out on the
  public URL, inspect `apps/desktop/test-results/staging-public/*/network-preflight.json`, `ss -tnp`, and
  `ip route get <tailnet-ip> oif <primary-interface>` before claiming staging is healthy.
- The `original` sync automation may reset files inside `.worktrees/original`, but it must never delete or reset
  `~/.local/share/t3code-dev/original` or `~/.config/t3code-dev/original`.

## Project Snapshot

T3 Code is a minimal web GUI for using coding agents like Codex and Claude.

This repository is a VERY EARLY WIP. Proposing sweeping changes that improve long-term maintainability is encouraged.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Package Roles

- `apps/server`: Node.js WebSocket server. Wraps Codex app-server (JSON-RPC over stdio), serves the React web app, and manages provider sessions.
- `apps/web`: React/Vite UI. Owns session UX, conversation/event rendering, and client-side state. Connects to the server via WebSocket.
- `packages/contracts`: Shared effect/Schema schemas and TypeScript contracts for provider events, WebSocket protocol, and model/session types. Keep this package schema-only — no runtime logic.
- `packages/shared`: Shared runtime utilities consumed by both server and client applications. Uses explicit subpath exports (e.g. `@t3tools/shared/git`) — no barrel index.
- `packages/client-runtime`: Shared runtime package for sharing client code across web and mobile.

## Reference Repos

- Open-source Codex repo: https://github.com/openai/codex
- Codex-Monitor (Tauri, feature-complete, strong reference implementation): https://github.com/Dimillian/CodexMonitor

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.

## Vendored Repositories

This project vendors external repositories under `.repos/` as read-only reference material for coding
agents.

- Prefer examples and patterns from the vendored source code over generated guesses or web search results.
- Do not edit files under `.repos/` unless explicitly asked.
- Do not import from `.repos/`; application code must continue importing from normal package dependencies.
- Manage vendored subtrees with `bun run sync:repos`; use `bun run sync:repos --repo <id>` to sync one
  configured repository.
- When updating a dependency with a configured vendored subtree, sync that subtree in the same change so
  `.repos/` matches the installed dependency version.
- When writing Effect code, read `.repos/effect-smol/LLMS.md` first and inspect `.repos/effect-smol/` for
  examples of idiomatic usage, tests, module structure, and API design.
- When writing relay infrastructure code with Alchemy, inspect `.repos/alchemy-effect/` for examples of
  idiomatic usage, tests, module structure, and API design.
