# Jordan Topic Stack

This document records the June 25, 2026 Jordan patch stack on top of
`upstream/main`. The stack is maintained as replayable topic commits so future
upstream refreshes can be rebuilt and verified without rewriting protected
`main`, `original`, or `staging` worktrees.

## Topic Order

1. `feat(remote-access): manage Tailscale and routed browser access`
   - Owns public path normalization, advertised endpoints, Tailscale Serve
     management, canonical worktree routes, loopback-only Serve upstreams,
     backend public-path handling for static/API/WebSocket routes, Settings URL
     controls, route relaunch behavior, hosted pairing path preservation, and
     strict public staging verification.
   - Owns user-managed single-segment Tailscale Serve route validation,
     availability probing, conflict reporting, and reserved `/main`,
     `/original`, and `/staging` ownership checks against actual git identity.
2. `feat(dev-launch): add durable worktree launch profiles`
   - Owns `.t3code/dev-apps.json`, dev launcher contracts/runtime, desktop and
     server launch managers, Omarchy launchers, launcher-owned Tailscale Serve
     paths, port isolation, and manual restart policy.
   - Owns dev-runner reserved-route preflight failures and dev-launch
     route-collision prompts when another backend already owns a Tailscale
     route.
3. `feat(runtime): preserve worktree context and controlled recovery`
   - Owns worktree/branch context, session recovery, controlled backend restart
     flows, visible sidebar/browser labels, reconnect coalescing, provider
     startup recovery, and push lifecycle state.
4. `feat(project-git): add project Git dashboard and VCS reconciliation`
   - Owns workspace Git snapshots, dashboard UI, shared Git helpers, and VCS
     refresh reconciliation.
5. `feat(provider-settings): add usage, reset, and T3 access controls`
   - Owns provider usage state/UI, Codex native reset, T3 access settings, and
     provider interrupt/hang stabilization.
6. `feat(composer): add mentions, slash menus, chat context, and worktree naming`
   - Owns composer `@` mentions, slash menus, chat/terminal context
     attachments, semantic worktree naming, compact chat/sidebar stabilization,
     and related mobile composer behavior.
7. `feat(prompt-settings): add configurable prompt settings`
   - Owns prompt settings schemas, defaults, persistence, settings UI, and
     provider prompt wiring.
8. `feat(app-automation): add desktop shell MCP controls`
   - Owns desktop shell automation, `app_*` MCP tools, app/preview broker
     separation, and headed-staging automation docs.
9. `feat(project-agent-files): add schemas, CRUD, and scaffold safety`
   - Owns agent-file schemas/contracts, project-scoped CRUD, harness resolver,
     scaffold safety, secret-key handling, and Agent Files UI/docs.
10. `feat(observability): add local hub, Grafana provisioning, and digest metrics`
    - Owns the local OTel/LGTM hub, Grafana provisioning, digest command,
      worktree metric labels, OTLP logging/tracing config, and desktop output
      pipe hardening.
11. `test(desktop): add headed desktop verification coverage`
    - Owns headed Electron smoke infrastructure, Playwright fixtures/specs, CI
      e2e smoke wiring, and test-runner package metadata.
12. `docs(operations): document Jordan patch-stack maintenance workflow`
    - Owns this ledger, staging review workflow, promotion rules, repo hygiene,
      and future rebuild instructions.

## Rebuild On Latest Upstream

Use a dev worktree. Do not perform this workflow in the root `main`, reserved
`original`, or reserved `staging` worktree.

```bash
git fetch upstream --prune
git switch -c dev/jordan-topic-stack-YYYYMMDD upstream/main
git cherry-pick <remote-access-topic>
git cherry-pick <dev-launch-topic>
git cherry-pick <runtime-topic>
git cherry-pick <project-git-topic>
git cherry-pick <provider-settings-topic>
git cherry-pick <composer-topic>
git cherry-pick <prompt-settings-topic>
git cherry-pick <app-automation-topic>
git cherry-pick <project-agent-files-topic>
git cherry-pick <observability-topic>
git cherry-pick <desktop-tests-topic>
git cherry-pick <docs-topic>
```

Resolve conflicts in the topic that owns the subsystem. Avoid carrying a
conflict fix into a later topic unless the later topic is the owner.

The June 26 follow-up topic
`fix(remote-access): harden public staging verification` crosses remote access
and dev-launcher ownership. On a rebuild, prefer folding the web/server/verifier
changes into the remote-access topic and the Omarchy reconcile helper into the
dev-launch topic. If replaying the current staging history without splitting,
cherry-pick the hardening follow-up only after both of those base topics are
present, then run the live public verifier before promotion.

Route ownership changes follow the same split: keep Tailscale Serve route
availability helpers, desktop IPC/state, Settings UI probing, server startup
no-overwrite checks, and public-route tests in remote-access. Keep dev-runner
reserved-route guards and launch route-conflict UI/prompt handling in
dev-launch.

## Verification

Run the standard source and final-stack checks:

```bash
vp check
vp run typecheck
vp run lint:mobile
vp test
vp run test:desktop-smoke
vp run test:desktop-e2e:smoke
T3CODE_E2E_ALLOW_TAILSCALE_MUTATION=1 node apps/desktop/scripts/run-e2e.mjs headed e2e/specs/pairing-path.spec.ts
```

For the remote-access topic, also verify the live reserved route:

- `https://<machine>.<tailnet>.ts.net/staging/` boots the app, not a blank shell.
- Generated JavaScript and CSS assets use `/staging/...` exactly once; paths such
  as `/staging/t3code-staging/...` are regressions.
- Module script responses have JavaScript MIME types, not `text/html` fallback
  responses.
- `tailscale serve status --json` maps `/main`, `/staging`, `/original`, and dev
  worktree routes to `http://127.0.0.1:<port>` loopback upstreams only.

When rebuilding from an unsquashed source branch, verify no content was lost:

```bash
git diff --exit-code dev/jordan-topic-source-unsquashed-YYYYMMDD dev/jordan-topic-stack-YYYYMMDD
git diff --name-status dev/jordan-topic-source-unsquashed-YYYYMMDD dev/jordan-topic-stack-YYYYMMDD
git merge-base --is-ancestor upstream/main dev/jordan-topic-stack-YYYYMMDD
```

The two diff commands must produce no output.

## Promotion

Promotion to `staging` is a separate explicit step. Before promoting, create a
backup ref for the current `staging` branch, verify the topic stack is clean,
and rerun the checks above. Promote by fast-forwarding or cherry-picking the
proven topic stack into the reserved staging worktree. Do not promote directly
to `main` unless the user explicitly asks for a main promotion and the main
checkout is clean and not actively running.

## Empty Or Redundant Commits

During a future upstream refresh, a cherry-pick may become empty because
upstream already contains the same behavior or a newer local topic already
represents it. When that happens:

- Confirm the final tree still contains the intended behavior.
- Skip the empty cherry-pick with `git cherry-pick --skip`.
- Record the skipped commit and reason in the docs topic and final report.
- Do not invent a no-op commit only to preserve an old hash.

For the June 25 rebuild, staging commit `d423efcf4` was skipped because the
newer `DesktopBackendOutputLog` module already represented the closed
stdout/stderr pipe hardening.
