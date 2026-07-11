// @effect-diagnostics globalDate:off - Evidence manifests need a wall-clock timestamp at the CLI boundary.
export interface AgentChromeVerificationAssertions {
  readonly browserTabsCompleted: boolean;
  readonly browserResizeCompleted: boolean;
  readonly browserNavigateCompleted: boolean;
  readonly browserSnapshotCompleted: boolean;
  readonly sharedSessionCookieObserved: boolean;
  readonly noFailedToolCalls: boolean;
  readonly noFallbackSurfaceCalls: boolean;
  readonly finalMarkerValid: boolean;
}

export interface AgentChromeFlowEvidence {
  readonly flow: string;
  readonly test: "pnpm run agent-browser:verify";
  readonly assertions: ReadonlyArray<keyof AgentChromeVerificationAssertions>;
  readonly artifact: "manifest.json";
  readonly status: "passed";
}

export interface AgentChromeVerificationManifest {
  readonly issue: "GBT-89";
  readonly generatedAt: string;
  readonly surface: "playwright-extension";
  readonly command: "pnpm run agent-browser:verify";
  readonly checkpoints: ReadonlyArray<string>;
  readonly assertions: AgentChromeVerificationAssertions;
  readonly flowEvidenceMatrix: ReadonlyArray<AgentChromeFlowEvidence>;
  readonly rawBrowserContentStored: false;
}

interface McpToolEvent {
  readonly event: string;
  readonly server: string | undefined;
  readonly tool: string | undefined;
  readonly status: string | undefined;
  readonly failed: boolean;
  readonly observedSessionMarker: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function mcpToolEvents(eventsJsonl: string): ReadonlyArray<McpToolEvent> {
  return eventsJsonl
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        const event = asRecord(JSON.parse(line) as unknown);
        const item = asRecord(event?.item);
        if (item?.type !== "mcp_tool_call") return [];
        return [
          {
            event: typeof event?.type === "string" ? event.type : "",
            server: typeof item.server === "string" ? item.server : undefined,
            tool: typeof item.tool === "string" ? item.tool : undefined,
            status: typeof item.status === "string" ? item.status : undefined,
            failed: item.status === "failed" || (item.error !== undefined && item.error !== null),
            observedSessionMarker: JSON.stringify(item.result ?? "").includes(
              "SHARED_SESSION_AUTHENTICATED",
            ),
          },
        ];
      } catch {
        return [];
      }
    });
}

export function agentChromeVerificationEventSummary(eventsJsonl: string): string {
  const summary = mcpToolEvents(eventsJsonl).map(
    (tool) =>
      `${tool.event}:${tool.server ?? "unknown"}/${tool.tool ?? "unknown"}:${tool.status ?? "unknown"}:${tool.failed ? "failed" : "ok"}`,
  );
  return summary.length > 0 ? summary.join(", ") : "no MCP tool events";
}

export class SharedChromePageObject {
  readonly sessionCheckUrl: string;

  constructor(sessionCheckUrl: string) {
    this.sessionCheckUrl = sessionCheckUrl;
  }

  verificationPrompt(): string {
    return [
      "Use only the playwright-extension browser tools.",
      "Call browser_tabs to list the already-open shared Chrome pages.",
      "Call browser_resize with width 1440 and height 900.",
      `Navigate the attached tab to ${this.sessionCheckUrl}.`,
      "Take a browser_snapshot and confirm it contains exactly SHARED_SESSION_AUTHENTICATED.",
      "After confirming the marker, navigate the attached tab to about:blank.",
      "Do not click, type, or inspect any other page content.",
      "Return exactly SHARED_CHROME_E2E_OK tab_count=<number> viewport=1440x900 auth=shared-cookie if every checkpoint succeeds.",
      "Otherwise return exactly SHARED_CHROME_E2E_FAILED.",
      "Do not include URLs, titles, tokens, account identities, or other page contents.",
    ].join(" ");
  }

  assertions(eventsJsonl: string, finalMessage: string): AgentChromeVerificationAssertions {
    const tools = mcpToolEvents(eventsJsonl);
    const completedTools = new Set(
      tools
        .filter((tool) => tool.event === "item.completed" && tool.status === "completed")
        .map((tool) => tool.tool),
    );
    const finalMarkerValid =
      /^SHARED_CHROME_E2E_OK tab_count=\d+ viewport=1440x900 auth=shared-cookie$/u.test(
        finalMessage.trim(),
      );
    return {
      browserTabsCompleted: completedTools.has("browser_tabs"),
      browserResizeCompleted: completedTools.has("browser_resize"),
      browserNavigateCompleted: completedTools.has("browser_navigate"),
      browserSnapshotCompleted: completedTools.has("browser_snapshot"),
      sharedSessionCookieObserved: tools.some(
        (tool) =>
          tool.event === "item.completed" &&
          tool.tool === "browser_snapshot" &&
          tool.status === "completed" &&
          tool.observedSessionMarker,
      ),
      noFailedToolCalls: tools.every((tool) => !tool.failed),
      noFallbackSurfaceCalls: tools.every(
        (tool) => tool.server !== "t3-code" && !tool.tool?.startsWith("preview_"),
      ),
      finalMarkerValid,
    };
  }

  manifest(
    assertions: AgentChromeVerificationAssertions,
    generatedAt = new Date().toISOString(),
  ): AgentChromeVerificationManifest {
    return {
      issue: "GBT-89",
      generatedAt,
      surface: "playwright-extension",
      command: "pnpm run agent-browser:verify",
      checkpoints: [
        "System-default pinned Chrome launcher seeded an HttpOnly session cookie",
        "Codex completed browser_tabs and browser_resize through playwright-extension",
        "Codex navigated to the local session check and observed the shared cookie",
        "No failed MCP or collaborative-preview fallback tool call occurred",
      ],
      assertions,
      flowEvidenceMatrix: [
        {
          flow: "Attach Codex to the existing headed Chrome profile",
          test: "pnpm run agent-browser:verify",
          assertions: ["browserTabsCompleted", "noFallbackSurfaceCalls"],
          artifact: "manifest.json",
          status: "passed",
        },
        {
          flow: "Use a desktop-sized browser viewport",
          test: "pnpm run agent-browser:verify",
          assertions: ["browserResizeCompleted"],
          artifact: "manifest.json",
          status: "passed",
        },
        {
          flow: "Reuse session state seeded through the operator Chrome launcher",
          test: "pnpm run agent-browser:verify",
          assertions: [
            "browserNavigateCompleted",
            "browserSnapshotCompleted",
            "sharedSessionCookieObserved",
            "noFailedToolCalls",
            "finalMarkerValid",
          ],
          artifact: "manifest.json",
          status: "passed",
        },
      ],
      rawBrowserContentStored: false,
    };
  }
}

export function agentChromeVerificationPassed(
  assertions: AgentChromeVerificationAssertions,
): boolean {
  return Object.values(assertions).every(Boolean);
}
