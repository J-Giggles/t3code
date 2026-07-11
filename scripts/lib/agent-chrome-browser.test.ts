// @effect-diagnostics nodeBuiltinImport:off - Test setup needs an isolated temporary home directory.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { assert, describe, it } from "vitest";
import {
  agentChromeVerificationPassed,
  buildAgentChromeVerificationManifest,
  parseAgentChromeVerification,
} from "./agent-chrome-browser-verifier.ts";
import {
  AGENT_CHROME_DESKTOP_ID,
  AGENT_CHROME_MCP_NAME,
  AGENT_CHROME_PROFILE_DIRECTORY,
  buildAgentChromeDesktopDefinition,
  buildAgentChromeMcpAddArgs,
  buildAgentChromeMcpDefinition,
  isExpectedAgentChromeMcpConfig,
  parseAgentChromeBrowserArgs,
  PLAYWRIGHT_EXTENSION_ID,
  PLAYWRIGHT_EXTENSION_TOKEN_ENV,
  PLAYWRIGHT_MCP_PACKAGE,
  setupAgentChromeBrowser,
} from "./agent-chrome-browser.ts";

describe("agent Chrome browser setup", () => {
  it("pins extension-backed Playwright MCP with a desktop viewport", () => {
    const definition = buildAgentChromeMcpDefinition("/home/jgigg");

    assert.equal(AGENT_CHROME_MCP_NAME, "playwright-extension");
    assert.equal(PLAYWRIGHT_MCP_PACKAGE, "@playwright/mcp@0.0.78");
    assert.equal(PLAYWRIGHT_EXTENSION_ID, "mmlmfjhmonkocbjadbfplnigmagldckm");
    assert.equal(definition.command, "npx");
    assert.deepEqual(definition.args.slice(0, 4), [
      "-y",
      PLAYWRIGHT_MCP_PACKAGE,
      "--extension",
      "--viewport-size",
    ]);
    assert.ok(definition.args.includes("1440x900"));
    assert.ok(definition.args.includes("--codegen"));
    assert.ok(definition.args.includes("none"));
    assert.ok(definition.args.includes("--output-mode"));
    assert.ok(definition.args.includes("file"));
  });

  it("passes the extension token only through the MCP environment", () => {
    const definition = buildAgentChromeMcpDefinition("/home/jgigg");
    const args = buildAgentChromeMcpAddArgs(definition, "secret-token");

    assert.deepEqual(args.slice(0, 4), ["mcp", "add", AGENT_CHROME_MCP_NAME, "--env"]);
    assert.equal(args[4], "PLAYWRIGHT_MCP_EXTENSION_TOKEN=secret-token");
    assert.ok(args.includes("--"));
    assert.equal(args.filter((value) => value.includes("secret-token")).length, 1);
  });

  it("pins system browser launches to the existing agent-only Chrome profile", () => {
    const definition = buildAgentChromeDesktopDefinition("/home/jgigg");

    assert.equal(AGENT_CHROME_DESKTOP_ID, "t3code-agent-chrome.desktop");
    assert.equal(AGENT_CHROME_PROFILE_DIRECTORY, "Default");
    assert.match(definition.launcherPath, /t3code-agent-chrome$/);
    assert.match(definition.launcherContents, /--profile-directory=Default/);
    assert.notMatch(definition.launcherContents, /--user-data-dir/);
    assert.match(definition.desktopContents, /x-scheme-handler\/https/);
  });

  it("recognizes the expected Codex MCP configuration without logging secrets", () => {
    const definition = buildAgentChromeMcpDefinition("/home/jgigg");
    const config = {
      name: AGENT_CHROME_MCP_NAME,
      transport: {
        type: "stdio",
        command: definition.command,
        args: definition.args,
        env: { PLAYWRIGHT_MCP_EXTENSION_TOKEN: "secret-token" },
      },
    };

    assert.equal(isExpectedAgentChromeMcpConfig(config, definition, true), true);
    assert.equal(isExpectedAgentChromeMcpConfig(config, definition, false), true);
    assert.equal(
      isExpectedAgentChromeMcpConfig(
        { ...config, transport: { ...config.transport, args: ["different"] } },
        definition,
        true,
      ),
      false,
    );
  });

  it("parses fail-closed setup modes and rejects command-line tokens", () => {
    assert.deepEqual(parseAgentChromeBrowserArgs([]), { help: false, mode: "doctor" });
    assert.deepEqual(parseAgentChromeBrowserArgs(["--dry-run"]), {
      help: false,
      mode: "dry-run",
    });
    assert.deepEqual(parseAgentChromeBrowserArgs(["--write"]), {
      help: false,
      mode: "write",
    });
    assert.deepEqual(parseAgentChromeBrowserArgs(["--help"]), { help: true, mode: "doctor" });
    assert.throws(
      () => parseAgentChromeBrowserArgs(["--token", "secret-token"]),
      /PLAYWRIGHT_MCP_EXTENSION_TOKEN/,
    );
    assert.throws(
      () => parseAgentChromeBrowserArgs(["--write", "--dry-run"]),
      /Choose exactly one mode/,
    );
  });

  it("preserves the configured token and makes Chrome the default browser", () => {
    const homeDir = NodeFS.mkdtempSync(
      NodePath.join(NodeOS.tmpdir(), "t3code-agent-chrome-browser-"),
    );
    const definition = buildAgentChromeMcpDefinition(homeDir);
    const existingToken = "existing-extension-token";
    const config = {
      name: AGENT_CHROME_MCP_NAME,
      transport: {
        type: "stdio",
        command: definition.command,
        args: definition.args,
        env: { [PLAYWRIGHT_EXTENSION_TOKEN_ENV]: existingToken },
      },
    };
    const calls: Array<readonly [string, ReadonlyArray<string>]> = [];
    let desktopDefault = "brave-browser.desktop";
    let httpDefault = "brave-browser.desktop";
    let httpsDefault = "brave-browser.desktop";

    try {
      const result = setupAgentChromeBrowser("write", {
        homeDir,
        environment: {},
        run: (command, args) => {
          calls.push([command, args]);
          if (args.length === 1 && args[0] === "--version") {
            return { exitCode: 0, stdout: "available\n", stderr: "" };
          }
          if (command === "npx") {
            return { exitCode: 0, stdout: "0.0.78\n", stderr: "" };
          }
          if (command === "codex" && args[0] === "mcp" && args[1] === "get") {
            return { exitCode: 0, stdout: JSON.stringify(config), stderr: "" };
          }
          if (command === "codex" && args[0] === "mcp" && args[1] === "add") {
            return { exitCode: 0, stdout: "added\n", stderr: "" };
          }
          if (command === "xdg-settings" && args[0] === "set") {
            desktopDefault = args[2] ?? "";
            return { exitCode: 0, stdout: "", stderr: "" };
          }
          if (command === "xdg-settings" && args[0] === "get") {
            return { exitCode: 0, stdout: `${desktopDefault}\n`, stderr: "" };
          }
          if (command === "xdg-mime" && args[0] === "default") {
            if (args[2] === "x-scheme-handler/http") httpDefault = args[1] ?? "";
            if (args[2] === "x-scheme-handler/https") httpsDefault = args[1] ?? "";
            return { exitCode: 0, stdout: "", stderr: "" };
          }
          if (command === "xdg-mime" && args[0] === "query") {
            const value = args[2] === "x-scheme-handler/http" ? httpDefault : httpsDefault;
            return { exitCode: 0, stdout: `${value}\n`, stderr: "" };
          }
          return { exitCode: 1, stdout: "", stderr: "unexpected command" };
        },
      });

      const addCall = calls.find(
        ([command, args]) => command === "codex" && args[0] === "mcp" && args[1] === "add",
      );
      assert.ok(addCall);
      assert.equal(addCall[1].filter((argument) => argument.includes(existingToken)).length, 1);
      const desktopDefinition = buildAgentChromeDesktopDefinition(homeDir);
      assert.equal(desktopDefault, AGENT_CHROME_DESKTOP_ID);
      assert.equal(httpDefault, AGENT_CHROME_DESKTOP_ID);
      assert.equal(httpsDefault, AGENT_CHROME_DESKTOP_ID);
      assert.equal(result.configured, true);
      assert.equal(result.profileLauncherConfigured, true);
      assert.equal(result.defaultBrowserConfigured, true);
      assert.equal(result.ready, true);
      assert.equal(result.automaticApproval, true);
      assert.equal(NodeFS.existsSync(definition.outputDir), true);
      assert.equal(
        NodeFS.readFileSync(desktopDefinition.launcherPath, "utf8"),
        desktopDefinition.launcherContents,
      );
    } finally {
      NodeFS.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("accepts only secret-free completed headed verification checkpoints", () => {
    const events = [
      {
        type: "item.completed",
        item: {
          type: "mcp_tool_call",
          server: "playwright-extension",
          tool: "browser_tabs",
          status: "completed",
        },
      },
      {
        type: "item.completed",
        item: {
          type: "mcp_tool_call",
          server: "playwright-extension",
          tool: "browser_resize",
          status: "completed",
        },
      },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n");
    const assertions = parseAgentChromeVerification(
      events,
      "SHARED_CHROME_E2E_OK tab_count=1 viewport=1440x900",
    );

    assert.equal(agentChromeVerificationPassed(assertions), true);
    assert.deepEqual(buildAgentChromeVerificationManifest(assertions, "2026-07-11T00:00:00Z"), {
      issue: "GBT-89",
      generatedAt: "2026-07-11T00:00:00Z",
      surface: "playwright-extension",
      command: "pnpm run agent-browser:verify",
      checkpoints: [
        "Codex completed browser_tabs through playwright-extension",
        "Codex completed browser_resize at 1440x900",
        "Codex returned the secret-free headed verification marker",
      ],
      absenceChecks: [
        "No failed MCP tool call",
        "No fallback browser surface used",
        "No token, URL, title, account identity, or page content retained",
      ],
      assertions,
      rawBrowserContentStored: false,
    });
    assert.equal(
      agentChromeVerificationPassed(
        parseAgentChromeVerification(events, "SHARED_CHROME_E2E_FAILED"),
      ),
      false,
    );
  });
});
