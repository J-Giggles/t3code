# On-the-Go Mode ADR Index

These ADRs record the hard-to-reverse decisions for the accepted [On-the-Go Mode design](../architecture/on-the-go-mode.md).

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
