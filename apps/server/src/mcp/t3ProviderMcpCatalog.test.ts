import { expect, it } from "@effect/vitest";
import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";

import { resolveEnabledT3ProviderMcps } from "./t3ProviderMcpCatalog.ts";

it("does not inject jira-local by default", () => {
  const mcps = resolveEnabledT3ProviderMcps({
    settings: DEFAULT_SERVER_SETTINGS,
    catalog: {
      mcps: [
        {
          id: "jira-local",
          displayName: "Jira Local",
          description: "Local Jira MCP server.",
          command: "/usr/bin/node",
          args: ["/home/jgigg/code/jira-mcp-server/dist/index.js"],
          availabilityPath: "/home/jgigg/code/jira-mcp-server/dist/index.js",
          available: true,
        },
      ],
    },
  });

  expect(mcps).toEqual([]);
});

it("injects jira-local only when enabled and available", () => {
  const settings = {
    ...DEFAULT_SERVER_SETTINGS,
    t3ProviderAccess: {
      mcps: {
        "jira-local": { enabled: true },
      },
    },
  };

  expect(
    resolveEnabledT3ProviderMcps({
      settings,
      catalog: {
        mcps: [
          {
            id: "jira-local",
            displayName: "Jira Local",
            description: "Local Jira MCP server.",
            command: "/usr/bin/node",
            args: ["/home/jgigg/code/jira-mcp-server/dist/index.js"],
            availabilityPath: "/home/jgigg/code/jira-mcp-server/dist/index.js",
            available: false,
          },
        ],
      },
    }),
  ).toEqual([]);

  expect(
    resolveEnabledT3ProviderMcps({
      settings,
      catalog: {
        mcps: [
          {
            id: "jira-local",
            displayName: "Jira Local",
            description: "Local Jira MCP server.",
            command: "/usr/bin/node",
            args: ["/home/jgigg/code/jira-mcp-server/dist/index.js"],
            availabilityPath: "/home/jgigg/code/jira-mcp-server/dist/index.js",
            available: true,
          },
        ],
      },
    }),
  ).toEqual([
    {
      id: "jira-local",
      displayName: "Jira Local",
      description: "Local Jira MCP server.",
      command: "/usr/bin/node",
      args: ["/home/jgigg/code/jira-mcp-server/dist/index.js"],
      availabilityPath: "/home/jgigg/code/jira-mcp-server/dist/index.js",
    },
  ]);
});
