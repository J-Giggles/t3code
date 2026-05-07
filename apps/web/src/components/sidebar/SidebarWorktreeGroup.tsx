import * as React from "react";
import { ChevronRightIcon, SquarePenIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import type { SidebarWorktreeNode } from "../../sidebarWorktreeGrouping";
import type { SidebarThreadSummary } from "../../types";

export interface SidebarWorktreeGroupProps {
  node: SidebarWorktreeNode;
  initiallyOpen?: boolean;
  renderThreadRow: (thread: SidebarThreadSummary) => React.ReactNode;
  onCreateThread?: (node: SidebarWorktreeNode) => void;
}

export function SidebarWorktreeGroup({
  node,
  initiallyOpen = true,
  renderThreadRow,
  onCreateThread,
}: SidebarWorktreeGroupProps) {
  const [open, setOpen] = React.useState(initiallyOpen);
  const createLabel = `Create new thread on ${node.displayLabel}`;

  return (
    <div data-worktree-id={node.id}>
      <div className="group/worktree-header flex h-8 items-center gap-1 rounded-md transition-colors hover:bg-secondary focus-within:bg-secondary">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="relative flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-2 text-left text-xs text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
        >
          <ChevronRightIcon
            className={cn(
              "-ml-0.5 size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150",
              open && "rotate-90",
            )}
          />
          <span className="truncate text-xs font-medium text-foreground/90">
            {node.displayLabel}
          </span>
          {node.branch && node.branch !== node.displayLabel && (
            <span className="shrink-0 truncate text-[10px] text-muted-foreground/60">
              {node.branch}
            </span>
          )}
          {node.threads.length > 0 && (
            <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
              {node.threads.length}
            </span>
          )}
        </button>
        {onCreateThread && (
          <button
            type="button"
            aria-label={createLabel}
            className="mr-1 inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-opacity hover:bg-background/80 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring group-hover/worktree-header:opacity-100 group-focus-within/worktree-header:opacity-100"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onCreateThread(node);
            }}
          >
            <SquarePenIcon className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      {open && (
        <ul className="mt-0.5 space-y-px">
          {node.threads.map((t) => (
            <li key={t.id}>{renderThreadRow(t)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
