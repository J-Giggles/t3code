import {
  type ProjectEntry,
  type ProviderDriverKind,
  type ServerProviderSkill,
  type ServerProviderSlashCommand,
} from "@t3tools/contracts";
import {
  BotIcon,
  CircleAlertIcon,
  ChevronRightIcon,
  EyeIcon,
  FileTextIcon,
  InfoIcon,
  MessageSquareTextIcon,
  MonitorPlayIcon,
  PinIcon,
  PinOffIcon,
  TerminalIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
} from "lucide-react";
import { memo, useLayoutEffect, useMemo, useRef } from "react";

import { type ComposerSlashCommand, type ComposerTriggerKind } from "../../composer-logic";
import { formatProviderSkillInstallSource } from "~/providerSkillPresentation";
import { cn } from "~/lib/utils";
import {
  Command,
  CommandGroup,
  CommandGroupLabel,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "../ui/command";
import { PierreEntryIcon } from "./PierreEntryIcon";
import type { ComposerMessageTemplate } from "./composerSlashMenuItems";
import { canonicalComposerMenuItemId } from "./composerMenuNavigation";

export type ComposerCommandItem =
  | {
      id: string;
      type: "menu-section";
      sectionId: string;
      label: string;
      description: string;
      count: number;
    }
  | {
      id: string;
      type: "path";
      path: string;
      pathKind: ProjectEntry["kind"];
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "slash-command";
      command: ComposerSlashCommand;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "provider-slash-command";
      provider: ProviderDriverKind;
      command: ServerProviderSlashCommand;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "skill";
      provider: ProviderDriverKind;
      skill: ServerProviderSkill;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "message-template";
      template: ComposerMessageTemplate;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "past-chat";
      section: "Past Chats";
      label: string;
      description: string;
      environmentId: string;
      threadId: string;
    }
  | {
      id: string;
      type: "instruction-rule";
      section: "Instructions & Rules";
      path: string;
      label: string;
      description: string;
      status: "provider-active" | "available" | "draft-added" | "draft-disabled";
      tokenEstimate: number | null;
    }
  | {
      id: string;
      type: "active-context";
      section: "Active Context";
      label: string;
      description: string;
      provenance: string;
      tokenEstimate: number | null;
    }
  | {
      id: string;
      type: "terminal-context";
      section: "Terminals" | "Running Dev Environments";
      label: string;
      description: string;
      terminalId: string;
      text: string;
      state: "agent-access" | "human-only" | "unavailable";
    };

type ComposerCommandGroup = {
  id: string;
  label: string | null;
  items: ComposerCommandItem[];
};

function SkillGlyph(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

function groupCommandItems(
  items: ComposerCommandItem[],
  triggerKind: ComposerTriggerKind | null,
  groupSlashCommandSections: boolean,
): ComposerCommandGroup[] {
  if (triggerKind === "path") {
    const bySection = new Map<string, ComposerCommandItem[]>();
    for (const item of items) {
      const section =
        item.type === "menu-section"
          ? "Browse"
          : "section" in item
            ? item.section
            : item.type === "path"
              ? item.pathKind === "directory"
                ? "Folders"
                : "Files"
              : "Files";
      const sectionItems = bySection.get(section);
      if (sectionItems) {
        sectionItems.push(item);
      } else {
        bySection.set(section, [item]);
      }
    }
    return [
      "Browse",
      "Files",
      "Folders",
      "Past Chats",
      "Terminals",
      "Running Dev Environments",
      "Instructions & Rules",
      "Active Context",
      "Recent Items",
      "Pinned Items",
    ].flatMap((section) => {
      const sectionItems = bySection.get(section);
      return sectionItems && sectionItems.length > 0
        ? [{ id: section, label: section, items: sectionItems }]
        : [];
    });
  }
  if (triggerKind !== "slash-command" || !groupSlashCommandSections) {
    return [{ id: "default", label: null, items }];
  }

  const menuSectionItems = items.filter((item) => item.type === "menu-section");
  const builtInItems = items.filter((item) => item.type === "slash-command");
  const providerItems = items.filter((item) => item.type === "provider-slash-command");
  const skillItems = items.filter((item) => item.type === "skill" && item.skill.enabled);
  const disabledSkillItems = items.filter((item) => item.type === "skill" && !item.skill.enabled);
  const templateItems = items.filter((item) => item.type === "message-template");

  const groups: ComposerCommandGroup[] = [];
  if (menuSectionItems.length > 0) {
    groups.push({ id: "browse", label: "Browse", items: menuSectionItems });
  }
  if (builtInItems.length > 0) {
    groups.push({ id: "built-in", label: "Built-in", items: builtInItems });
  }
  if (providerItems.length > 0) {
    groups.push({ id: "provider", label: "Provider", items: providerItems });
  }
  if (skillItems.length > 0) {
    groups.push({ id: "skills", label: "Skills", items: skillItems });
  }
  if (disabledSkillItems.length > 0) {
    groups.push({ id: "disabled-skills", label: "Disabled Skills", items: disabledSkillItems });
  }
  if (templateItems.length > 0) {
    groups.push({ id: "message-templates", label: "Templates", items: templateItems });
  }
  return groups;
}

export const ComposerCommandMenu = memo(function ComposerCommandMenu(props: {
  items: ComposerCommandItem[];
  resolvedTheme: "light" | "dark";
  isLoading: boolean;
  triggerKind: ComposerTriggerKind | null;
  groupSlashCommandSections?: boolean;
  emptyStateText?: string;
  activeItemId: string | null;
  onHighlightedItemChange: (itemId: string | null) => void;
  onSelect: (item: ComposerCommandItem) => void;
  isItemPinned?: (item: ComposerCommandItem) => boolean;
  onTogglePinnedItem?: (item: ComposerCommandItem) => void;
  onPreviewItem?: (item: ComposerCommandItem) => void;
  onToggleSkill?: (item: Extract<ComposerCommandItem, { type: "skill" }>) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(
    () =>
      groupCommandItems(props.items, props.triggerKind, props.groupSlashCommandSections ?? true),
    [props.groupSlashCommandSections, props.items, props.triggerKind],
  );

  useLayoutEffect(() => {
    if (!props.activeItemId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-composer-item-id="${CSS.escape(props.activeItemId)}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [props.activeItemId]);

  return (
    <Command
      autoHighlight={false}
      mode="none"
      onItemHighlighted={(highlightedValue) => {
        props.onHighlightedItemChange(
          typeof highlightedValue === "string" ? highlightedValue : null,
        );
      }}
    >
      <div
        ref={listRef}
        className="relative w-full overflow-hidden rounded-[20px] border border-border/80 bg-popover/96 shadow-lg/8 backdrop-blur-xs"
      >
        {props.items.length > 0 ? (
          <CommandList className="max-h-72">
            {groups.map((group, groupIndex) => (
              <div key={group.id}>
                {groupIndex > 0 ? <CommandSeparator className="my-0.5" /> : null}
                <CommandGroup>
                  {group.label ? (
                    <CommandGroupLabel className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/55">
                      {group.label}
                    </CommandGroupLabel>
                  ) : null}
                  {group.items.map((item) => (
                    <ComposerCommandMenuItem
                      key={item.id}
                      item={item}
                      resolvedTheme={props.resolvedTheme}
                      isActive={props.activeItemId === item.id}
                      isPinned={props.isItemPinned?.(item) ?? false}
                      onHighlight={props.onHighlightedItemChange}
                      onSelect={props.onSelect}
                      {...(props.onTogglePinnedItem
                        ? { onTogglePinnedItem: props.onTogglePinnedItem }
                        : {})}
                      {...(props.onPreviewItem ? { onPreviewItem: props.onPreviewItem } : {})}
                      {...(props.onToggleSkill ? { onToggleSkill: props.onToggleSkill } : {})}
                    />
                  ))}
                </CommandGroup>
              </div>
            ))}
          </CommandList>
        ) : (
          <div className="px-5 py-3.5">
            <p className="text-muted-foreground/70 text-xs">
              {props.isLoading
                ? "Searching workspace files..."
                : (props.emptyStateText ??
                  (props.triggerKind === "path"
                    ? "No matching files or folders."
                    : "No matching command."))}
            </p>
          </div>
        )}
        <div className="flex items-center gap-3 border-t border-border/55 px-3 py-1.5 text-[10px] text-muted-foreground/65">
          <span>Enter select</span>
          <span>Tab select</span>
          <span>Esc back</span>
          <span>Eye preview</span>
          <span>Pin save</span>
          <span>Toggle skills</span>
        </div>
      </div>
    </Command>
  );
});

function canPreviewComposerItem(item: ComposerCommandItem): boolean {
  return (
    item.type === "path" ||
    item.type === "instruction-rule" ||
    item.type === "past-chat" ||
    item.type === "terminal-context" ||
    item.type === "skill" ||
    item.type === "active-context"
  );
}

const ComposerCommandMenuItem = memo(function ComposerCommandMenuItem(props: {
  item: ComposerCommandItem;
  resolvedTheme: "light" | "dark";
  isActive: boolean;
  isPinned: boolean;
  onHighlight: (itemId: string | null) => void;
  onSelect: (item: ComposerCommandItem) => void;
  onTogglePinnedItem?: (item: ComposerCommandItem) => void;
  onPreviewItem?: (item: ComposerCommandItem) => void;
  onToggleSkill?: (item: Extract<ComposerCommandItem, { type: "skill" }>) => void;
}) {
  const skillSourceLabel =
    props.item.type === "skill" ? formatProviderSkillInstallSource(props.item.skill) : null;
  const canonicalItemId = canonicalComposerMenuItemId(props.item);
  const canPin = props.item.type !== "menu-section" || !canonicalItemId.startsWith("pinned-item:");
  const canPreview = canPreviewComposerItem(props.item);

  return (
    <CommandItem
      value={props.item.id}
      data-composer-item-id={props.item.id}
      className={cn(
        "cursor-pointer select-none gap-2 hover:bg-transparent hover:text-inherit data-highlighted:bg-transparent data-highlighted:text-inherit",
        props.isActive && "bg-accent! text-accent-foreground!",
      )}
      onMouseMove={() => {
        if (!props.isActive) props.onHighlight(props.item.id);
      }}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={() => {
        props.onSelect(props.item);
      }}
    >
      {props.item.type === "menu-section" ? (
        <span className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground/80">
          <ChevronRightIcon className="size-4" />
        </span>
      ) : null}
      {props.item.type === "path" ? (
        <PierreEntryIcon
          pathValue={props.item.path}
          kind={props.item.pathKind}
          theme={props.resolvedTheme}
        />
      ) : null}
      {props.item.type === "slash-command" ? (
        <BotIcon className="size-4 shrink-0 text-muted-foreground/80" />
      ) : null}
      {props.item.type === "provider-slash-command" ? (
        <span className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground/80">
          <SkillGlyph className="size-3.5" />
        </span>
      ) : null}
      {props.item.type === "skill" ? (
        <span className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground/80">
          <SkillGlyph className="size-3.5" />
        </span>
      ) : null}
      {props.item.type === "message-template" ? (
        <MessageSquareTextIcon className="size-4 shrink-0 text-muted-foreground/80" />
      ) : null}
      {props.item.type === "past-chat" ? (
        <MessageSquareTextIcon className="size-4 shrink-0 text-muted-foreground/80" />
      ) : null}
      {props.item.type === "instruction-rule" ? (
        <FileTextIcon className="size-4 shrink-0 text-muted-foreground/80" />
      ) : null}
      {props.item.type === "active-context" ? (
        <InfoIcon className="size-4 shrink-0 text-muted-foreground/80" />
      ) : null}
      {props.item.type === "terminal-context" ? (
        props.item.section === "Running Dev Environments" ? (
          props.item.state === "unavailable" ? (
            <CircleAlertIcon className="size-4 shrink-0 text-muted-foreground/80" />
          ) : (
            <MonitorPlayIcon className="size-4 shrink-0 text-muted-foreground/80" />
          )
        ) : (
          <TerminalIcon className="size-4 shrink-0 text-muted-foreground/80" />
        )
      ) : null}
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0">{props.item.label}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground/70 text-xs">
          {props.item.description}
        </span>
      </span>
      {props.item.type === "menu-section" ? (
        <span className="shrink-0 rounded-sm bg-muted/70 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          {props.item.count}
        </span>
      ) : null}
      {"tokenEstimate" in props.item && props.item.tokenEstimate !== null ? (
        <span className="shrink-0 rounded-sm bg-muted/70 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          ~{props.item.tokenEstimate.toLocaleString()} tok
        </span>
      ) : null}
      {skillSourceLabel ? (
        <span className="shrink-0 pl-2 text-muted-foreground/70 text-xs">{skillSourceLabel}</span>
      ) : null}
      <span className="ml-1 flex shrink-0 items-center gap-0.5">
        {canPreview && props.onPreviewItem ? (
          <button
            type="button"
            className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground/70 hover:bg-muted hover:text-foreground"
            title="Preview"
            aria-label={`Preview ${props.item.label}`}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              props.onPreviewItem?.(props.item);
            }}
          >
            <EyeIcon className="size-3.5" />
          </button>
        ) : null}
        {props.item.type === "skill" && props.onToggleSkill ? (
          <button
            type="button"
            className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground/70 hover:bg-muted hover:text-foreground"
            title={props.item.skill.enabled ? "Disable skill" : "Enable skill"}
            aria-label={`${props.item.skill.enabled ? "Disable" : "Enable"} ${props.item.label}`}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (props.item.type === "skill") {
                props.onToggleSkill?.(props.item);
              }
            }}
          >
            {props.item.skill.enabled ? (
              <ToggleRightIcon className="size-3.5" />
            ) : (
              <ToggleLeftIcon className="size-3.5" />
            )}
          </button>
        ) : null}
        {canPin && props.onTogglePinnedItem ? (
          <button
            type="button"
            className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground/70 hover:bg-muted hover:text-foreground"
            title={props.isPinned ? "Unpin" : "Pin"}
            aria-label={`${props.isPinned ? "Unpin" : "Pin"} ${props.item.label}`}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              props.onTogglePinnedItem?.(props.item);
            }}
          >
            {props.isPinned ? (
              <PinOffIcon className="size-3.5" />
            ) : (
              <PinIcon className="size-3.5" />
            )}
          </button>
        ) : null}
      </span>
    </CommandItem>
  );
});
