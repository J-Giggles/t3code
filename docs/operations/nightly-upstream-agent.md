# Nightly Upstream Agent

The server-owned nightly agent keeps `original` current with ping.gg and rebuilds the local topic stack in `nightly`. It records every run in durable server-local artifacts and never promotes `staging` or `main`.

## Runtime Contract

- Host: `giggabit-server`; the Mac may be off.
- Control checkout: `/home/jgigg/code/t3code`.
- Mutable lanes: `original`, `nightly`, and local remote-tracking refs.
- Immutable lanes: `staging` and `main`.
- Review surface: the latest run report, topic catalog, audit, checks, and proof artifacts.
- No-change behavior: fetch, record locally, and exit without replaying.
- Replay report: `.worktrees/nightly/.t3code-nightly-runs/<run>/nightly-agent-report.md`.
- Pre-replay failure report: `.t3code-nightly-agent-runs/<run>/nightly-agent-report.md`.

Run it with:

```bash
corepack pnpm run nightly:upstream-agent --root /home/jgigg/code/t3code
```

The wrapper fetches `upstream --prune` and runs `pnpm run topic-stack:nightly -- --apply` only when upstream changed, `original` is stale, `nightly` is missing, or `--force` is passed. A materially dirty nightly lane fails closed before reset or replay.

## Run Lifecycle

When work is required, the wrapper writes a run directory containing:

- old and new ping.gg SHAs;
- a readable official-change overview;
- the complete local topic queue as a task list;
- the server and worktree identities;
- the promotion rule and `$premote-nightly` handoff;
- machine-readable status, candidate SHA, and proof paths.

At completion it writes the topic results, autonomous repairs, proof, report paths, and any feature-level conflict brief into the same artifact set.

- `success`: replay passed and is eligible for explicit promotion.
- `failed` with a Conflict Brief: Jordan's product, architecture, security, or operator decision is required.
- `failed` without a fundamental conflict: an agent-actionable replay, test, or infrastructure failure needs repair.
- `skipped`: upstream and durable replay state were already current.

The readable and technical record consists of `nightly-agent-report.json`, `nightly-agent-report.md`, `topic-catalog.md`, `topics.json`, `topic-audit.md`, and proof artifacts. Ask a Codex task to inspect the latest run directory when you want a feature summary or conflict recommendation.

## Configuration

Configure optional runtime behavior in `~/.config/t3code/nightly-upstream-agent.env`:

```text
T3CODE_NIGHTLY_PUBLIC_VERIFY=0
T3CODE_NIGHTLY_AUTO_REPAIR=1
T3CODE_NIGHTLY_MAX_REPAIR_ATTEMPTS=1
T3CODE_NIGHTLY_REPAIR_MODEL=gpt-5.6-sol
```

## Autonomous Repair

Every schema v2 topic has a Replay Contract in `local-plugins/<topic>/plugin.json`:

- `intent` and `preserve` define the feature outcome that must survive;
- `safeAutoRepair` defines unambiguous adaptations the worker may make;
- `stopForHuman` defines decisions the worker must not guess;
- `verification` defines headless proof on the completed stack.

New conflicts are repair candidates unless a contract is `manual-decision`. The bounded Codex worker may change only the nightly worktree and declared topic scope. The parent rejects traversal, undeclared paths, conflict markers, and unrelated formatter changes before staging. It records successful resolutions with `git rerere` and Exact Repair Memory, reruns the full topic stack from the clean upstream base, then independently executes the repaired topics' verification commands.

Dependency reconciliation preserves newer exact versions from upstream, retains local-only dependencies, regenerates compatible lock data, and records `dependency-reconciliation.json`. It never downgrades current upstream merely to reuse an old topic lockfile fragment.

The default is one 30-minute repair attempt per conflict with `gpt-5.6-sol`. A successful routine repair is documented in the run artifacts and needs no interaction. A Fundamental Feature Conflict produces a feature-level brief with options, recommendation, confidence, risks, and required proof. It does not ask Jordan to inspect individual files.

An optional server-local `hermes -z` call may summarize the conflict packet into `conflict-brief.md`. Hermes is an internal summarizer only; no messaging gateway is used. If summarization fails, the original replay result and raw evidence remain intact.

For a custom repair worker, set `T3CODE_NIGHTLY_REPAIR_COMMAND`. It receives:

```text
T3CODE_NIGHTLY_REPAIR_PROMPT_PATH
T3CODE_NIGHTLY_REPAIR_RESULT_PATH
T3CODE_NIGHTLY_REPAIR_FINAL_MESSAGE_PATH
T3CODE_NIGHTLY_REPAIR_RESULT_SCHEMA_PATH
T3CODE_NIGHTLY_REPAIR_NIGHTLY_PATH
T3CODE_NIGHTLY_REPAIR_CONTROL_ROOT
T3CODE_NIGHTLY_REPAIR_ARTIFACT_DIR
```

## Control-Plane Sync

After all manifest commits replay, the builder copies the manifest-declared `controlPlanePaths` from the control checkout into nightly and creates a generated `chore(topic-stack): sync control-plane metadata` commit when they differ. This keeps current skills, topic contracts, manifest metadata, and runbooks in the candidate without making a commit depend recursively on a manifest that contains its own hash.

`control-plane-sync.json` records copied paths and the generated commit. Promotion requires this artifact so an older nightly candidate cannot regress the next nightly workflow.

## Systemd User Timer

`~/.config/systemd/user/t3code-nightly-upstream-agent.service`:

```ini
[Unit]
Description=T3 Code nightly upstream replay agent
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/home/jgigg/code/t3code
Environment=PATH=%h/.local/share/mise/installs/node/24.13.1/bin:%h/.local/bin:%h/.local/share/pnpm:/usr/local/bin:/usr/bin
EnvironmentFile=-%h/.config/t3code/nightly-upstream-agent.env
ExecStart=/home/jgigg/.local/share/mise/installs/node/24.13.1/bin/node /home/jgigg/code/t3code/.worktrees/staging/scripts/nightly-upstream-agent.ts --root /home/jgigg/code/t3code
```

`~/.config/systemd/user/t3code-nightly-upstream-agent.timer`:

```ini
[Unit]
Description=Run T3 Code nightly upstream replay every night

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
RandomizedDelaySec=20m

[Install]
WantedBy=timers.target
```

Enable and inspect it:

```bash
systemctl --user daemon-reload
systemctl --user enable --now t3code-nightly-upstream-agent.timer
systemctl --user list-timers 't3code-nightly-*'
systemctl --user start t3code-nightly-upstream-agent.service
journalctl --user -u t3code-nightly-upstream-agent.service -n 200 --no-pager
```

## Artifacts And Proof

Each actionable run records:

- upstream before/after SHAs and official commit overview;
- local topic feature inventory and per-commit replay result;
- autonomous repair prompt, structured result, scope, and checks;
- dependency and control-plane reconciliation results;
- completed-stack `vp check`, `vp run typecheck`, and topic plugin validation;
- run-specific headed/public proof when enabled;
- a full feature-level conflict brief when human judgment is genuinely required.

`topic-catalog.md` points to each topic README, metadata, commits, verification commands, Replay Contract, and checked evidence. It is the index used to answer questions about what a topic adds and how it is proved.

## Promotion

Nightly never promotes itself. A successful run becomes eligible for an explicit `$premote-nightly` invocation, which verifies the exact artifacts, advances the candidate to staging, proves staging, then advances main and synchronizes the Mac. See `docs/operations/premote-nightly.md`.
