# Main Uptime

`T3 Code Main` is the always-on production lane on `giggabit-server`. Product work happens in `dev-` worktrees, nightly is rebuilt autonomously, and staging is proved before Main is touched.

## Runtime Contract

- `t3code-main.service` starts Main at user-manager boot and restarts it after any unexpected exit.
- `t3code-main-guard.timer` checks the live branch, HEAD, worktree, index, and Git operation state every five seconds.
- `t3code-main-health.timer` checks the public and loopback Main auth routes every 30 seconds. It honors a two-minute startup grace and requires three consecutive failures before recovery.
- When loopback is healthy but the public route is not, health recovery reconciles Tailscale and preserves the healthy Main process. A restart is reserved for persistent loopback and public failure together.
- `~/.local/state/t3code-main-uptime/approved-head` is the only SHA the guard accepts outside a promotion window.
- Unauthorized dirty, conflicted, or committed changes are preserved under `~/.local/state/t3code-main-uptime/incidents/` before Main is restored and restarted.
- A promotion lock accepts one exact candidate for at most 30 minutes. It does not approve that candidate.
- Approval requires a fresh receipt from `vp run verify:main-public`. The verifier must reach the canonical `/main/` URL through the primary interface, show a project, create a chat, send `Hi`, receive a non-empty assistant response, and save a screenshot.

The target is near-continuous availability. Planned promotion downtime is limited to stopping the old runtime, moving the clean checkout, and starting the candidate. Main stays available while the strict browser proof runs. Slow builds and isolated route failures never justify killing an otherwise healthy runtime.

## Install

Run from a clean verified staging checkout on `giggabit-server`:

```bash
pnpm run main-uptime:install -- --dry-run --repo-root /home/jgigg/code/t3code
pnpm run main-uptime:install -- --write --repo-root /home/jgigg/code/t3code
systemctl --user daemon-reload
systemctl --user enable --now t3code-main.service t3code-main-guard.timer t3code-main-health.timer
```

Stop any older UWSM or terminal-owned Main launcher before enabling the service so only one supervisor owns the ports. Enable lingering once so the user manager starts at boot even when nobody logs in:

```bash
loginctl show-user jgigg -p Linger
sudo loginctl enable-linger jgigg
```

Verify the installed state:

```bash
~/.local/bin/t3code-main-uptime status
systemctl --user is-enabled t3code-main.service t3code-main-guard.timer t3code-main-health.timer
systemctl --user is-active t3code-main.service t3code-main-guard.timer t3code-main-health.timer
vp run verify:main-public
```

The standalone verifier still works outside a promotion. It writes an approval receipt only while a valid promotion lock is active.

## Promotion Gate

Staging must already be at the exact candidate and all staging checks must be green. Create rollback refs and an external bundle before beginning.

```bash
candidate="$(git -C /home/jgigg/code/t3code/.worktrees/staging rev-parse HEAD)"
~/.local/bin/t3code-main-uptime promotion-begin "$candidate" 1800
systemctl --user stop t3code-main.service
git -C /home/jgigg/code/t3code reset --hard "$candidate"
systemctl --user start t3code-main.service
```

Run the strict proof from the candidate staging checkout while pointing its project seed at the live Main checkout:

```bash
cd /home/jgigg/code/t3code/.worktrees/staging
T3CODE_MAIN_ROOT=/home/jgigg/code/t3code \
T3CODE_PUBLIC_VERIFY_PROJECT_ROOT=/home/jgigg/code/t3code \
T3CODE_PUBLIC_VERIFY_PROJECT_TITLE=main \
vp run verify:main-public
```

Approve only after that command passes and its output reports `promotionProof.written: true`:

```bash
~/.local/bin/t3code-main-uptime promotion-approve "$candidate"
```

Only after approval may `origin/main` and the Mac launcher checkout move to the candidate. A stale, missing, wrong-SHA, non-canonical, or pre-lock proof is rejected.

## Rollback

Any failure after `promotion-begin` uses:

```bash
~/.local/bin/t3code-main-uptime promotion-abort
```

Abort preserves the failed candidate state, restores the approved SHA, clears the lock, and restarts Main. If an agent disappears, the lock expires and the five-second guard performs the same recovery.

Inspect recovery evidence with:

```bash
readlink -f ~/.local/state/t3code-main-uptime/latest-incident
~/.local/bin/t3code-main-uptime status
journalctl --user -u t3code-main.service -u t3code-main-guard.service -u t3code-main-health.service
```
