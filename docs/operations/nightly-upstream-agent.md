# Nightly Upstream Agent

The nightly upstream agent is the server-owned automation for keeping
`original` current with ping.gg upstream and rebuilding the local topic stack in
`nightly`. It never promotes to `staging` or `main`.

## Runtime Contract

- Host: `giggabit-server`.
- Checkout: `/home/jgigg/code/t3code`.
- Mutable lanes: `original`, `nightly`, and local remote-tracking refs.
- Immutable lanes: the agent must not update `staging` or `main`.
- Notification path: `hermes send` to a dedicated Telegram target.
- Report path: `.worktrees/nightly/.t3code-nightly-runs/<run>/nightly-agent-report.md`
  when replay runs, or `.t3code-nightly-agent-runs/<run>/nightly-agent-report.md`
  when the run skips before replay.

The wrapper command is:

```bash
corepack pnpm run nightly:upstream-agent --root /home/jgigg/code/t3code
```

It fetches `upstream --prune`, compares the old and new `upstream/main`, and
only calls `pnpm run topic-stack:nightly -- --apply` when upstream changed,
`original` is stale, `nightly` is missing, or `--force` is passed. If
`.worktrees/nightly` is dirty, it fails closed before reset or replay.

If replay reaches a new conflict, the wrapper reads the owning topic's
machine-readable Replay Contract from `local-plugins/<topic>/plugin.json`.
Contract-approved conflicts are handed to a bounded Codex repair worker that
may edit only `.worktrees/nightly`. A successful repair completes the current
cherry-pick and reruns the full replay from scratch so `git rerere` or Exact
Repair Memory proves that the new resolution is reproducible. The wrapper asks for human input only when
the topic is marked `manual-decision`, the repair remains incomplete, or the
worker identifies a Fundamental Feature Conflict.

The same gate can resume a conflict left by an interrupted earlier run. Resume
requires an active cherry-pick, the generated conflict packet and Hermes
prompt, a matching non-manual Replay Contract, enabled auto-repair, and
remaining attempt budget. Arbitrary dirty files, missing evidence, and
manual-decision topics still fail closed without reset or cleanup.

When notifications are enabled, the Telegram room receives:

1. `Running nightly upgrade workflow` as soon as the wrapper starts.
2. A compact upstream summary card after `git fetch upstream --prune`, before
   any replay starts. This groups the latest ping.gg commits by area, shows a
   short raw commit preview, states whether replay will run, and previews only
   the first few queued local topics. The full queue appears in the later Topic
   Stack Checklist.
3. When autonomous repair cannot safely complete a new conflict, an automatic Hermes-generated
   `Conflict Brief` in the Telegram room. This is the human-readable overview:
   upstream intent, local topic intent, collision, auto-repair eligibility,
   resolution options, recommendation, confidence, risks, and proof needed. The
   prompt instructs Hermes to recommend auto-repair unless the local topic's
   desired feature or logic fundamentally cannot still work on top of upstream.
4. A `Decision Card` for conflicts. It is not a poll; it uses a one-time
   Telegram keyboard so Jordan can tap auto-repair, show feature options, or
   defer. The keyboard sends the selected text into the existing Hermes gateway
   path, avoiding a second raw Telegram polling process.
5. An `Applied Topics` card listing topics that applied without conflicts, plus
   topics that were auto-resolved by remembered `rerere` decisions.
6. A `Topic Stack Checklist` that marks every local topic as replayed,
   conflicted, skipped, pending, or not run.
7. A final success, skipped, or failure result card with the replay summary,
   conflict status, full report path, and generated topic catalog path. If
   direct Telegram delivery is unavailable, the wrapper falls back to the
   plain-text `telegram-summary.md`.

## Telegram Notification Room

Use the existing Hermes Telegram bot first:

```text
Jordan's Hermes
@jgigg_hermes_bot
```

Create a dedicated private Telegram room named `T3 Code Notifications`, add
`@jgigg_hermes_bot`, then send one seed command or message in the room so the
bot sees the chat id. A private group is acceptable for this automation and is
usually simpler than a broadcast channel because the bot can post without
channel administrator setup.

Current deployed target on `giggabit-server`:

```text
T3CODE_NIGHTLY_HERMES_TARGET=telegram:-5223679793
```

On `giggabit-server`, capture the chat id without printing the bot token:

```bash
python - <<'PY'
from pathlib import Path
import json
import urllib.request

token = None
for line in Path.home().joinpath(".hermes/.env").read_text(errors="replace").splitlines():
    if not line or line.lstrip().startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    if key.strip() == "TELEGRAM_BOT_TOKEN":
        token = value.strip().strip("'\"")
        break
if not token:
    raise SystemExit("TELEGRAM_BOT_TOKEN is not configured")

with urllib.request.urlopen(f"https://api.telegram.org/bot{token}/getUpdates", timeout=15) as response:
    payload = json.load(response)

for update in payload.get("result", []):
    post = update.get("channel_post") or update.get("message") or {}
    chat = post.get("chat") or {}
    if "T3 Code" in str(chat.get("title", "")):
        print(json.dumps({"id": chat.get("id"), "title": chat.get("title")}, indent=2))
PY
```

If the running Hermes gateway consumes the update before `getUpdates` sees it,
read the id from `~/.hermes/logs/gateway.log`; the send line includes
`chat=<id>` or `to <id>`.

Test delivery with the printed id:

```bash
hermes send --to telegram:-5223679793 "[T3 Code Nightly] notification probe"
```

Then configure the agent:

```bash
mkdir -p ~/.config/t3code
$EDITOR ~/.config/t3code/nightly-upstream-agent.env
```

```text
T3CODE_NIGHTLY_HERMES_TARGET=telegram:-5223679793
T3CODE_NIGHTLY_NOTIFY=1
T3CODE_NIGHTLY_PUBLIC_VERIFY=0
T3CODE_NIGHTLY_AUTO_REPAIR=1
T3CODE_NIGHTLY_MAX_REPAIR_ATTEMPTS=1
T3CODE_NIGHTLY_LINEAR_ISSUE=GBT-38
T3CODE_NIGHTLY_REPAIR_MODEL=gpt-5.6-sol
```

Set `T3CODE_NIGHTLY_PUBLIC_VERIFY=1` only after the nightly launcher is already
running reliably; the replay itself already proves `vp check`,
`vp run typecheck`, and `pnpm run topic-plugins:check`.

`T3CODE_NIGHTLY_AUTO_REPAIR` defaults to `1`. The default repair worker is
`codex exec`, running non-interactively from the nightly worktree with a
workspace-write sandbox. The child cannot stage files or write shared Git
metadata. Instead, it returns a validated list of changed paths; the parent
rejects absolute/traversal paths, paths outside the topic's declared metadata or
the files authored by its replay commits, undeclared working-tree changes, and
conflict markers before touching the index. It then stages only the
contract-approved original conflict paths plus that declared list. Before staging, the parent runs the repository
formatter on only the existing approved files and rejects any formatter change outside that list. It then explicitly records the resolution with
`git rerere`, writes an exact conflict-index repair recipe under
`.t3code-nightly-repair-memory/`, and continues the cherry-pick. The wrapper then
may consume an exact subset of that recipe when `rerere` resolves only part of
the same conflict on the clean replay; only the still-conflicted paths are
restored, and any changed stage blob forces fresh analysis. The wrapper then
skips the cherry-pick when that approved resolution makes the topic commit empty. It then
rebuilds every topic from the clean upstream base; only after that replay
finishes does it enforce each repaired topic's headless Replay Contract
verification commands against the completed stack. The child
session is ephemeral, its final response is saved as the repair-result artifact,
reasoning effort is pinned to `high`, and the command has a 30-minute timeout.
For large conflicts, the worker writes the authoritative structured decision
directly to `autonomous-repair-result-attempt-<n>.json` before optional checks;
`autonomous-repair-final-message-attempt-<n>.json` is only a fallback copy of
the CLI final response. This prevents cumulative diff rendering from erasing an
otherwise completed repair decision.
The child loads project instructions and receives the already-bound operations
issue from `T3CODE_NIGHTLY_LINEAR_ISSUE`. Because the scheduled worker is
non-interactive, the parent writes `linear-repair-evidence-attempt-<n>.md` in the
run artifacts instead of opening a Linear MCP approval flow or adding binding
notes to the product tree. The operations issue is reconciled from that evidence
after the run.
Repair memory is machine-local and fail-closed: the recipe is ignored unless
the topic commit and every unmerged Git stage blob match its recorded
fingerprint.
Before frozen installation, the completed stack restores any exact dependency
pin that a historical topic accidentally downgraded below `upstream/main`,
regenerates lock data, and records the result in
`dependency-reconciliation.json`.
`T3CODE_NIGHTLY_MAX_REPAIR_ATTEMPTS` defaults to one attempt per conflict, which
bounds both agent cost and the chance of repeatedly editing the same unresolved
topic.

`T3CODE_NIGHTLY_REPAIR_MODEL` defaults to `gpt-5.6-sol`. Keep the server Codex
CLI current enough to support that model. The repair prompt lists unmerged files
directly and forbids whole-packet or whole-repository diff output so large
conflicts do not consume the worker context before it returns the required
structured decision.

For a different server-local worker, set `T3CODE_NIGHTLY_REPAIR_COMMAND`. The
wrapper executes it with these paths in the environment:

```text
T3CODE_NIGHTLY_REPAIR_PROMPT_PATH
T3CODE_NIGHTLY_REPAIR_RESULT_PATH
T3CODE_NIGHTLY_REPAIR_FINAL_MESSAGE_PATH
T3CODE_NIGHTLY_REPAIR_RESULT_SCHEMA_PATH
T3CODE_NIGHTLY_REPAIR_NIGHTLY_PATH
T3CODE_NIGHTLY_REPAIR_CONTROL_ROOT
T3CODE_NIGHTLY_REPAIR_ARTIFACT_DIR
```

The override must follow the same worktree and git boundaries as the default
worker. Use `--no-auto-repair` for a one-off diagnostic run without changing the
saved server configuration.

## Systemd User Timer

Install these files on `giggabit-server`.

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
ExecStart=/home/jgigg/.local/share/mise/installs/node/24.13.1/bin/node /home/jgigg/code/t3code/scripts/nightly-upstream-agent.ts --root /home/jgigg/code/t3code
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

Enable it:

```bash
systemctl --user daemon-reload
systemctl --user enable --now t3code-nightly-upstream-agent.timer
systemctl --user list-timers 't3code-nightly-*'
```

Run a manual probe:

```bash
systemctl --user start t3code-nightly-upstream-agent.service
journalctl --user -u t3code-nightly-upstream-agent.service -n 200 --no-pager
```

## Report Contents

Every run writes:

- ping.gg upstream before/after SHAs and upstream commit overview,
- local topic feature list from `docs/operations/jordan-topic-stack.manifest.json`
  and `local-plugins/*/README.md`,
- replay status per topic commit,
- proof status, including completed-stack commands, repaired-topic verification
  results, and only `nightly-public` verifier artifacts created after this run
  started,
- conflict files requiring human input,
- conflict decision artifacts when replay stops on a new conflict,
- autonomous repair prompt/result artifacts and repair status when attempted,
- full command results.

Hermes receives a Telegram-safe summary with the full report path.

Every run also writes `topic-catalog.md` beside the report. The catalog is the
agent-readable index for questions in the Telegram room. It points at each
topic's `local-plugins/<topic>/README.md`, `plugin.json`, commits,
verification commands, replay status, and checked replay evidence. Ask Hermes in
the room with prompts such as:

```text
Jordan's Hermes, read /home/jgigg/code/t3code/.worktrees/nightly/.t3code-nightly-runs/<run>/topic-catalog.md and summarize the remote-access topic.
Jordan's Hermes, read /home/jgigg/code/t3code/.worktrees/nightly/.t3code-nightly-runs/<run>/topic-catalog.md and list the tests for provider-settings.
Jordan's Hermes, read /home/jgigg/code/t3code/.worktrees/nightly/.t3code-nightly-runs/<run>/nightly-agent-report.md and tell me whether replay had conflicts.
```

## Conflict Conversations

The replay script enables repo-local `git rerere` and `rerere.autoupdate` before
cherry-picking topics. This gives the nightly lane a memory of previous conflict
decisions. When the same conflict shape appears again, `rerere` can reapply the
recorded resolution; if no unmerged files remain, the script continues the
cherry-pick automatically and records the topic as `auto-resolved`.

For a new conflict, the replay writes the conflict evidence first. When the
owning topic permits autonomous repair, the wrapper additionally writes:

```text
.worktrees/nightly/.t3code-nightly-runs/<run>/autonomous-repair-prompt-attempt-1.md
.worktrees/nightly/.t3code-nightly-runs/<run>/autonomous-repair-result-schema-attempt-1.json
.worktrees/nightly/.t3code-nightly-runs/<run>/autonomous-repair-result-attempt-1.json
.worktrees/nightly/.t3code-nightly-runs/<run>/autonomous-repair-command-attempt-1.log
```

The prompt embeds the topic intent, invariants, safe repair cases,
stop-for-human cases, risk, and verification commands. The worker must return a
schema-validated decision of `repaired`, `fundamental-conflict`, or `incomplete`.
The wrapper accepts `repaired` only when the cherry-pick is complete, the
worktree is clean, and every headless Replay Contract verification command
passes independently. The worker is forbidden from editing or resetting
`original`, `staging`, `main`, or any other worktree.

If the repair does not complete safely, the replay remains paused and the
wrapper writes and sends:

```text
.worktrees/nightly/.t3code-nightly-runs/<run>/conflict-packet.md
.worktrees/nightly/.t3code-nightly-runs/<run>/hermes-conflict-prompt.md
.worktrees/nightly/.t3code-nightly-runs/<run>/conflict-brief.md
.worktrees/nightly/.t3code-nightly-runs/<run>/conflict-brief.telegram.html
.worktrees/nightly/.t3code-nightly-runs/<run>/conflict-decision-card.telegram.html
.worktrees/nightly/.t3code-nightly-runs/<run>/applied-topics.telegram.html
.worktrees/nightly/.t3code-nightly-runs/<run>/topic-stack-checklist.telegram.html
.worktrees/nightly/.t3code-nightly-runs/<run>/conflict-brief.raw.md
```

The wrapper asks Hermes to read the packet and prompt, then posts a
Telegram-ready `Conflict Brief` automatically. The brief is feature-level rather
than file-by-file, always includes a recommendation, and ends with:

```text
Tap an option in the Conflict Decision Card.
```

`telegram-upstream-summary.telegram.html` records the first upstream summary
card. It is sent directly through the Telegram Bot API for Telegram targets,
with copy buttons for follow-up upstream and topic-queue questions. The fallback
plain-text copy is written to `telegram-upstream-summary.md`.

`telegram-summary.telegram.html` records the final result card. It uses the
same direct Telegram path and keeps copy buttons for asking Hermes to summarize
the full report or list failed/conflicted topics.

`conflict-brief.md` is the Telegram-safe copy. If Hermes writes more than fits
comfortably in one message, the wrapper trims the middle of the brief but keeps
the final action prompt. `conflict-brief.telegram.html` records the formatted
Telegram sections that are sent directly through the Telegram Bot API:
overview, conflict shape, and safe resolution.

`conflict-decision-card.telegram.html` records the separate approval card. It
uses a one-time Telegram keyboard rather than native polls. Tapping a keyboard
option sends a real message into the Hermes chat, so the existing Hermes
gateway can receive the selected action without a second bot listener fighting
Telegram polling. The options are auto-repair, show feature options, and defer.

`applied-topics.telegram.html` records the separate card for topics that applied
without conflicts and topics whose full commit group completed after automatic
repair. A topic with a later unresolved commit is excluded from both success
lists. This is the scan-friendly success list; the full checklist remains the
source of truth for skipped, pending, and conflicted topics.

`topic-stack-checklist.telegram.html` records the scan-friendly topic checklist
that the wrapper sends after the Conflict Brief flow. Native Telegram
checklists are not used here because `sendChecklist` requires a Telegram
Business connection; this workflow uses ordinary bot messages so it works in
the current notification room.

`conflict-brief.raw.md` keeps the full Hermes draft for audit or follow-up
questions. If direct Telegram formatting fails, the wrapper falls back to
`hermes send` with the plain `conflict-brief.md` or checklist text fallback.

If the automatic brief generation or Telegram delivery fails, the replay still
stays paused on the original conflict. The report and final notification record
`Hermes Conflict Brief failed` and the exact error, and the run writes
`conflict-brief-error.txt` beside the packet so the operator can retry.

You can also use the prompt directly in the Telegram room:

```text
@jgigg_hermes_bot read /home/jgigg/code/t3code/.worktrees/nightly/.t3code-nightly-runs/<run>/hermes-conflict-prompt.md and propose the safest resolution.
```

The ordinary flow performs that safe loop automatically. A Telegram decision
is needed only after the bounded worker declines or fails to finish: resolve
only in `.worktrees/nightly`, stage the files, run focused tests, continue the
cherry-pick, then rerun the nightly workflow from scratch. The rerun proves that
the recorded `rerere` decision can replay automatically before the remaining
topics continue.

## GLKVM And Desktop Notes

The server monitor is the GLKVM device:

```text
Hyprland monitor: HDMI-A-2
Description: GLI GLKVM 891247
Web UI: https://giggabit-server-glkvm/ or https://100.89.52.52/
```

The GLKVM web UI is a `GLKVM` login page with a single admin-password form. Use
it for display, keyboard, boot, BIOS, and recovery tasks when SSH is
insufficient. Do not use it for normal nightly replay. For agent-friendly
browser access, use the GLKVM Loopback Proxy documented in
`docs/operations/glkvm-agent-access.md`.

For SSH-driven desktop inspection, export the running Hyprland environment:

```bash
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus
export XDG_CURRENT_DESKTOP=Hyprland
export XDG_SESSION_TYPE=wayland
export WAYLAND_DISPLAY=wayland-1
export DISPLAY=:0
export HYPRLAND_INSTANCE_SIGNATURE=$(basename "$XDG_RUNTIME_DIR"/hypr/*)

hyprctl -j monitors
hyprctl -j clients
hyprctl -j activewindow
```

This is enough to identify running windows from SSH. Use GLKVM for visual
confirmation when compositor screenshots are blocked or unreliable.
