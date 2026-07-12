# ADR 0027: Package On-the-Go as a deep replayable topic

## Status

Accepted

## Context

On-the-Go Mode spans contracts, server orchestration and persistence, shared client state, web, Electron, native mobile, models, and audio devices. Implementing each behavior directly in existing upstream callers would spread knowledge across the fork and make every future upstream replay expensive.

T3 Code already maintains repo-local schema-v2 topic plugins with owned paths, component entrypoints, replay contracts, verification evidence, and thin integration points. These are replay metadata for coherent topic commits, not installable Codex plugins.

## Decision

Implement On-the-Go Mode as one `on-the-go` local topic developed through reviewable slices and squashed into one coherent replay commit with its tests, docs, schema-v2 `local-plugins/on-the-go/plugin.json`, README replay checklist, manifest entry, and staging review evidence.

The topic uses these package-local Modules:

- Schema-only commands, events, snapshots, settings, and errors under the contracts package's `localTopics/onTheGo` entrypoint.
- A deep server `localTopics/onTheGo` Module that owns voice state machines, Turn Scheduler, queues, Follow Mode, persistence, policy, reconciliation, and orchestration.
- A client-runtime `localTopics/onTheGo` Module exposing one controller Interface that consumes commands and observable snapshots/events without reimplementing server rules.
- Topic-owned web, mobile, and desktop `localTopics/onTheGo` Modules for the Voice Dock, settings, platform activation, audio routing, and device integration.

Existing upstream files contain only thin registration, mounting, or package-export wiring at documented On-the-Go Integration Seams. Provider, transcription, speech, device, persistence, and external-context variation use internal ports with production and deterministic-fake Adapters. Tests exercise observable behavior through the same external Interface used by callers.

Follow Mode consumes only schema-defined Agent Checkpoints from provider Adapters, never provider-specific raw events. This checkpoint Interface is part of the stable topic seam and is exercised by deterministic fake Adapters; provider mappings remain internal and replaceable during replay.

The topic has no hard dependency on provider-settings, prompt-settings, composer, app-automation, or any other Jordan replay topic. Its required seams target upstream T3 Code capabilities. When another local topic is present, On-the-Go may discover a topic-owned optional Adapter; when absent, the integration degrades visibly without preventing core activation, verification, or replay.

The topic metadata owns every source, test, documentation, integration, and export path it changes and declares replay intent, safe automatic repairs, human-stop conditions, and verification commands. Native mobile behavior and headed Electron coverage ship in the same topic commit rather than later unrelated commits.

Replay automation may repair mechanical file moves or equivalent Interface changes only when topic contract tests prove unchanged behavior. A semantic change to required provider events, chat lifecycle, settings, app mounting, or another Integration Seam fails closed and reports the exact seam and violated contract. Replay must not spread compatibility workarounds through upstream callers to force a green cherry-pick.

## Consequences

Most future upstream changes are absorbed by a few thin seams or internal adapters, preserving Locality and making the feature easier to replay. The stable Interface provides Leverage across voice, visual, mobile, desktop, automation, and deterministic tests.

The topic can be applied independently to a refreshed upstream checkout instead of requiring the rest of Jordan's stack to be replayed first.

The initial topic commit will be large because it is a vertical product slice across platforms. Internal development must therefore remain sliced and continuously tested before the final squash, and topic ownership metadata must stay exact.

## Rejected Alternatives

- Spread behavior through existing upstream components and provider adapters: maximizes replay conflicts and duplicates policy.
- Create a separate installable Codex plugin: does not match T3 Code's runtime or repo-local topic mechanism.
- Split platform behavior into unrelated replay topics: permits contract and safety drift and violates the requirement that the feature replay as one coherent unit.
- Expose every internal adapter through the public Interface: creates a shallow Module and makes callers learn implementation details.
