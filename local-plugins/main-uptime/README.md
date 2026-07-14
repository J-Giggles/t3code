# Durable Main Uptime And Promotion Guard

## Purpose

Keep `T3 Code Main` available on `giggabit-server`, automatically restore its approved checkout after unauthorized mutations, and prevent a candidate from reaching GitHub or the Mac until the live public Main workflow is proved.

## Current Commits

- `ac47acfdbb90e106a8ba2310d0036e00c6b995ee` `feat(main-uptime): guard and supervise durable main`
- `69be1da9ad8b4a95fbbe808ceb3ef7ee53d13b1c` `fix(main-uptime): stabilize strict composer proof`
- `d7b0a924a4b81a49cbc4448f960eaba3cc7dc917` `fix(main-uptime): prevent health restart storms`

## Squash / Replay History

This topic follows the nightly launcher and replay safeguards because it consumes the durable lane topology, generated Main launcher, public-route verifier, and promotion skills.

## Added Features

- [x] A project-owned installer renders the Main supervisor, integrity guard, and health units without unexpectedly overwriting machine-local state (`scripts/install-main-uptime.ts`, `scripts/localTopics/mainUptime/index.ts`).
- [x] Main has one explicit approved SHA and a short exact-candidate promotion lock (`scripts/localTopics/mainUptime/templates/t3code-main-uptime.sh`, `$T3CODE_MAIN_UPTIME_STATE_DIR/approved-head`).
- [x] Promotion approval requires a fresh exact-SHA receipt from the strict canonical Main verifier (`apps/desktop/scripts/verify-staging-public.mjs`, `vp run verify:main-public`).
- [x] Nightly and staging promotion skills publish GitHub Main and update the Mac only after live Linux approval (`.codex/skills/premote-nightly/SKILL.md`, `.codex/skills/premote-staging/SKILL.md`).

## Added UI

- [x] Not applicable: this operational topic adds no product UI.

## Added Server And Runtime Behavior

- [x] Main starts with the user manager and restarts after unexpected exits (`scripts/localTopics/mainUptime/templates/t3code-main.service`, `Restart=always`).
- [x] A five-second guard detects dirty files, conflicted indexes, interrupted Git operations, branch drift, and HEAD drift (`scripts/localTopics/mainUptime/templates/t3code-main-guard.timer`, `t3code-main-uptime guard`).
- [x] Guard recovery preserves refs, conflict stages, Git state, changed files, and a verified bundle before restoring the approved SHA (`scripts/localTopics/mainUptime/templates/t3code-main-uptime.sh`, `$T3CODE_MAIN_UPTIME_STATE_DIR/incidents`).
- [x] A 30-second health timer honors startup grace and three-failure hysteresis before restarting a persistently unhealthy local runtime (`scripts/localTopics/mainUptime/templates/t3code-main-health.timer`, `t3code-main-uptime health`).
- [x] Route-only failures reconcile Tailscale while preserving a healthy loopback Main process (`scripts/localTopics/mainUptime/templates/t3code-main-uptime.sh`, `t3code-tailscale-reconcile`).
- [x] Promotion abort and lock expiry restore the prior approved SHA while leaving the remote Main ref untouched (`scripts/localTopics/mainUptime/templates/t3code-main-uptime.sh`, `t3code-main-uptime promotion-abort`).

## Added Tests

- [x] Temp-repository tests prove install rendering, dry-run behavior, Bash validity, and approved-SHA initialization (`scripts/localTopics/mainUptime/index.test.ts`, `vp test run scripts/localTopics/mainUptime/index.test.ts`).
- [x] Recovery tests prove both dirty and committed unauthorized changes are preserved and rolled back (`scripts/localTopics/mainUptime/index.test.ts`, `t3code-main-uptime guard`).
- [x] Promotion tests prove the locked candidate can launch but cannot be approved without a fresh exact-SHA public proof (`scripts/localTopics/mainUptime/index.test.ts`, `t3code-main-uptime promotion-approve`).
- [x] Health tests prove startup grace, consecutive-failure counting, restart hysteresis, and no restart for route-only failure (`scripts/localTopics/mainUptime/index.test.ts`, `T3CODE_MAIN_HEALTH_FAILURE_THRESHOLD`).
- [x] The live acceptance gate proves primary-interface routing, project visibility, chat creation, message send, assistant response, and screenshot evidence (`apps/desktop/scripts/verify-staging-public.mjs`, `vp run verify:main-public`).
- [x] The public verifier fills the Lexical editor deterministically and waits for send readiness after runtime recovery (`apps/desktop/scripts/verify-staging-public.mjs`, `composer.fill`).

## Component Entrypoints

Componentization status: `complete`.

- `scripts/localTopics/mainUptime/index.ts` (source, internal)
- `scripts/localTopics/mainUptime/index.test.ts` (test)

## Integration Points

- `scripts/install-main-uptime.ts`
- `apps/desktop/scripts/verify-staging-public.mjs`
- `apps/desktop/package.json`
- `package.json`
- `.codex/skills/premote-nightly`
- `.codex/skills/premote-staging`
- `docs/operations/main-uptime.md`

## Focused Implementation Snippets

`scripts/localTopics/mainUptime/templates/t3code-main.service`

```ini
ExecStartPre=%h/.local/bin/t3code-main-uptime launch-preflight
ExecStart=%h/.local/bin/t3code-dev-main --attached
Restart=always
```

`scripts/localTopics/mainUptime/templates/t3code-main-uptime.sh`

```bash
[[ -f "$PROOF_FILE" ]] || die "missing strict Main public verification proof"
[[ "$proof_candidate" == "$candidate" ]] || die "Main public proof is for the wrong candidate"
((proof_time >= started && proof_time <= now)) || die "Main public proof is not from this promotion window"
```

## Replay Notes

Replay after the nightly launcher and replay safeguards. Preserve the behavioral contract even when upstream moves scripts or selectors: Main remains supervised, only one approved SHA is accepted, mutations are archived before rollback, and publication waits for the complete canonical public chat proof.

## Verification

- `vp test run scripts/localTopics/mainUptime/index.test.ts scripts/lib/omarchy-dev-launchers.test.ts`
- `node --check apps/desktop/scripts/verify-staging-public.mjs`
- `bash -n scripts/localTopics/mainUptime/templates/t3code-main-uptime.sh`
- `vp run verify:main-public`
- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- None currently.
