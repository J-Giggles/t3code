# Topic Replay Checklist And Audit Safeguards

## Purpose

Make local topic replay harder to silently regress by requiring behavior-level README checklists and a run-specific replay audit artifact.

## Current Commits

- `d292cde429bf3364d44d8a95a44f9bc225e882c3` `chore(local-plugins): require replay checklist items`
- `fd66c5832548c35f121dd5f61208350f63d33332` `feat(topic-stack): write replay audit stub`

## Squash / Replay History

This topic was added after the schema v2 local plugin migration so future upstream replays preserve the new checklist and audit safeguards. Keep it after the functional topic stack because it updates every topic README and the replay workflow documentation.

Replay support follow-ups currently listed in the nightly manifest:

- `e68106c12e2e4a8da8d30b0f63f9778fcb937c93` `docs(agents): require replay checklist maintenance`
- `8dd1b0f34f0417de50f61603b4eff59e7d8985f7` `feat(local-topics): add componentized topic entrypoints`
- `6287cddb5cf421dc330b744d43335de2baf5dc02` `chore(local-plugins): migrate topic metadata to schema v2`
- `4ffe4dd25021a879bc8092b2194c8419d20f42b3` `docs(operations): record nightly topic replay handoff`
- `98a44e975023f9e135c31db8307351e0855e6007` `docs(operations): record nightly upstream audit`
- `478733b59104db03d01d46887fd4e346a9b243fa` `docs(agents): document local Omarchy launchers`
- `d4f2ba8898c19719e85036a3106197a91dcb433b` `fix(topic-stack): ignore generated nightly artifacts`
- `2e1bea1ad393d15e7b97594098a34b1ba9fd763a` `fix(topic-stack): ignore desktop verification artifacts`
- `6f662e22a28e0f5455962014713a8fdb77cf3baa` `fix(topic-stack): keep nightly branch artifacts ignored`
- `e7dc04618dc79835f9d3d82c71854605741665d8` `chore(local-plugins): record runtime auth followup`
- `e99f5912a2121892c176f9dce57b35a8ca7af9d2` `chore(local-plugins): record chat layout replay proof`
- `f754e9d208cbc4b8d1db232ca597a3ddaf9f29b9` `fix(topic-stack): refresh pnpm lockfile patch metadata`
- `820348b2b8d662e10f95033dbb67d0bbe8d6c296` `feat(topic-stack): automate nightly upstream repair`
- `27ed804757e681ec4976b3356294b3b2b0d4ed3e` `fix(topic-stack): skip clean rerere no-ops`
- `7f8eb6b54720709d843910161aef1577855a7850` `feat(topic-stack): move nightly control to Linear`

## Added Features

- [x] Replay Checklist Items are defined as project language for local topic replay (`CONTEXT.md`).
- [x] Topic README `Added ...` sections must contain checked Replay Checklist Items (`scripts/lib/local-topic-stack.ts`).
- [x] Non-N/A Replay Checklist Items must include backticked evidence (`scripts/lib/local-topic-stack.ts`, `local-plugins/remote-access/README.md`).
- [x] Evidence that looks like a repo path must exist before validation passes (`scripts/lib/local-topic-stack.ts`).
- [x] Nightly apply writes a run-specific Topic Replay Audit stub (`scripts/lib/nightly-topic-stack.ts`).
- [x] Nightly replay plans include topic prerequisite, primary, and follow-up commits in order (`scripts/lib/local-topic-stack.ts`, `scripts/lib/nightly-topic-stack.ts`).
- [x] Frozen installs stay reproducible after upstream replay lockfile updates (`pnpm-lock.yaml`, `CI=true pnpm install --frozen-lockfile`).
- [x] Every local topic declares a structured Replay Contract with autonomy, risk, intent, preservation rules, safe repairs, human stop conditions, and verification (`local-plugins/topic-replay-safeguards/plugin.json`, `scripts/lib/local-topic-stack.ts`).
- [x] Routine replay conflicts are repaired autonomously inside declared topic paths while fundamental product decisions fail closed for Linear review (`scripts/lib/nightly-upstream-agent.ts`, `docs/operations/nightly-upstream-agent.md`).
- [x] Exact Repair Memory reuses a proven conflict resolution only when the topic commit and canonical conflict-stage entries match exactly, including an exact residual subset left by rerere (`scripts/lib/nightly-repair-memory.ts`).
- [x] Completed stacks reconcile stale dependency pins against current upstream before the frozen install and project gates run (`scripts/lib/nightly-dependency-reconciliation.ts`, `scripts/reconcile-nightly-dependencies.ts`).
- [x] Actionable nightly runs create one Linear issue with official changes, a topic checklist, repairs, proof, recommendations, and promotion readiness (`scripts/lib/linear-nightly-control.ts`, `scripts/lib/linear-nightly-control.test.ts`).
- [x] The project-owned promotion skill advances only an evidence-matched candidate through nightly, staging, main, GitHub, and the Mac checkout (`.codex/skills/premote-nightly/SKILL.md`, `docs/operations/premote-nightly.md`).

## Added UI

- [x] Not applicable: this workflow topic adds operator documentation and CLI artifacts, not product UI.

## Added Server And Runtime Behavior

- [x] Local topic validation rejects missing, unchecked, vague, or stale Replay Checklist Items (`scripts/lib/local-topic-stack.ts`, `scripts/validate-local-topic-plugins.ts`).
- [x] Nightly replay artifacts include topic-audit.md with branch-diff, topic checklist, verification, risk, and sign-off placeholders (`scripts/lib/nightly-topic-stack.ts`).
- [x] The replay audit records one topic-level checklist placeholder per manifest entry (`scripts/lib/nightly-topic-stack.ts`, `docs/operations/jordan-topic-stack.manifest.json`).
- [x] Dry-run output lists every replay support commit, including follow-ups that are not primary plugin `topicCommits` (`scripts/lib/nightly-topic-stack.ts`, `docs/operations/jordan-topic-stack.manifest.json`).
- [x] The package lock records current pnpm patch metadata so a fresh checkout can install before running gates (`pnpm-lock.yaml`, `CI=true pnpm install --frozen-lockfile`).
- [x] A trusted parent process constrains the repair worker to declared topic paths plus files authored by the replay commits, rejects conflict markers, records reusable resolutions, and resumes only the expected cherry-pick (`scripts/lib/nightly-upstream-agent.ts`, `scripts/lib/nightly-topic-repair-scope.ts`, `scripts/lib/nightly-repair-memory.ts`).
- [x] Completed-stack verification enforces dependency reconciliation, frozen installation, repository checks, typechecking, topic metadata validation, and repaired-topic commands (`scripts/lib/nightly-upstream-agent.ts`, `docs/operations/nightly-upstream-agent.md`).
- [x] Linear receives one structured run issue for actionable work and no issue for a clean no-change night; successful candidates and fundamental decisions enter review while repairable failures return to Todo (`scripts/lib/linear-nightly-control.ts`, `scripts/lib/linear-nightly-control.test.ts`).
- [x] Each run writes an agent-readable topic catalog so Codex can answer feature and test questions from the Linear issue and server evidence (`scripts/lib/nightly-upstream-agent.ts`, `docs/operations/nightly-upstream-agent.md`).
- [x] Current workflow metadata is synchronized after topic replay and committed into Nightly without a self-referential manifest hash (`scripts/lib/nightly-topic-stack.ts`, `docs/operations/jordan-topic-stack.manifest.json`).
- [x] Shared synchronous command execution keeps exit handling and audit output consistent across replay CLIs (`scripts/lib/command-runner.ts`, `scripts/reconcile-nightly-dependencies.ts`).
- [x] Rerere-resolved cherry-picks that become clean no-ops are skipped without being mislabeled as conflicts (`scripts/lib/nightly-topic-stack.ts`, `scripts/lib/nightly-topic-stack.test.ts`).

## Added Tests

- [x] Validator tests cover v2 metadata, checklist sections, unchecked items, missing evidence, stale evidence paths, and topic minimums (`scripts/lib/local-topic-stack.test.ts`).
- [x] Nightly replay tests cover audit stub generation and conflict artifact audit output (`scripts/lib/nightly-topic-stack.test.ts`).
- [x] Stack tests cover manifest parsing and replay planning for prerequisite and follow-up commit arrays (`scripts/lib/local-topic-stack.test.ts`, `scripts/lib/nightly-topic-stack.test.ts`).
- [x] Nightly agent tests cover Linear run reporting, strict resume guards, repair classification, path restrictions, completed-stack proof, and applied-topic reporting (`scripts/lib/linear-nightly-control.test.ts`, `scripts/nightly-upstream-agent.test.ts`).
- [x] Dependency reconciliation tests prove current upstream exact pins win while local-only dependencies survive (`scripts/lib/nightly-dependency-reconciliation.test.ts`).
- [x] Nightly stack tests cover artifact-safe worktree checks, missing original-lane creation, and replay contract propagation (`scripts/lib/nightly-topic-stack.test.ts`).
- [x] Nightly stack tests prove manifest control-plane paths are validated, copied after replay, and captured in a generated commit plus run artifact (`scripts/lib/local-topic-stack.test.ts`, `scripts/lib/nightly-topic-stack.test.ts`).

## Component Entrypoints

Componentization status: `complete`.

- `scripts/lib/local-topic-stack.ts` (source, internal)
- `scripts/lib/nightly-topic-stack.ts` (source, internal)
- `scripts/lib/local-topic-stack.test.ts` (test, test)
- `scripts/lib/nightly-topic-stack.test.ts` (test, test)
- `scripts/lib/nightly-dependency-reconciliation.ts` (source, internal)
- `scripts/lib/nightly-dependency-reconciliation.test.ts` (test, test)
- `scripts/lib/nightly-repair-memory.ts` (source, internal)
- `scripts/lib/nightly-worktree-status.ts` (source, internal)
- `scripts/lib/command-runner.ts` (source, internal)
- `scripts/lib/nightly-upstream-agent.ts` (source, internal)
- `scripts/lib/linear-nightly-control.ts` (source, internal)
- `scripts/lib/linear-nightly-control.test.ts` (test, test)
- `scripts/lib/nightly-topic-repair-scope.ts` (source, internal)
- `scripts/nightly-upstream-agent.ts` (source, facade)
- `scripts/nightly-upstream-agent.test.ts` (test, test)
- `scripts/reconcile-nightly-dependencies.ts` (source, facade)

## Integration Points

- `scripts/validate-local-topic-plugins.ts`
- `scripts/rebuild-nightly-topic-stack.ts`
- `scripts/nightly-upstream-agent.ts`
- `scripts/reconcile-nightly-dependencies.ts`
- `local-plugins/README.md`
- `docs/operations/jordan-topic-stack.md`
- `docs/operations/nightly-upstream-replay.md`
- `docs/operations/staging-review-guide.md`
- `AGENTS.md`
- `package.json`
- `apps/desktop/package.json`
- `pnpm-lock.yaml`

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

Replay after the functional topic stack so README checklist conversion sees the current topic folders. If this topic conflicts, keep validator/checklist documentation changes together, keep audit and Linear reporting behavior with the nightly agent, and preserve exact-match repair memory, control-plane sync, and completed-stack verification as fail-closed safeguards. Dependency-floor repairs may update `apps/desktop/package.json` together with `pnpm-lock.yaml` when that is required to keep a newer upstream desktop dependency.

The manifest's primary `commits` array remains matched to `plugin.json` `topicCommits`. Replay prerequisite and follow-up arrays are manifest-only expansion lists that the nightly planner must include in cherry-pick order.

## Verification

- `vp check`
- `vp run typecheck`
- `CI=true pnpm install --frozen-lockfile`
- `pnpm run topic-plugins:check`
- `vp test run scripts/lib/linear-nightly-control.test.ts scripts/nightly-upstream-agent.test.ts scripts/lib/local-topic-stack.test.ts scripts/lib/nightly-topic-stack.test.ts scripts/lib/nightly-dependency-reconciliation.test.ts`

## Known Follow-Up Work

- Keep production Exact Repair Memory machine-local and grow it only from successfully verified live replays (`scripts/lib/nightly-repair-memory.ts`).
