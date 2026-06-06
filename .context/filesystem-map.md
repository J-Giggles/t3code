# Filesystem Map: t3code-local

```text
t3code-local/
├── .agents/
│   ├── plans/
│   └── scripts/
│       ├── refresh-project-context.sh
│       ├── t3-hypr-launch-context.sh
│       ├── t3-hypr-place-windows.sh
│       ├── t3-launch-restart-test.sh
│       ├── t3-launch.sh
│       ├── t3-staging-convex-migrate.sh
│       ├── t3-start.sh
│       ├── t3-tailscale-remote-probe.sh
│       ├── t3-tailscale-staging-env.sh
│       └── t3-verify.sh
├── .context/
│   ├── diagrams/
│   ├── docs.md
│   ├── filesystem-map.md
│   ├── functions-and-flows.md
│   ├── index.md
│   ├── inputs-and-state-t3code-staging.md
│   ├── inputs-and-state-t3code.md
│   └── refresh.log
├── .cursor/
│   ├── hooks/
│   │   └── session-start.sh
│   ├── rules/
│   │   ├── agent-memory-protocol.mdc
│   │   ├── staging-implement-test-promote.mdc
│   │   ├── t3code-local-project-context.mdc
│   │   └── t3code-local-workspace.mdc
│   └── hooks.json
├── .fallow/
│   ├── .gitignore
│   └── cache.bin
├── .vscode/
│   ├── extensions.json
│   └── settings.json
├── docs/
│   └── superpowers/
│       └── plans/
├── local-dev-bundle/
│   ├── .runtime/
│   │   ├── convex.env.json
│   │   ├── main.env.json
│   │   └── staging.env.json
│   ├── convex/
│   │   └── package.json
│   ├── main-desktop/
│   │   └── package.json
│   ├── main-stack/
│   ├── main-t3-build/
│   │   └── package.json
│   ├── main-web/
│   │   └── package.json
│   ├── staging-desktop/
│   │   └── package.json
│   ├── staging-stack/
│   ├── staging-t3-build/
│   │   └── package.json
│   ├── staging-web/
│   │   └── package.json
│   ├── .gitignore
│   └── load-stack-env.mjs
├── t3code/
│   ├── .agents/
│   │   ├── plans/
│   │   └── rules/
│   ├── .cursor/
│   │   ├── rules/
│   │   └── .gitignore
│   ├── .devcontainer/
│   │   └── devcontainer.json
│   ├── .docs/
│   │   ├── architecture.md
│   │   ├── ci.md
│   │   ├── codex-prerequisites.md
│   │   ├── encyclopedia.md
│   │   ├── provider-architecture.md
│   │   ├── quick-start.md
│   │   ├── remote-architecture.md
│   │   ├── runtime-modes.md
│   │   ├── scripts.md
│   │   └── workspace-layout.md
│   ├── .fallow/
│   │   ├── .gitignore
│   │   └── cache.bin
│   ├── .github/
│   │   ├── ISSUE_TEMPLATE/
│   │   ├── workflows/
│   │   ├── pull_request_template.md
│   │   └── VOUCHED.td
│   ├── .plans/
│   │   ├── 01-shared-model-normalization.md
│   │   ├── 02-typed-ipc-boundaries.md
│   │   ├── 03-split-codex-app-server-manager.md
│   │   ├── 04-split-chatview-component.md
│   │   ├── 05-zod-persisted-state-validation.md
│   │   ├── 06-provider-logstream-lifecycle.md
│   │   ├── 07-ci-quality-gates.md
│   │   ├── 08-precommit-format-and-lint.md
│   │   ├── 09-event-state-test-expansion.md
│   │   ├── 10-unify-process-session-abstraction.md
│   │   ├── 11-effect.md
│   │   ├── 12-effect-new.md
│   │   ├── 13-provider-service-integration-tests.md
│   │   ├── 14-server-authoritative-event-sourcing-cleanup.md
│   │   ├── 15-effect-server.md
│   │   ├── 16-pr89-review-remediation-phases.md
│   │   ├── 16c-pr89-remediation-checklist.md
│   │   ├── 17-claude-agent.md
│   │   ├── 17-provider-neutral-runtime-determinism.md
│   │   ├── 18-server-auth-model.md
│   │   ├── 19-remote-endpoints-hosted-static.md
│   │   ├── 19-version-control-phase-1-vcs-driver-foundation.md
│   │   ├── 20-version-control-phase-2-source-control-provider-foundation.md
│   │   ├── branch-environment-picker-in-chatview-input.md
│   │   ├── effect-atom.md
│   │   ├── git-flows-integration-tests.md
│   │   ├── git-flows-test-plan.md
│   │   ├── git-integration-branch-picker-worktrees.md
│   │   ├── README.md
│   │   ├── spec-1-1-cutover-plan.md
│   │   └── spec-contract-matrix.md
│   ├── .vscode/
│   │   ├── extensions.json
│   │   └── settings.json
│   ├── apps/
│   │   ├── desktop/
│   │   ├── marketing/
│   │   ├── mobile/
│   │   ├── server/
│   │   └── web/
│   ├── assets/
│   │   ├── dev/
│   │   ├── nightly/
│   │   └── prod/
│   ├── docs/
│   │   ├── providers/
│   │   ├── superpowers/
│   │   ├── effect-fn-checklist.md
│   │   ├── observability.md
│   │   ├── release.md
│   │   ├── source-control-providers.md
│   │   └── t3code-local.md
│   ├── oxlint-plugin-t3code/
│   │   ├── .fallow/
│   │   ├── rules/
│   │   ├── test/
│   │   ├── index.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.tsbuildinfo
│   │   └── utils.ts
│   ├── packages/
│   │   ├── client-runtime/
│   │   ├── contracts/
│   │   ├── convex/
│   │   ├── effect-acp/
│   │   ├── effect-codex-app-server/
│   │   ├── shared/
│   │   ├── ssh/
│   │   └── tailscale/
│   ├── patches/
│   │   ├── @pierre%2Fdiffs@1.1.20.patch
│   │   ├── effect@4.0.0-beta.73.patch
│   │   └── react-native-nitro-modules@0.35.4.patch
│   ├── scripts/
│   │   ├── .fallow/
│   │   ├── lib/
│   │   ├── apply-web-brand-assets.ts
│   │   ├── build-desktop-artifact.test.ts
│   │   ├── build-desktop-artifact.ts
│   │   ├── chat-store-locations.ts
│   │   ├── dev-runner.test.ts
│   │   ├── dev-runner.ts
│   │   ├── free-local-desktop-ports.ts
│   │   ├── install-local-desktop-launchers.ts
│   │   ├── local-desktop-dev-bundle-env.test.ts
│   │   ├── local-desktop-dev-bundle-env.ts
│   │   ├── local-desktop-dev-bundle-lock.test.ts
│   │   ├── local-desktop-dev-bundle-lock.ts
│   │   ├── local-desktop-dev-bundle-run.ts
│   │   ├── local-desktop-env.test.ts
│   │   ├── local-desktop-env.ts
│   │   ├── local-desktop-launcher-access.test.ts
│   │   ├── local-desktop-launcher-access.ts
│   │   ├── local-desktop-launcher-deps.test.ts
│   │   ├── local-desktop-launcher-deps.ts
│   │   ├── local-desktop-launcher-human-log.test.ts
│   │   ├── local-desktop-launcher-human-log.ts
│   │   ├── local-desktop-launcher-line-format.test.ts
│   │   ├── local-desktop-launcher-line-format.ts
│   │   ├── local-desktop-launcher-output.ts
│   │   ├── local-desktop-launcher-run.test.ts
│   │   ├── local-desktop-launcher-run.ts
│   │   ├── local-desktop-launcher-sections.ts
│   │   ├── local-desktop-launchers.test.ts
│   │   ├── local-desktop-launchers.ts
│   │   ├── local-desktop-promotion-apply.ts
│   │   ├── local-desktop-promotion-status.test.ts
│   │   ├── local-desktop-promotion-status.ts
│   │   ├── local-dev-bundle-turbo.test.ts
│   │   ├── local-dev-bundle-turbo.ts
│   │   ├── merge-update-manifests.test.ts
│   │   ├── merge-update-manifests.ts
│   │   ├── mobile-native-static-check.ts
│   │   ├── mock-update-server.test.ts
│   │   ├── mock-update-server.ts
│   │   ├── notify-discord-release.test.ts
│   │   ├── notify-discord-release.ts
│   │   ├── package.json
│   │   ├── parse-dotenv.test.ts
│   │   ├── parse-dotenv.ts
│   │   ├── release-smoke.ts
│   │   ├── repair-convex-pending-turns-from-history.test.ts
│   │   ├── repair-convex-pending-turns-from-history.ts
│   │   ├── resolve-nightly-release.test.ts
│   │   ├── resolve-nightly-release.ts
│   │   ├── resolve-previous-release-tag.ts
│   │   ├── sqlite-to-convex-migrate.test.ts
│   │   ├── sqlite-to-convex-migrate.ts
│   │   ├── sync-vscode-icons.mjs
│   │   ├── tsconfig.json
│   │   ├── tsconfig.tsbuildinfo
│   │   ├── update-release-package-versions.test.ts
│   │   └── update-release-package-versions.ts
│   ├── .gitattributes
│   ├── .gitignore
│   ├── .mise.toml
│   ├── .oxfmtrc.json
│   ├── .oxlintrc.json
│   ├── AGENTS.md
│   ├── bun.lock
│   ├── CLAUDE.md
│   ├── CONTRIBUTING.md
│   ├── KEYBINDINGS.md
│   ├── LICENSE
│   ├── package.json
│   ├── README.md
│   ├── REMOTE.md
│   ├── TODO.md
│   ├── tsconfig.base.json
│   ├── turbo.json
│   └── vitest.config.ts
├── t3code-staging/
│   ├── .agents/
│   │   ├── plans/
│   │   └── rules/
│   ├── .cursor/
│   │   ├── rules/
│   │   └── .gitignore
│   ├── .devcontainer/
│   │   └── devcontainer.json
│   ├── .docs/
│   │   ├── architecture.md
│   │   ├── ci.md
│   │   ├── codex-prerequisites.md
│   │   ├── encyclopedia.md
│   │   ├── provider-architecture.md
│   │   ├── quick-start.md
│   │   ├── remote-architecture.md
│   │   ├── runtime-modes.md
│   │   ├── scripts.md
│   │   └── workspace-layout.md
│   ├── .fallow/
│   │   ├── .gitignore
│   │   └── cache.bin
│   ├── .github/
│   │   ├── ISSUE_TEMPLATE/
│   │   ├── workflows/
│   │   ├── pull_request_template.md
│   │   └── VOUCHED.td
│   ├── .plans/
│   │   ├── 01-shared-model-normalization.md
│   │   ├── 02-typed-ipc-boundaries.md
│   │   ├── 03-split-codex-app-server-manager.md
│   │   ├── 04-split-chatview-component.md
│   │   ├── 05-zod-persisted-state-validation.md
│   │   ├── 06-provider-logstream-lifecycle.md
│   │   ├── 07-ci-quality-gates.md
│   │   ├── 08-precommit-format-and-lint.md
│   │   ├── 09-event-state-test-expansion.md
│   │   ├── 10-unify-process-session-abstraction.md
│   │   ├── 11-effect.md
│   │   ├── 12-effect-new.md
│   │   ├── 13-provider-service-integration-tests.md
│   │   ├── 14-server-authoritative-event-sourcing-cleanup.md
│   │   ├── 15-effect-server.md
│   │   ├── 16-pr89-review-remediation-phases.md
│   │   ├── 16c-pr89-remediation-checklist.md
│   │   ├── 17-claude-agent.md
│   │   ├── 17-provider-neutral-runtime-determinism.md
│   │   ├── 18-server-auth-model.md
│   │   ├── 19-remote-endpoints-hosted-static.md
│   │   ├── 19-version-control-phase-1-vcs-driver-foundation.md
│   │   ├── 20-version-control-phase-2-source-control-provider-foundation.md
│   │   ├── branch-environment-picker-in-chatview-input.md
│   │   ├── effect-atom.md
│   │   ├── git-flows-integration-tests.md
│   │   ├── git-flows-test-plan.md
│   │   ├── git-integration-branch-picker-worktrees.md
│   │   ├── README.md
│   │   ├── spec-1-1-cutover-plan.md
│   │   └── spec-contract-matrix.md
│   ├── .vscode/
│   │   ├── extensions.json
│   │   └── settings.json
│   ├── apps/
│   │   ├── desktop/
│   │   ├── marketing/
│   │   ├── mobile/
│   │   ├── server/
│   │   └── web/
│   ├── assets/
│   │   ├── dev/
│   │   ├── nightly/
│   │   └── prod/
│   ├── caches/
│   ├── docs/
│   │   ├── providers/
│   │   ├── superpowers/
│   │   ├── effect-fn-checklist.md
│   │   ├── observability.md
│   │   ├── release.md
│   │   ├── source-control-providers.md
│   │   └── t3code-local.md
│   ├── oxlint-plugin-t3code/
│   │   ├── .fallow/
│   │   ├── rules/
│   │   ├── test/
│   │   ├── index.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.tsbuildinfo
│   │   └── utils.ts
│   ├── packages/
│   │   ├── client-runtime/
│   │   ├── contracts/
│   │   ├── convex/
│   │   ├── effect-acp/
│   │   ├── effect-codex-app-server/
│   │   ├── shared/
│   │   ├── ssh/
│   │   └── tailscale/
│   ├── patches/
│   │   ├── @pierre%2Fdiffs@1.1.20.patch
│   │   ├── effect@4.0.0-beta.73.patch
│   │   └── react-native-nitro-modules@0.35.4.patch
│   ├── scripts/
│   │   ├── .fallow/
│   │   ├── hypr/
│   │   ├── lib/
│   │   ├── apply-web-brand-assets.ts
│   │   ├── build-desktop-artifact.test.ts
│   │   ├── build-desktop-artifact.ts
│   │   ├── chat-store-locations.ts
│   │   ├── dev-runner.test.ts
│   │   ├── dev-runner.ts
│   │   ├── free-local-desktop-ports.ts
│   │   ├── install-local-desktop-launchers.ts
│   │   ├── local-desktop-dev-bundle-env.test.ts
│   │   ├── local-desktop-dev-bundle-env.ts
│   │   ├── local-desktop-dev-bundle-lock.test.ts
│   │   ├── local-desktop-dev-bundle-lock.ts
│   │   ├── local-desktop-dev-bundle-run.ts
│   │   ├── local-desktop-env.test.ts
│   │   ├── local-desktop-env.ts
│   │   ├── local-desktop-launcher-access.test.ts
│   │   ├── local-desktop-launcher-access.ts
│   │   ├── local-desktop-launcher-deps.test.ts
│   │   ├── local-desktop-launcher-deps.ts
│   │   ├── local-desktop-launcher-human-log.test.ts
│   │   ├── local-desktop-launcher-human-log.ts
│   │   ├── local-desktop-launcher-line-format.test.ts
│   │   ├── local-desktop-launcher-line-format.ts
│   │   ├── local-desktop-launcher-output.ts
│   │   ├── local-desktop-launcher-run.test.ts
│   │   ├── local-desktop-launcher-run.ts
│   │   ├── local-desktop-launcher-sections.ts
│   │   ├── local-desktop-launchers.test.ts
│   │   ├── local-desktop-launchers.ts
│   │   ├── local-desktop-promotion-apply.ts
│   │   ├── local-desktop-promotion-status.test.ts
│   │   ├── local-desktop-promotion-status.ts
│   │   ├── local-dev-bundle-turbo.test.ts
│   │   ├── local-dev-bundle-turbo.ts
│   │   ├── merge-update-manifests.test.ts
│   │   ├── merge-update-manifests.ts
│   │   ├── mobile-native-static-check.ts
│   │   ├── mock-update-server.test.ts
│   │   ├── mock-update-server.ts
│   │   ├── notify-discord-release.test.ts
│   │   ├── notify-discord-release.ts
│   │   ├── package.json
│   │   ├── parse-dotenv.test.ts
│   │   ├── parse-dotenv.ts
│   │   ├── release-smoke.ts
│   │   ├── repair-convex-pending-turns-from-history.test.ts
│   │   ├── repair-convex-pending-turns-from-history.ts
│   │   ├── resolve-nightly-release.test.ts
│   │   ├── resolve-nightly-release.ts
│   │   ├── resolve-previous-release-tag.ts
│   │   ├── sqlite-to-convex-migrate.test.ts
│   │   ├── sqlite-to-convex-migrate.ts
│   │   ├── sync-vscode-icons.mjs
│   │   ├── tsconfig.json
│   │   ├── tsconfig.tsbuildinfo
│   │   ├── update-release-package-versions.test.ts
│   │   └── update-release-package-versions.ts
│   ├── worktrees/
│   ├── .gitattributes
│   ├── .gitignore
│   ├── .mise.toml
│   ├── .oxfmtrc.json
│   ├── .oxlintrc.json
│   ├── AGENTS.md
│   ├── bun.lock
│   ├── CLAUDE.md
│   ├── CONTRIBUTING.md
│   ├── KEYBINDINGS.md
│   ├── LICENSE
│   ├── package.json
│   ├── README.md
│   ├── REMOTE.md
│   ├── TODO.md
│   ├── tsconfig.base.json
│   ├── turbo.json
│   └── vitest.config.ts
├── t3code-upstream-picks/
│   ├── .agents/
│   │   ├── plans/
│   │   └── rules/
│   ├── .cursor/
│   │   ├── rules/
│   │   └── .gitignore
│   ├── .devcontainer/
│   │   └── devcontainer.json
│   ├── .docs/
│   │   ├── architecture.md
│   │   ├── ci.md
│   │   ├── codex-prerequisites.md
│   │   ├── encyclopedia.md
│   │   ├── provider-architecture.md
│   │   ├── quick-start.md
│   │   ├── remote-architecture.md
│   │   ├── runtime-modes.md
│   │   ├── scripts.md
│   │   └── workspace-layout.md
│   ├── .github/
│   │   ├── ISSUE_TEMPLATE/
│   │   ├── workflows/
│   │   ├── pull_request_template.md
│   │   └── VOUCHED.td
│   ├── .plans/
│   │   ├── 01-shared-model-normalization.md
│   │   ├── 02-typed-ipc-boundaries.md
│   │   ├── 03-split-codex-app-server-manager.md
│   │   ├── 04-split-chatview-component.md
│   │   ├── 05-zod-persisted-state-validation.md
│   │   ├── 06-provider-logstream-lifecycle.md
│   │   ├── 07-ci-quality-gates.md
│   │   ├── 08-precommit-format-and-lint.md
│   │   ├── 09-event-state-test-expansion.md
│   │   ├── 10-unify-process-session-abstraction.md
│   │   ├── 11-effect.md
│   │   ├── 12-effect-new.md
│   │   ├── 13-provider-service-integration-tests.md
│   │   ├── 14-server-authoritative-event-sourcing-cleanup.md
│   │   ├── 15-effect-server.md
│   │   ├── 16-pr89-review-remediation-phases.md
│   │   ├── 16c-pr89-remediation-checklist.md
│   │   ├── 17-claude-agent.md
│   │   ├── 17-provider-neutral-runtime-determinism.md
│   │   ├── 18-server-auth-model.md
│   │   ├── 19-remote-endpoints-hosted-static.md
│   │   ├── 19-version-control-phase-1-vcs-driver-foundation.md
│   │   ├── 20-version-control-phase-2-source-control-provider-foundation.md
│   │   ├── branch-environment-picker-in-chatview-input.md
│   │   ├── effect-atom.md
│   │   ├── git-flows-integration-tests.md
│   │   ├── git-flows-test-plan.md
│   │   ├── git-integration-branch-picker-worktrees.md
│   │   ├── README.md
│   │   ├── spec-1-1-cutover-plan.md
│   │   └── spec-contract-matrix.md
│   ├── .vite-hooks/
│   │   ├── _/
│   │   └── pre-commit
│   ├── .vscode/
│   │   ├── extensions.json
│   │   └── settings.json
│   ├── apps/
│   │   ├── desktop/
│   │   ├── marketing/
│   │   ├── mobile/
│   │   ├── server/
│   │   └── web/
│   ├── assets/
│   │   ├── dev/
│   │   ├── nightly/
│   │   └── prod/
│   ├── docs/
│   │   ├── providers/
│   │   ├── superpowers/
│   │   ├── effect-fn-checklist.md
│   │   ├── observability.md
│   │   ├── release.md
│   │   ├── source-control-providers.md
│   │   └── t3code-local.md
│   ├── oxlint-plugin-t3code/
│   │   ├── rules/
│   │   ├── test/
│   │   ├── index.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.tsbuildinfo
│   │   └── utils.ts
│   ├── packages/
│   │   ├── client-runtime/
│   │   ├── contracts/
│   │   ├── convex/
│   │   ├── effect-acp/
│   │   ├── effect-codex-app-server/
│   │   ├── shared/
│   │   ├── ssh/
│   │   └── tailscale/
│   ├── patches/
│   │   ├── @pierre%2Fdiffs@1.1.20.patch
│   │   ├── effect@4.0.0-beta.73.patch
│   │   └── react-native-nitro-modules@0.35.9.patch
│   ├── scripts/
│   │   ├── lib/
│   │   ├── apply-web-brand-assets.ts
│   │   ├── build-desktop-artifact.test.ts
│   │   ├── build-desktop-artifact.ts
│   │   ├── chat-store-locations.ts
│   │   ├── dev-runner.test.ts
│   │   ├── dev-runner.ts
│   │   ├── free-local-desktop-ports.ts
│   │   ├── install-local-desktop-launchers.ts
│   │   ├── local-desktop-dev-bundle-env.ts
│   │   ├── local-desktop-dev-bundle-lock.test.ts
│   │   ├── local-desktop-dev-bundle-lock.ts
│   │   ├── local-desktop-dev-bundle-run.ts
│   │   ├── local-desktop-env.test.ts
│   │   ├── local-desktop-env.ts
│   │   ├── local-desktop-launcher-access.test.ts
│   │   ├── local-desktop-launcher-access.ts
│   │   ├── local-desktop-launcher-deps.test.ts
│   │   ├── local-desktop-launcher-deps.ts
│   │   ├── local-desktop-launcher-human-log.test.ts
│   │   ├── local-desktop-launcher-human-log.ts
│   │   ├── local-desktop-launcher-line-format.test.ts
│   │   ├── local-desktop-launcher-line-format.ts
│   │   ├── local-desktop-launcher-output.ts
│   │   ├── local-desktop-launcher-run.test.ts
│   │   ├── local-desktop-launcher-run.ts
│   │   ├── local-desktop-launcher-sections.ts
│   │   ├── local-desktop-launchers.test.ts
│   │   ├── local-desktop-launchers.ts
│   │   ├── local-desktop-promotion-apply.ts
│   │   ├── local-desktop-promotion-status.test.ts
│   │   ├── local-desktop-promotion-status.ts
│   │   ├── local-dev-bundle-turbo.test.ts
│   │   ├── local-dev-bundle-turbo.ts
│   │   ├── merge-update-manifests.test.ts
│   │   ├── merge-update-manifests.ts
│   │   ├── mobile-native-static-check.ts
│   │   ├── mock-update-server.test.ts
│   │   ├── mock-update-server.ts
│   │   ├── notify-discord-release.test.ts
│   │   ├── notify-discord-release.ts
│   │   ├── package.json
│   │   ├── parse-dotenv.test.ts
│   │   ├── parse-dotenv.ts
│   │   ├── release-smoke.ts
│   │   ├── repair-convex-pending-turns-from-history.test.ts
│   │   ├── repair-convex-pending-turns-from-history.ts
│   │   ├── resolve-nightly-release.test.ts
│   │   ├── resolve-nightly-release.ts
│   │   ├── resolve-previous-release-tag.ts
│   │   ├── sqlite-to-convex-migrate.test.ts
│   │   ├── sqlite-to-convex-migrate.ts
│   │   ├── sync-vscode-icons.mjs
│   │   ├── tsconfig.json
│   │   ├── tsconfig.tsbuildinfo
│   │   ├── update-release-package-versions.test.ts
│   │   └── update-release-package-versions.ts
│   ├── .gitattributes
│   ├── .gitignore
│   ├── .mise.toml
│   ├── AGENTS.md
│   ├── CLAUDE.md
│   ├── CONTRIBUTING.md
│   ├── KEYBINDINGS.md
│   ├── LICENSE
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── pnpm-workspace.yaml
│   ├── README.md
│   ├── REMOTE.md
│   ├── TODO.md
│   ├── tsconfig.base.json
│   └── vite.config.ts
├── .fallowrc.jsonc
├── AGENTS.md
├── package.json
├── pnpm-lock.yaml
├── t3code-local.code-workspace
└── turbo.json
```
