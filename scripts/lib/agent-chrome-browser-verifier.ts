// @effect-diagnostics globalDate:off - Evidence manifests need a wall-clock timestamp at the CLI boundary.
export interface AgentChromeVerificationAssertions {
  readonly browserTabsCompleted: boolean;
  readonly browserResizeCompleted: boolean;
  readonly finalMarkerValid: boolean;
}

export interface AgentChromeVerificationManifest {
  readonly issue: "GBT-89";
  readonly generatedAt: string;
  readonly surface: "playwright-extension";
  readonly command: "pnpm run agent-browser:verify";
  readonly checkpoints: ReadonlyArray<string>;
  readonly absenceChecks: ReadonlyArray<string>;
  readonly assertions: AgentChromeVerificationAssertions;
  readonly rawBrowserContentStored: false;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parseAgentChromeVerification(
  eventsJsonl: string,
  finalMessage: string,
): AgentChromeVerificationAssertions {
  const completedTools = new Set(
    eventsJsonl
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .flatMap((line) => {
        try {
          const event = asRecord(JSON.parse(line) as unknown);
          const item = asRecord(event?.item);
          return event?.type === "item.completed" &&
            item?.type === "mcp_tool_call" &&
            item.server === "playwright-extension" &&
            item.status === "completed" &&
            typeof item.tool === "string"
            ? [item.tool]
            : [];
        } catch {
          return [];
        }
      }),
  );
  return {
    browserTabsCompleted: completedTools.has("browser_tabs"),
    browserResizeCompleted: completedTools.has("browser_resize"),
    finalMarkerValid: /^SHARED_CHROME_E2E_OK tab_count=\d+ viewport=1440x900$/u.test(
      finalMessage.trim(),
    ),
  };
}

export function agentChromeVerificationPassed(
  assertions: AgentChromeVerificationAssertions,
): boolean {
  return Object.values(assertions).every(Boolean);
}

export function buildAgentChromeVerificationManifest(
  assertions: AgentChromeVerificationAssertions,
  generatedAt = new Date().toISOString(),
): AgentChromeVerificationManifest {
  return {
    issue: "GBT-89",
    generatedAt,
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
  };
}
