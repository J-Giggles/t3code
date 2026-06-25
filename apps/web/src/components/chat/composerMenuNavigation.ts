import type { ComposerTrigger } from "../../composer-logic";
import type { ComposerCommandItem } from "./ComposerCommandMenu";
import {
  instructionRuleDescription as describeSharedInstructionRulePath,
  isInstructionRulePath as isSharedInstructionRulePath,
} from "@t3tools/shared/agentFiles";

export type ComposerMenuSectionId =
  | "commands"
  | "provider-commands"
  | "skills"
  | "disabled-skills"
  | "templates"
  | "files"
  | "folders"
  | "past-chats"
  | "terminals"
  | "running-dev-environments"
  | "instructions-rules"
  | "active-context"
  | "recent-items"
  | "pinned-items";

export const composerMenuSectionConfig: Record<
  ComposerMenuSectionId,
  { label: string; description: string }
> = {
  commands: { label: "Commands", description: "Built-in composer actions" },
  "provider-commands": { label: "Provider Commands", description: "Commands from the provider" },
  skills: { label: "Skills", description: "Provider skills available from slash commands" },
  "disabled-skills": { label: "Disabled Skills", description: "Skills available to enable" },
  templates: { label: "Templates", description: "Starter prompts and common tasks" },
  files: { label: "Files", description: "Workspace files matching this search" },
  folders: { label: "Folders", description: "Workspace folders matching this search" },
  "past-chats": { label: "Past Chats", description: "Other chats in this project" },
  terminals: { label: "Terminals", description: "Terminal output that can be attached" },
  "running-dev-environments": {
    label: "Running Dev Environments",
    description: "Active agent and dev-server terminals",
  },
  "instructions-rules": {
    label: "Instructions & Rules",
    description: "Repo instruction files and rule sources",
  },
  "active-context": { label: "Active Context", description: "Context already staged by default" },
  "recent-items": { label: "Recent Items", description: "Recently selected menu items" },
  "pinned-items": { label: "Pinned Items", description: "Pinned sections and context" },
};

export const slashMenuSectionOrder: readonly ComposerMenuSectionId[] = [
  "commands",
  "provider-commands",
  "skills",
  "disabled-skills",
  "templates",
  "active-context",
  "instructions-rules",
  "recent-items",
  "pinned-items",
];

export const pathMenuSectionOrder: readonly ComposerMenuSectionId[] = [
  "files",
  "folders",
  "past-chats",
  "terminals",
  "running-dev-environments",
  "instructions-rules",
  "active-context",
  "recent-items",
  "pinned-items",
];

export function canonicalComposerMenuItemId(itemOrId: ComposerCommandItem | string): string {
  const id = typeof itemOrId === "string" ? itemOrId : itemOrId.id;
  return id.replace(/^(?:recent-item|pinned-item):/, "");
}

function memorySectionIdForItemId(itemId: string): ComposerMenuSectionId | null {
  if (itemId.startsWith("recent-item:")) return "recent-items";
  if (itemId.startsWith("pinned-item:")) return "pinned-items";
  return null;
}

export function getComposerMenuItemSectionId(
  item: ComposerCommandItem,
): ComposerMenuSectionId | null {
  const memorySectionId = memorySectionIdForItemId(item.id);
  if (memorySectionId) return memorySectionId;

  switch (item.type) {
    case "menu-section":
      return null;
    case "slash-command":
      return "commands";
    case "provider-slash-command":
      return "provider-commands";
    case "skill":
      return item.skill.enabled ? "skills" : "disabled-skills";
    case "message-template":
      return "templates";
    case "path":
      return item.pathKind === "directory" ? "folders" : "files";
    case "past-chat":
      return "past-chats";
    case "terminal-context":
      return item.section === "Running Dev Environments" ? "running-dev-environments" : "terminals";
    case "instruction-rule":
      return "instructions-rules";
    case "active-context":
      return "active-context";
  }
}

export function cloneComposerMenuItemForSection(
  item: ComposerCommandItem,
  sectionId: Extract<ComposerMenuSectionId, "recent-items" | "pinned-items">,
): ComposerCommandItem {
  const canonicalId = canonicalComposerMenuItemId(item);
  const prefix = sectionId === "recent-items" ? "recent-item" : "pinned-item";
  const descriptionPrefix = sectionId === "recent-items" ? "Recent" : "Pinned";
  return {
    ...item,
    id: `${prefix}:${canonicalId}`,
    description: `${descriptionPrefix}; ${item.description}`,
  } as ComposerCommandItem;
}

export function composerMenuItemMatchesQuery(item: ComposerCommandItem, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return `${item.label} ${item.description}`.toLowerCase().includes(normalizedQuery);
}

export function rankComposerMenuLeafItems(input: {
  readonly items: ReadonlyArray<ComposerCommandItem>;
  readonly pinnedItemIds: ReadonlySet<string>;
  readonly recentItemIds: ReadonlyArray<string>;
  readonly query: string;
}): ComposerCommandItem[] {
  const recentRank = new Map(input.recentItemIds.map((id, index) => [id, index]));
  const normalizedQuery = input.query.trim().toLowerCase();
  const score = (item: ComposerCommandItem): number => {
    if (!normalizedQuery) return 0;
    const label = item.label.toLowerCase();
    const description = item.description.toLowerCase();
    if (label === normalizedQuery) return 5;
    if (label.startsWith(normalizedQuery)) return 4;
    if (label.includes(normalizedQuery)) return 3;
    if (description.includes(normalizedQuery)) return 2;
    return 0;
  };

  return [...input.items].sort((left, right) => {
    const leftId = canonicalComposerMenuItemId(left);
    const rightId = canonicalComposerMenuItemId(right);
    const leftPinned = input.pinnedItemIds.has(leftId) ? 0 : 1;
    const rightPinned = input.pinnedItemIds.has(rightId) ? 0 : 1;
    if (leftPinned !== rightPinned) return leftPinned - rightPinned;

    const leftRecent = recentRank.get(leftId) ?? Number.POSITIVE_INFINITY;
    const rightRecent = recentRank.get(rightId) ?? Number.POSITIVE_INFINITY;
    if (leftRecent !== rightRecent) return leftRecent - rightRecent;

    const scoreDelta = score(right) - score(left);
    if (scoreDelta !== 0) return scoreDelta;

    return left.label.localeCompare(right.label) || left.id.localeCompare(right.id);
  });
}

export function buildComposerMenuSectionRows(input: {
  items: ReadonlyArray<ComposerCommandItem>;
  order: readonly ComposerMenuSectionId[];
}): ComposerCommandItem[] {
  const counts = new Map<ComposerMenuSectionId, number>();
  for (const item of input.items) {
    const sectionId = getComposerMenuItemSectionId(item);
    if (!sectionId) continue;
    counts.set(sectionId, (counts.get(sectionId) ?? 0) + 1);
  }

  return input.order.flatMap((sectionId) => {
    const count = counts.get(sectionId) ?? 0;
    if (count === 0) return [];
    const config = composerMenuSectionConfig[sectionId];
    return [
      {
        id: `menu-section:${sectionId}`,
        type: "menu-section" as const,
        sectionId,
        label: config.label,
        description: config.description,
        count,
      },
    ];
  });
}

export function buildVisibleComposerMenuItems(input: {
  leafItems: ReadonlyArray<ComposerCommandItem>;
  triggerKind: ComposerTrigger["kind"] | null;
  activeSectionId: ComposerMenuSectionId | null;
  query: string;
}): ComposerCommandItem[] {
  if (input.activeSectionId) {
    return input.leafItems.filter(
      (item) => getComposerMenuItemSectionId(item) === input.activeSectionId,
    );
  }

  const order =
    input.triggerKind === "slash-command" ? slashMenuSectionOrder : pathMenuSectionOrder;
  const sectionRows = buildComposerMenuSectionRows({ items: input.leafItems, order });
  const directItems: ComposerCommandItem[] = [];
  if (input.query.trim().length > 0) {
    const seenIds = new Set<string>();
    for (const item of input.leafItems) {
      if (item.type === "menu-section") continue;
      if (!composerMenuItemMatchesQuery(item, input.query)) continue;
      const canonicalId = canonicalComposerMenuItemId(item);
      if (seenIds.has(canonicalId)) continue;
      seenIds.add(canonicalId);
      directItems.push(item);
      if (directItems.length >= 6) break;
    }
  }
  return [...directItems, ...sectionRows];
}

export function isInstructionRulePath(path: string): boolean {
  return isSharedInstructionRulePath(path);
}

export function instructionRuleDescription(path: string): string {
  return describeSharedInstructionRulePath(path);
}

export function estimateComposerContextTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}
