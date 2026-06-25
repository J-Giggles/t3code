import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

export interface AutomationOwnerBase {
  readonly clientId: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly supportsAutomation: boolean;
  readonly focusedAt: string;
}

export interface AutomationInvocationScope {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}

export function selectFocusedAutomationOwner<Owner extends AutomationOwnerBase>(
  owners: Iterable<Owner>,
  scope: AutomationInvocationScope,
): Owner | undefined {
  return Array.from(owners)
    .filter(
      (owner) =>
        owner.environmentId === scope.environmentId &&
        owner.threadId === scope.threadId &&
        owner.supportsAutomation,
    )
    .sort((left, right) => right.focusedAt.localeCompare(left.focusedAt))[0];
}
