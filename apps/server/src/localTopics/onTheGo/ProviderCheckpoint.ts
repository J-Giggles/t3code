import type { OrchestrationThreadActivity } from "@t3tools/contracts";

export type OnTheGoProviderCheckpointKind = "tests" | "approval" | "blocked" | "failed";

/** Conservative adapter: unmapped provider activity remains silent. */
export const classifyProviderActivity = (
  activity: Pick<OrchestrationThreadActivity, "tone" | "kind" | "summary">,
): OnTheGoProviderCheckpointKind | null => {
  if (activity.tone === "approval") return "approval";
  if (activity.tone === "error") return "failed";
  if (/input|question|blocked/i.test(activity.kind)) return "blocked";
  if (/test/i.test(`${activity.kind} ${activity.summary}`)) return "tests";
  return null;
};
