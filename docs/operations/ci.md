# CI quality gates

- `.github/workflows/ci.yml` runs `vp check`, `vp run typecheck`, `vp run test`, and `vp run test:desktop-e2e:smoke` on pull requests and pushes to `main`.
- The desktop E2E smoke job runs a visible Electron stack under `xvfb-run` on Linux when no display is present. External Tailscale/provider flows skip unless their preflight succeeds; set `T3CODE_E2E_REQUIRE_EXTERNALS=1` to turn those skips into failures.
- CI never mutates Tailscale Serve routes unless `T3CODE_E2E_ALLOW_TAILSCALE_MUTATION=1` is explicitly present in the job environment.
- The desktop E2E launcher loads root `.env` and `.env.local` before Playwright starts. CI jobs should set these values in the job environment rather than committing secrets or mutable external-service opt-ins.
- `.github/workflows/release.yml` builds macOS (`arm64` and `x64`), Linux (`x64`), and Windows (`x64`) desktop artifacts from a single `v*.*.*` tag and publishes one GitHub release.
- The release workflow auto-enables signing only when platform credentials are present. macOS passkey builds additionally require `APPLE_TEAM_ID` and the `MACOS_PROVISIONING_PROFILE` secret; Windows uses Azure Trusted Signing. Without the core signing credentials, it still releases unsigned artifacts.
- See [Release Checklist](./release.md) for the full release/signing setup checklist.
