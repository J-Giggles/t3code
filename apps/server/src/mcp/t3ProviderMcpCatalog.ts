import type {
  ServerT3ProviderAccessCatalog,
  ServerT3ProviderAccessMcpCatalogEntry,
  T3ProviderAccessMcpId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

export interface T3ProviderMcpCatalogEntry {
  readonly id: T3ProviderAccessMcpId;
  readonly displayName: string;
  readonly description: string;
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly availabilityPath: string;
}

export const T3_PROVIDER_MCP_CATALOG = [
  {
    id: "jira-local",
    displayName: "Jira Local",
    description: "Local Jira MCP server.",
    command: "/usr/bin/node",
    args: ["/home/jgigg/code/jira-mcp-server/dist/index.js"],
    availabilityPath: "/home/jgigg/code/jira-mcp-server/dist/index.js",
  },
] as const satisfies ReadonlyArray<T3ProviderMcpCatalogEntry>;

export const loadT3ProviderAccessCatalog = Effect.fn("loadT3ProviderAccessCatalog")(function* () {
  const mcps: ServerT3ProviderAccessMcpCatalogEntry[] = [];
  for (const entry of T3_PROVIDER_MCP_CATALOG) {
    const available = yield* Effect.promise(async () => {
      try {
        const { access } = await import("node:fs/promises");
        await access(entry.availabilityPath);
        return true;
      } catch {
        return false;
      }
    });
    mcps.push({
      ...entry,
      args: [...entry.args],
      available,
      ...(available ? {} : { unavailableReason: `Missing ${entry.availabilityPath}` }),
    });
  }
  return { mcps } satisfies ServerT3ProviderAccessCatalog;
});

export function resolveEnabledT3ProviderMcps(input: {
  readonly catalog: ServerT3ProviderAccessCatalog;
  readonly settings: {
    readonly t3ProviderAccess: { readonly mcps: Record<string, { enabled?: boolean }> };
  };
}): T3ProviderMcpCatalogEntry[] {
  const availableById = new Map(input.catalog.mcps.map((entry) => [entry.id, entry.available]));
  return T3_PROVIDER_MCP_CATALOG.filter(
    (entry) =>
      input.settings.t3ProviderAccess.mcps[entry.id]?.enabled === true &&
      availableById.get(entry.id) === true,
  ).map((entry) => ({ ...entry, args: [...entry.args] }));
}
