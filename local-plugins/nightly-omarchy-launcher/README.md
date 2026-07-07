# Nightly Omarchy Replay Launcher

## Purpose

Make the rebuilt nightly topic stack launchable from Omarchy as `T3 Code Nightly`, served through `/nightly/`, and verifiable through the same browser flow used for public staging.

## Current Commits

- `65e0b8a1220aff21ea52ccc9faea98be74c925d9` `feat(dev-launch): add nightly Omarchy launcher`
- `1e982269a02c88e2f8e625cb5b5791e443476834` `fix(dev-launch): format nightly launcher docs and tests`
- `d3dd6d836dabc6e51ba7b8078eb3369965153705` `fix(dev-launch): silence launcher process scan races`

## Squash / Replay History

This topic was added after the initial June topic-stack population. Keep it as a separate follow-up until the next full replay squash decides whether to fold launcher wiring into `dev-launch` and route ownership into `remote-access`.

## Added Features

- [x] Omarchy can render and install a `nightly` launcher for the rolling replay worktree (`scripts/lib/omarchy-dev-launchers.ts`, `pnpm run omarchy:install-dev-launchers -- --dry-run --target nightly`).
- [x] The nightly launcher accepts rolling dated replay branches (`scripts/lib/omarchy-dev-launchers.ts`, `docs/operations/nightly-upstream-replay.md`).
- [x] Generated launchers support an explicit worktree-scoped kill mode (`scripts/lib/omarchy-dev-launchers.ts`, `~/.local/bin/t3code-dev-nightly --kill`).
- [x] Launcher process scans ignore disappearing `/proc` entries so kill mode stays quiet when processes exit mid-scan (`scripts/lib/omarchy-dev-launchers.ts`, `scripts/lib/omarchy-dev-launchers.test.ts`).
- [x] `/nightly` is a reserved public route owned by the nightly replay branch/worktree (`packages/shared/src/localTopics/remoteAccess/publicPath.ts`, `/nightly`).
- [x] A reusable public verifier target proves the nightly HTTPS route with the project/chat flow (`apps/desktop/scripts/verify-staging-public.mjs`, `vp run verify:nightly-public`).

## Added UI

- [x] Omarchy shows a `T3 Code Nightly` desktop entry for the replay candidate worktree (`scripts/lib/omarchy-dev-launchers.ts`, `docs/operations/omarchy-dev-launchers.md`).
- [x] Browser verification opens the public `/nightly/` route and sends `Hi` from a separate Playwright browser context (`apps/desktop/scripts/verify-staging-public.mjs`, `https://giggabit.tailfb378a.ts.net/nightly/`).

## Added Server And Runtime Behavior

- [x] Nightly uses isolated ports and app state: web `5833`, server `13873`, and CDP `9234` (`scripts/lib/omarchy-dev-launchers.ts`, `AGENTS.md`).
- [x] The shared Tailscale reconcile helper serves `/nightly` when the nightly backend port is open (`scripts/lib/omarchy-dev-launchers.ts`, `/nightly`).
- [x] Dev-runner identity inference treats the rolling nightly replay checkout as `nightly` (`scripts/dev-runner.ts`, `scripts/dev-runner.test.ts`).
- [x] Desktop route ownership rejects `/nightly` from non-nightly worktrees before mutating Tailscale Serve (`apps/desktop/src/backend/DesktopServerExposure.test.ts`, `/nightly`).

## Added Tests

- [x] Launcher rendering, branch pattern, kill mode, dry-run count, and Tailscale reconcile output are covered (`scripts/lib/omarchy-dev-launchers.test.ts`).
- [x] Launcher process scanning covers race-safe `/proc` reads for quiet kill mode (`scripts/lib/omarchy-dev-launchers.test.ts`).
- [x] Shared public-path tests cover `/nightly` prefix detection and reserved route ownership (`packages/shared/src/publicPath.test.ts`).
- [x] Dev runner tests cover allowed nightly ownership and rejection from non-nightly worktrees (`scripts/dev-runner.test.ts`).
- [x] Desktop exposure tests cover allowed `/nightly` Serve setup and rejected non-nightly claims (`apps/desktop/src/backend/DesktopServerExposure.test.ts`).

## Component Entrypoints

Componentization status: `complete`.

- `scripts/localTopics/devLaunch/index.ts` (source, internal)
- `packages/shared/src/localTopics/remoteAccess/reservedRoutes.ts` (source, internal)
- `apps/desktop/src/localTopics/remoteAccess/publicVerifierHardening.ts` (source, internal)

## Integration Points

- `scripts/lib/omarchy-dev-launchers.ts`
- `scripts/dev-runner.ts`
- `packages/shared/src/publicPath.ts`
- `apps/desktop/scripts/verify-staging-public.mjs`
- `package.json`
- `apps/desktop/package.json`
- `docs/operations/omarchy-dev-launchers.md`
- `docs/operations/nightly-upstream-replay.md`
- `AGENTS.md`

## Focused Implementation Snippets

`scripts/lib/omarchy-dev-launchers.ts`

```ts
{
  target: "nightly",
  branch: "dev/nightly-topic-stack-YYYYMMDD",
  branchPattern: "^dev/nightly-topic-stack-[0-9]{8}$",
  worktreeRelativePath: "code/t3code/.worktrees/nightly-local",
  portOffset: "100",
  serverPort: "13873",
  webPort: "5833",
  tailscaleServePath: "/nightly",
}
```

`packages/shared/src/localTopics/remoteAccess/publicPath.ts`

```ts
"/nightly": {
  route: "/nightly",
  expectedBranch: "dev/nightly-topic-stack-YYYYMMDD",
  expectedBranchPattern: /^dev\/nightly-topic-stack-[0-9]{8}$/u,
  expectedWorktreeBasename: "nightly-local",
  expectedDescription: "the nightly replay branch/worktree",
}
```

`apps/desktop/scripts/verify-staging-public.mjs`

```js
const PUBLIC_VERIFY_TARGET = process.env.T3CODE_PUBLIC_VERIFY_TARGET?.trim() || "staging";
const DEFAULT_PUBLIC_URL =
  PUBLIC_VERIFY_TARGET === "nightly"
    ? "https://giggabit.tailfb378a.ts.net/nightly/"
    : "https://giggabit.tailfb378a.ts.net/staging/";
```

## Replay Notes

Replay after the existing topic-stack safeguards so the nightly worktree and local plugin validation infrastructure are available. If this topic is later squashed, preserve the user-facing checklist items for launcher creation, kill mode, `/nightly` route ownership, public HTTPS verification, and Omarchy docs.

## Verification

- `vp test run scripts/lib/omarchy-dev-launchers.test.ts packages/shared/src/publicPath.test.ts scripts/dev-runner.test.ts apps/desktop/src/backend/DesktopServerExposure.test.ts`
- `pnpm run omarchy:install-dev-launchers -- --dry-run --target nightly`
- `vp run verify:nightly-public`
- `vp run test:desktop-e2e:smoke`
- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- None currently.
