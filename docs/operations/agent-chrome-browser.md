# Shared Authenticated Chrome For Agents

T3 Code agents on `giggabit-server` use the already-running Google Chrome profile through the official Playwright Extension. This is the canonical browser for websites that depend on existing logins, cookies, tabs, or extensions. T3 Code's collaborative Electron preview remains the explicit fallback for dev previews or when the extension-backed browser is unavailable.

This design does not copy, read, or share Chrome's cookie database with Electron. The extension connects Playwright MCP to tabs in the real Chrome process, so the operator and the agent see the same authenticated browser state.

## One-Time Setup

1. Open Google Chrome on `giggabit-server` using the normal agent-only profile.
2. Install the Microsoft [Playwright Extension](https://chromewebstore.google.com/detail/playwright-extension/mmlmfjhmonkocbjadbfplnigmagldckm).
3. Open the extension status page and copy its `PLAYWRIGHT_MCP_EXTENSION_TOKEN` value. Treat the token as a local browser-control credential: do not paste it into Linear, logs, documentation, or shell history.
4. Configure Codex from the T3 Code checkout:

```bash
read -rsp 'Playwright extension token: ' PLAYWRIGHT_MCP_EXTENSION_TOKEN
export PLAYWRIGHT_MCP_EXTENSION_TOKEN
pnpm run agent-browser:setup -- --write
unset PLAYWRIGHT_MCP_EXTENSION_TOKEN
```

The setup command installs an idempotent Codex MCP entry named `playwright-extension` and makes `google-chrome.desktop` the system default for HTTP and HTTPS links. It pins `@playwright/mcp@0.0.78`, enables extension mode, requests a 1440×900 viewport, omits inline image responses, and writes Playwright artifacts beneath:

```text
~/.local/share/t3code-agent-browser/mcp-output
```

The token is accepted only through the environment. The setup command rejects command-line token arguments so the credential does not land in shell history. Re-running `--write` preserves the existing configured token when the environment variable is absent.

Start a new Codex task after setup so the app-server loads the new MCP configuration. The first extension connection may still require choosing or approving a Chrome tab; the token removes repeated connection-approval prompts after that initial browser authorization.

## Health Check

Run:

```bash
pnpm run agent-browser:setup -- --doctor
codex mcp get playwright-extension --json
```

The doctor verifies Google Chrome, Codex, `npx`, the pinned Playwright MCP package, the expected MCP command, and the HTTP/HTTPS browser defaults. It deliberately does not inspect Chrome cookies, passwords, local storage, or profile databases.

Use `--dry-run` to inspect the intended setup without changing Codex:

```bash
pnpm run agent-browser:setup -- --dry-run
```

## Agent Browser Policy

For browser-required work, agents should:

1. Use the `playwright-extension` MCP `browser_*` tools when they are available.
2. Start with `browser_tabs` to select or create the intended tab.
3. Call `browser_resize` with width `1440` and height `900` before taking a fresh `browser_snapshot`.
4. Stay on the selected browser surface for the task and use snapshot-provided locators.
5. Fall back to `preview_status`, `preview_open`, `preview_resize`, and the remaining `preview_*` tools only when the extension-backed browser is absent or explicitly reports an unavailable/unsupported error.
6. Use `app_*` only for T3 Code's own Electron shell.

Do not launch separate Brave, Chrome, Chromium, raw CDP, agent-browser, or standalone Playwright automation while either supported toolset is available. A second browser process may not have the same authenticated state and can make agent behavior appear inconsistent.

## Recovery

If `playwright-extension` is configured but the tools cannot connect:

1. Confirm Google Chrome is running on `giggabit-server`.
2. If Chrome itself displays a sign-in or reauthentication request, complete it once in Chrome; agents inherit Chrome's current state but cannot turn an expired site session into a valid one.
3. Open the Playwright Extension and confirm it is enabled for the active Chrome profile.
4. Re-run `pnpm run agent-browser:setup -- --doctor`.
5. If the extension rotated its token, export the new value and re-run `--write`.
6. Start a new Codex task so the app-server reloads MCP configuration.
7. Use the collaborative `preview_*` browser only as the documented temporary fallback.

The official Playwright documentation describes extension mode as the supported way to connect to an existing Chrome browser and reuse its logged-in sessions and browser state: <https://github.com/microsoft/playwright/tree/main/packages/extension>.
