# Topic Replay Checklist And Audit Safeguards

## Purpose

Make local topic replay harder to silently regress by requiring behavior-level README checklists and a run-specific replay audit artifact.

## Current Commits

- `d292cde429bf3364d44d8a95a44f9bc225e882c3` `chore(local-plugins): require replay checklist items`
- `fd66c5832548c35f121dd5f61208350f63d33332` `feat(topic-stack): write replay audit stub`

## Squash / Replay History

This topic was added after the schema v2 local plugin migration so future upstream replays preserve the new checklist and audit safeguards. Keep it after the functional topic stack because it updates every topic README and the replay workflow documentation.

## Added Features

- [x] Replay Checklist Items are defined as project language for local topic replay (`CONTEXT.md`).
- [x] Topic README `Added ...` sections must contain checked Replay Checklist Items (`scripts/lib/local-topic-stack.ts`).
- [x] Non-N/A Replay Checklist Items must include backticked evidence (`scripts/lib/local-topic-stack.ts`, `local-plugins/remote-access/README.md`).
- [x] Evidence that looks like a repo path must exist before validation passes (`scripts/lib/local-topic-stack.ts`).
- [x] Nightly apply writes a run-specific Topic Replay Audit stub (`scripts/lib/nightly-topic-stack.ts`).

## Added UI

- [x] Not applicable: this workflow topic adds operator documentation and CLI artifacts, not product UI.

## Added Server And Runtime Behavior

- [x] Local topic validation rejects missing, unchecked, vague, or stale Replay Checklist Items (`scripts/lib/local-topic-stack.ts`, `scripts/validate-local-topic-plugins.ts`).
- [x] Nightly replay artifacts include topic-audit.md with branch-diff, topic checklist, verification, risk, and sign-off placeholders (`scripts/lib/nightly-topic-stack.ts`).
- [x] The replay audit records one topic-level checklist placeholder per manifest entry (`scripts/lib/nightly-topic-stack.ts`, `docs/operations/jordan-topic-stack.manifest.json`).

## Added Tests

- [x] Validator tests cover v2 metadata, checklist sections, unchecked items, missing evidence, stale evidence paths, and topic minimums (`scripts/lib/local-topic-stack.test.ts`).
- [x] Nightly replay tests cover audit stub generation and conflict artifact audit output (`scripts/lib/nightly-topic-stack.test.ts`).

## Component Entrypoints

Componentization status: `complete`.

- `scripts/lib/local-topic-stack.ts` (source, internal)
- `scripts/lib/nightly-topic-stack.ts` (source, internal)
- `scripts/lib/local-topic-stack.test.ts` (test, test)
- `scripts/lib/nightly-topic-stack.test.ts` (test, test)

## Integration Points

- `scripts/validate-local-topic-plugins.ts`
- `scripts/rebuild-nightly-topic-stack.ts`
- `local-plugins/README.md`
- `docs/operations/jordan-topic-stack.md`
- `docs/operations/nightly-upstream-replay.md`
- `docs/operations/staging-review-guide.md`
- `AGENTS.md`

## Focused Implementation Snippets

`scripts/lib/local-topic-stack.ts`

```ts
export const REQUIRED_REPLAY_CHECKLIST_HEADINGS = [
  "## Added Features",
  "## Added UI",
  "## Added Server And Runtime Behavior",
  "## Added Tests",
] as const;
```

`scripts/lib/nightly-topic-stack.ts`

```ts
NodeFS.writeFileSync(
  NodePath.join(plan.artifactsDir, "topic-audit.md"),
  formatTopicAuditMarkdown(plan, topicRecords, status, message),
);
```

## Replay Notes

Replay after the functional topic stack so README checklist conversion sees the current topic folders. If this topic conflicts, keep validator/checklist documentation changes together and keep audit-stub changes with the nightly replay script.

## Verification

- `vp check`
- `vp run typecheck`
- `pnpm run topic-plugins:check`
- `vp test run scripts/lib/local-topic-stack.test.ts scripts/lib/nightly-topic-stack.test.ts`

## Known Follow-Up Work

- Add a promotion preflight command after one real replay has produced a completed `topic-audit.md`.
