# T3 Code ADR Index

These ADRs record hard-to-reverse T3 Code product and architecture decisions, including the accepted [On-the-Go Mode design](../architecture/on-the-go-mode.md).

## Extension Distribution

- [0028 — Publish extensions as a catalog plus preset](./0028-publish-extensions-as-a-catalog-plus-preset.md)
- [0029 — Use a stable Extension Host with a minimal bootstrap patch](./0029-use-a-stable-extension-host.md)
- [0030 — Use versioned capability contracts](./0030-use-versioned-capability-contracts.md)
- [0031 — Release each extension as an atomic multi-package bundle](./0031-release-each-extension-as-an-atomic-bundle.md)
- [0032 — Forbid direct imports between extension internals](./0032-forbid-cross-extension-internal-imports.md)
- [0033 — Use a separate public extension monorepo](./0033-use-a-separate-public-extension-monorepo.md)
- [0034 — Install immutable verified extension artifacts](./0034-install-immutable-verified-extension-artifacts.md)
- [0035 — Curate the official catalog and require permission grants](./0035-curate-the-official-catalog-and-require-permission-grants.md)
- [0036 — Preserve extension data across uninstall](./0036-preserve-extension-data-across-uninstall.md)
- [0037 — Certify compatibility against upstream commits](./0037-certify-compatibility-against-upstream-commits.md)
- [0038 — Migrate topics incrementally starting with prompt settings](./0038-migrate-topics-incrementally-starting-with-prompt-settings.md)
- [0039 — Require version-bound extension visuals](./0039-require-version-bound-extension-visuals.md)
- [0040 — Declare per-surface extension activation requirements](./0040-declare-per-surface-extension-activation.md)
- [0041 — Build official artifacts from reviewed source](./0041-build-official-artifacts-from-reviewed-source.md)
- [0042 — License the official extension platform under Apache-2.0](./0042-license-the-official-extension-platform-under-apache-2.md)
- [0043 — Separate the public base stack from the operator overlay](./0043-separate-the-public-base-stack-from-the-operator-overlay.md)
- [0044 — Autonomously promote fully verified extension locks](./0044-autonomously-promote-fully-verified-extension-locks.md)
- [0045 — Roll back and verify failed live promotions](./0045-roll-back-and-verify-failed-live-promotions.md)
- [0046 — Distinguish official, community, and external support](./0046-distinguish-official-community-and-external-support.md)
- [0047 — Gate autonomous promotion by behavior contract](./0047-gate-autonomous-promotion-by-behavior-contract.md)
- [0048 — Classify the initial legacy topic conversions](./0048-classify-the-initial-legacy-topic-conversions.md)
- [0049 — Assemble legacy topics and extensions from one manifest](./0049-assemble-legacy-topics-and-extensions-from-one-manifest.md)
- [0050 — Start with capability families derived from current seams](./0050-start-with-capability-families-derived-from-current-seams.md)
- [0051 — Admit community extensions through independent review](./0051-admit-community-extensions-through-independent-review.md)
- [0052 — Retain the known-good assembly when upstream breaks a capability](./0052-retain-the-known-good-assembly-when-upstream-breaks-a-capability.md)
- [0053 — Centralize provenance in an Extension Manager](./0053-centralize-provenance-in-an-extension-manager.md)
- [0054 — Publish stable and immutable tailnet nightly reviews](./0054-publish-stable-and-immutable-tailnet-nightly-reviews.md)
- [0055 — Keep extension secrets out of portable state](./0055-keep-extension-secrets-out-of-portable-state.md)
- [0056 — Broker extension execution by default](./0056-broker-extension-execution-by-default.md)
- [0057 — Keep published capability versions immutable](./0057-keep-published-capability-versions-immutable.md)
- [0058 — Isolate and circuit-break extension runtime failures](./0058-isolate-and-circuit-break-extension-runtime-failures.md)
- [0059 — Declare criticality for every preset entry](./0059-declare-criticality-for-every-preset-entry.md)
- [0060 — Drain Main before autonomous relaunch](./0060-drain-main-before-autonomous-relaunch.md)
- [0061 — Require every extension in Jordan's presets](./0061-require-every-extension-in-jordans-presets.md)
- [0062 — Include an authoring kit in the first public release](./0062-include-an-authoring-kit-in-the-first-public-release.md)
- [0063 — Split public and private extension lock state](./0063-split-public-and-private-extension-lock-state.md)
- [0064 — Hold verified Staging for an approved two-host Main promotion (proposed)](./0064-hold-verified-staging-for-approved-two-host-main-promotion.md)

## Companion, Context, And Data

- [0001 — Keep Theo read-only](./0001-keep-theo-read-only.md)
- [0012 — Learn preferences through a structured profile](./0012-learn-preferences-through-a-structured-profile.md)
- [0018 — Treat fetched context as untrusted evidence](./0018-treat-fetched-context-as-untrusted-evidence.md)
- [0019 — Enforce source-to-provider context egress](./0019-enforce-source-to-provider-context-egress.md)
- [0020 — Retain only minimal context evidence](./0020-retain-only-minimal-context-evidence.md)
- [0023 — Keep Theo data inside the T3 server boundary](./0023-keep-theo-data-inside-the-t3-server-boundary.md)

## Voice, Models, And Privacy

- [0002 — Use a provider-neutral voice catalog](./0002-use-a-provider-neutral-voice-catalog.md)
- [0003 — Do not retain raw voice input](./0003-do-not-retain-raw-voice-input.md)
- [0004 — Limit background voice to native apps](./0004-limit-background-voice-to-native-apps.md)
- [0006 — Use only pre-approved voice fallbacks](./0006-use-only-pre-approved-voice-fallbacks.md)
- [0007 — Use single-device voice ownership](./0007-use-single-device-voice-ownership.md)
- [0008 — Use device authentication for voice trust](./0008-use-device-authentication-for-voice-trust.md)
- [0009 — Adapt speech to output privacy](./0009-adapt-speech-to-output-privacy.md)
- [0022 — Keep synthesized speech device-local](./0022-keep-synthesized-speech-device-local.md)

## Commands, Safety, And Prompts

- [0005 — Confirm consequential voice actions](./0005-confirm-consequential-voice-actions.md)
- [0010 — Use semantic actions for voice control](./0010-use-semantic-actions-for-voice-control.md)
- [0013 — Reconfirm offline prompt handoffs](./0013-reconfirm-offline-prompt-handoffs.md)
- [0014 — Reconcile voice actions before retry](./0014-reconcile-voice-actions-before-retry.md)
- [0015 — Bind submission to a prepared prompt revision](./0015-bind-send-it-to-a-prepared-prompt-revision.md)
- [0016 — Use bounded context for new-agent handoffs](./0016-use-bounded-context-for-new-agent-handoffs.md)
- [0017 — Isolate new editing agents by default](./0017-isolate-new-editing-agents-by-default.md)
- [0021 — Use a hybrid command resolver](./0021-use-a-hybrid-command-resolver.md)
- [0024 — Isolate dictation from command execution](./0024-isolate-dictation-from-command-execution.md)

## Queues, Follow Mode, And Replay Architecture

- [0011 — Keep voice queues durable](./0011-keep-voice-queues-durable.md)
- [0025 — Make busy-target delivery explicit](./0025-make-busy-target-delivery-explicit.md)
- [0026 — Use checkpointed Follow Summaries](./0026-use-checkpointed-follow-summaries.md)
- [0027 — Package On-the-Go as a deep replayable topic](./0027-package-on-the-go-as-a-deep-replayable-topic.md)
