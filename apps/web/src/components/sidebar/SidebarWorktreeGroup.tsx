import * as React from "react";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import type { SidebarWorktreeNode } from "../../sidebarWorktreeGrouping";
import type { SidebarThreadSummary } from "../../types";

export interface SidebarWorktreeGroupProps {
  node: SidebarWorktreeNode;
  initiallyOpen?: boolean;
  renderThreadRow: (thread: SidebarThreadSummary) => React.ReactNode;
}

export function SidebarWorktreeGroup({
  node,
  initiallyOpen = true,
  renderThreadRow,
}: SidebarWorktreeGroupProps) {
  const [open, setOpen] = React.useState(initiallyOpen);

  return (
    <div data-worktree-id={node.id}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="group/worktree-header relative flex h-8 w-full cursor-pointer items-center gap-1.5 rounded-md px-2 text-left text-xs text-muted-foreground/80 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
      >
        <ChevronRightIcon
          className={cn(
            "-ml-0.5 size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150",
            open && "rotate-90",
          )}
        />
        <span className="truncate text-xs font-medium text-foreground/90">{node.displayLabel}</span>
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
