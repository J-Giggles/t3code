# T3 Code Local Topic Replay

This context defines the language used to maintain local replay topics across upstream refreshes.

## Language

**Replay Checklist Item**:
A checked Markdown task item in a local topic README that names a behavior, verification point, or explicit non-applicability that must be re-confirmed after an upstream replay.
_Avoid_: checkbox, checklist bullet, feature bullet

**Topic Replay Audit**:
A run-specific audit artifact that records what was inspected, replayed, repaired, verified, and signed off before a rebuilt local topic stack is promoted.
_Avoid_: replay notes, checklist copy, promotion log
**Conflict Brief**:
A human-readable explanation of a replay conflict that starts from the feature or topic intent, names the upstream and local intents that collide, presents resolution options, and gives a recommended path before any repair is applied.
_Avoid_: conflict packet, merge notes, hunk summary

**Decision Card**:
A Telegram-native approval surface for a replay conflict. It summarizes the recommended resolution and presents copyable follow-up actions, but does not itself repair files until the operator explicitly approves a repair.
_Avoid_: poll, vote, button menu

**Topic Stack Checklist**:
A Telegram-native progress view of the local topic stack for a nightly replay run. It marks each topic as replayed, conflicted, skipped, pending, or not run so the operator can scan the stack without opening run artifacts.
_Avoid_: topic list, feature dump, replay summary

**Replay Contract**:
The machine-readable `replayContract` section in a local topic `plugin.json`. It tells the nightly agent the topic intent, invariants to preserve, safe auto-repair cases, stop-for-human cases, risk, autonomy level, and proof commands.
_Avoid_: README prose, feature notes, prompt hint

**Autonomous Replay Repair**:
A guarded nightly-agent repair attempt that edits only the Nightly Lane to resolve a non-fundamental topic replay conflict, continues the current cherry-pick when safe, and then reruns the replay from scratch so `git rerere` or Exact Repair Memory proves the decision.
_Avoid_: auto-merge, blind resolve, direct promotion

**Fundamental Feature Conflict**:
A replay conflict where the local topic goal no longer clearly works on top of upstream without a product, architecture, security, or operator-workflow decision from Jordan.
_Avoid_: merge conflict, file conflict, TypeScript error

**Exact Repair Memory**:
A machine-local replay recipe for a previously approved autonomous conflict resolution that `git rerere` cannot represent. It is keyed by the replay commit and the complete unmerged-index fingerprint, snapshots only declared repair paths, and is reusable only when the Git stage blobs match exactly. If rerere resolves part of the same conflict on the clean replay, an exact residual subset may restore only its remaining conflicted paths.
_Avoid_: broad conflict preference, unconditional ours/theirs rule, rerere cache

**Durable Lane**:
A long-lived local branch and worktree role in the T3 Code fork. The durable lanes are `original`, `nightly`, `staging`, and `main`; temporary topic, replay, and investigation branches are not durable lanes.
_Avoid_: permanent branch, protected worktree, environment

**Original Lane**:
The resettable mirror of the upstream ping.gg T3 Code repository. It tracks `upstream/main` and does not contain Jordan-local topic commits.
_Avoid_: upstream branch, clean copy

**Nightly Lane**:
The rebuilt candidate produced by replaying Jordan-local topic commits on top of the Original Lane. It is the place to inspect fresh upstream compatibility before promoting anything to Staging.
_Avoid_: nightly-local, dev/nightly-topic-stack branch

**Staging Lane**:
The verified integration lane for Jordan-local updates. It receives tested topic commits from dev worktrees or the Nightly Lane and is the final proving ground before Main.
_Avoid_: test branch, QA copy

**Main Lane**:
The day-to-day T3 Code lane used by the operator. It is updated from Staging only after explicit confirmation, backups, green checks, and a controlled restart of the running main app.
_Avoid_: production, root checkout
