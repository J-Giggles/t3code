# Jordan Topic Stack

This document records the June 25, 2026 Jordan patch stack on top of
`upstream/main`. The stack is maintained as replayable topic commits so future
upstream refreshes can be rebuilt and verified without rewriting protected
`main`, `original`, or `staging` worktrees.

The machine-readable replay order lives in
`docs/operations/jordan-topic-stack.manifest.json`. Each manifest entry points
to a repo-internal plugin folder under `local-plugins/<topic>/` with ownership,
componentization, replay, and verification notes. These folders are not
installable Codex plugins.

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
     paths, same-host Tailscale route reconciliation, port isolation, and manual
     restart policy.
   - Owns dev-runner reserved-route preflight failures and dev-launch
     route-collision prompts when another backend already owns a Tailscale
     route.
3. `feat(runtime): preserve worktree context and controlled recovery`
   - Owns worktree/branch context, session recovery, controlled backend restart
     flows, visible sidebar/browser labels, launcher-provided dev identity
     precedence over generic package-channel labels, reconnect coalescing,
     provider startup recovery, and push lifecycle state.
4. `feat(project-git): add project Git dashboard and VCS reconciliation`
   - Owns workspace Git snapshots, dashboard UI, shared Git helpers, and VCS
     refresh reconciliation.
5. `feat(provider-settings): add usage, reset, and T3 access controls`
   - Owns provider usage state/UI, Codex native reset, T3 access settings, and
     provider interrupt/hang stabilization.
6. `feat(composer): add mentions, slash menus, chat context, and worktree naming`
   - Owns composer `@` mentions, slash menus, chat/terminal context
     attachments, semantic worktree naming, compact chat/sidebar stabilization,
     terminal-drawer composer offsetting, and related mobile composer behavior.
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
13. `fix(remote-access): keep reserved staging routes authoritative`
    - Follow-up for launcher-owned reserved route precedence.
14. `fix(remote-access): serve staging tailnet paths`
    - Follow-up for public staging path-prefixed static/API/WebSocket serving.
15. `fix(runtime): preserve staging identity in sidebar`
    - Follow-up for visible staging identity precedence.
16. `fix(remote-access): canonicalize staging asset prefixes`
    - Follow-up for generated asset prefixes under `/staging/`.
17. `fix(remote-access): harden public staging verification`
    - Follow-up for strict public verifier and same-host Tailscale preflight.
18. `feat(topic-stack): add replay checklist and audit safeguards`
    - Follow-up for machine-enforced Replay Checklist Items, run-specific
      `topic-audit.md` creation, structured Replay Contracts, constrained
      autonomous repair, Exact Repair Memory, completed-stack verification,
      dependency reconciliation, and promotion sign-off documentation.
19. `feat(dev-launch): add nightly Omarchy launcher`
    - Follow-up for the durable nightly launcher, `/nightly/` route, and strict
      nightly public verifier.
20. `feat(main-uptime): guard and supervise durable main`
    - Owns the boot-managed Main service, approved-SHA integrity and health
      guards, incident preservation, exact-candidate promotion lock, strict
      public proof receipt, and rollback-first promotion flow.

## Local Topic Plugins

Local topics must be maintained through `local-plugins/<topic>/` and the
manifest. A plugin folder contains `plugin.json` plus a focused README with the
required headings checked by `pnpm run topic-plugins:check`.

The README `Added Features`, `Added UI`, `Added Server And Runtime Behavior`,
and `Added Tests` sections are replay checklists. Every section must include at
least one checked Replay Checklist Item. Non-N/A items must include backticked
evidence, and evidence that looks like a repo path must exist. Code, mixed, and
test topics must keep enough non-N/A items to prove the topic is documented at
behavior level rather than as vague file-level notes.

For new local work, put topic-owned code in package-local modules and wire it
from the main files with thin imports. Examples:

```text
packages/shared/src/localTopics/remoteAccess/publicPath.ts
apps/server/src/localTopics/remoteAccess/httpRouting.ts
apps/web/src/localTopics/composer/index.ts
```

`plugin.json` uses schema v2. Code, mixed, and test topics must list existing
component entrypoints with `componentization.status = "complete"`. Docs-only
topics use `componentization.status = "not-applicable"`. `pnpm run
topic-plugins:check` is strict by default and rejects v1 or pending metadata.

## Rebuild On Latest Upstream

Use the nightly workflow for routine upstream refreshes:

```bash
pnpm run topic-stack:nightly -- --dry-run
pnpm run topic-stack:nightly -- --apply
```

The detailed workflow lives in `docs/operations/nightly-upstream-replay.md`.
It fetches `upstream`, backs up dirty or divergent `original`, resets
`.worktrees/original` exactly to `upstream/main`, creates or reuses the rolling
`.worktrees/nightly-local` candidate worktree, creates
`dev/nightly-topic-stack-YYYYMMDD`, and cherry-picks manifest topics in order.
Artifacts are written under
`.worktrees/nightly-local/.t3code-nightly-runs/YYYYMMDD-HHMMSS/`.
Each apply run also writes `topic-audit.md` with run metadata, branch-diff
audit placeholders, replay outcomes, one topic checklist placeholder per
manifest topic, verification placeholders, unresolved risk tracking, and a
promotion sign-off section.

The script never promotes to `staging`. Use a separate manual promotion after
the nightly candidate is repaired and verified.

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
pnpm run topic-plugins:check
vp run lint:mobile
vp test
vp run test:desktop-smoke
vp run test:desktop-e2e:smoke
T3CODE_E2E_ALLOW_TAILSCALE_MUTATION=1 node apps/desktop/scripts/run-e2e.mjs headed e2e/specs/pairing-path.spec.ts
```

For the remote-access topic, also verify the live reserved route:

- `https://<machine>.<tailnet>.ts.net/staging/` boots the app in a browser,
  shows the project list, creates a new chat, sends `Hi`, and renders a
  non-empty assistant response. `vp run verify:staging-public` enforces this for
  the live staging route.
- The verifier includes an interface-bound network preflight to the machine's
  Tailscale IPv4 address. A loopback curl, clean-process browser check, or
  screenshot of a non-error document is not sufficient because same-host
  Tailscale routing can fail only in the desktop browser path.
- Generated JavaScript and CSS assets use `/staging/...` exactly once; paths such
  as `/staging/t3code-staging/...` or `/staging/main/...` are regressions.
- Module script responses have JavaScript MIME types, not `text/html` fallback
  responses.
- Public metadata and auth/API requests under `/staging/...` reach the same
  backend handlers as their unprefixed routes, and the WebSocket path connects
  under `/staging/ws`.
- `tailscale serve status --json` maps `/main`, `/staging`, `/original`, and dev
  worktree routes to `http://127.0.0.1:<port>` loopback upstreams only.

Keep public path fixes, WebSocket and asset URL fixes, Tailscale route repair,
the strict staging verifier, and operations documentation in the remote-access
topic when rebuilding on a fresh upstream `main`. If the Omarchy launcher helper
changes, regenerate or verify `~/.local/bin/t3code-tailscale-reconcile` from
`scripts/lib/omarchy-dev-launchers.ts` before running the public verifier.

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
complete the run's `topic-audit.md`, and rerun the checks above. The audit must
confirm `upstream/main...staging`, `main...staging`, and the final rebuilt
branch diff were inspected, every topic checklist was reviewed, and unresolved
risks are either absent or explicitly accepted by the human sign-off. Promote by
fast-forwarding or cherry-picking the proven topic stack into the reserved
staging worktree. Launch and prove that exact staging revision first, publish the
evidence, then stop for a fresh user approval tied to the SHA and Main downtime.
Earlier implementation or staging authority never permits Main. After fresh
approval, update Linux and Mac as one backed-up fast-forward transaction; stop
both Main launchers before moving either checkout and roll both hosts back if
either relaunch or verification fails.

Manual promotion from the nightly candidate:

```bash
cd /home/jgigg/code/t3code/.worktrees/staging
git status --short
git update-ref refs/backup/staging-before-nightly-promote/$(date +%Y%m%d-%H%M%S) staging
git merge --ff-only dev/nightly-topic-stack-YYYYMMDD
vp check
vp run typecheck
vp run verify:staging-public
```

If fast-forward fails, stop and resolve manually. Do not force-update staging
from the nightly script.

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
