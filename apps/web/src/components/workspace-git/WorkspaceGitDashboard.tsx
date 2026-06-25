import type {
  EnvironmentId,
  GitStackedAction,
  WorkspaceGitRepositorySnapshot,
  WorkspaceGitSnapshotResult,
  WorkspaceGitWorktreeSnapshot,
} from "@t3tools/contracts";
import {
  CircleAlertIcon,
  CloudUploadIcon,
  FolderGit2Icon,
  GitBranchIcon,
  GitCommitIcon,
  RefreshCwIcon,
} from "lucide-react";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { readEnvironmentConnection } from "~/environments/runtime";
import { useIsMobile } from "~/hooks/useMediaQuery";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Textarea } from "~/components/ui/textarea";
import { Toggle, ToggleGroup } from "~/components/ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn, randomUUID } from "~/lib/utils";

import {
  type WorkspaceGitTab,
  resolveWorkspaceGitActionDisabledReason,
  summarizeWorkspaceGitSnapshot,
  visibleChangedFiles,
} from "./WorkspaceGitDashboard.logic";

interface WorkspaceGitDashboardProps {
  readonly environmentId: EnvironmentId | null;
  readonly projectRoot: string | null;
  readonly trigger: ReactElement;
}

interface PendingAction {
  readonly worktree: WorkspaceGitWorktreeSnapshot;
  readonly action: Extract<GitStackedAction, "commit" | "commit_push">;
}

function shortPath(path: string, rootPath: string | null): string {
  if (rootPath && path.startsWith(`${rootPath}/`)) {
    return path.slice(rootPath.length + 1);
  }
  return path;
}

function StatusBadge({ worktree }: { readonly worktree: WorkspaceGitWorktreeSnapshot }) {
  if (worktree.statusError) {
    return (
      <Badge variant="outline" className="border-destructive/40 text-destructive">
        Error
      </Badge>
    );
  }
  if (worktree.hasUncommittedChanges) {
    return (
      <Badge variant="outline" className="border-amber-500/40 text-amber-700">
        Dirty
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-emerald-500/40 text-emerald-700">
      Clean
    </Badge>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="text-[10px] font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ActionButton({
  children,
  disabledReason,
  icon,
  onClick,
}: {
  readonly children: ReactNode;
  readonly disabledReason: string | null;
  readonly icon: ReactNode;
  readonly onClick: () => void;
}) {
  const button = (
    <Button
      type="button"
      variant="outline"
      size="xs"
      disabled={disabledReason !== null}
      onClick={onClick}
      className="shrink-0"
    >
      {icon}
      <span>{children}</span>
    </Button>
  );

  if (!disabledReason) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{button}</TooltipTrigger>
      <TooltipPopup side="bottom">{disabledReason}</TooltipPopup>
    </Tooltip>
  );
}

function WorktreeChanges({ worktree }: { readonly worktree: WorkspaceGitWorktreeSnapshot }) {
  const visible = visibleChangedFiles(worktree);
  if (worktree.changedFiles.length === 0) {
    return <div className="py-4 text-sm text-muted-foreground">No uncommitted file changes.</div>;
  }
  return (
    <div className="space-y-1">
      {visible.files.map((file) => (
        <div
          key={`${file.indexStatus}:${file.worktreeStatus}:${file.path}`}
          className="grid min-h-8 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 rounded-md border border-border/70 bg-background px-2.5 text-xs"
        >
          <span className="font-mono text-muted-foreground">
            {file.indexStatus}
            {file.worktreeStatus}
          </span>
          <span className="truncate font-mono text-foreground" title={file.path}>
            {file.path}
          </span>
        </div>
      ))}
      {visible.hiddenCount > 0 ? (
        <div className="px-2.5 py-1 text-xs text-muted-foreground">+{visible.hiddenCount} more</div>
      ) : null}
    </div>
  );
}

function WorktreeCommits({ worktree }: { readonly worktree: WorkspaceGitWorktreeSnapshot }) {
  if (worktree.recentCommits.length === 0) {
    return <div className="py-4 text-sm text-muted-foreground">No recent commits found.</div>;
  }
  return (
    <div className="space-y-1">
      {worktree.recentCommits.map((commit) => (
        <div
          key={commit.sha}
          className="grid min-h-10 grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border/70 bg-background px-2.5 text-xs"
        >
          <span className="font-mono text-muted-foreground">{commit.shortSha}</span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-foreground" title={commit.subject}>
              {commit.subject || "(no subject)"}
            </span>
            <span className="block truncate text-muted-foreground">
              {commit.authorName} - {commit.relativeDate}
            </span>
          </span>
          <Badge variant="outline" className="text-[10px]">
            {commit.pushed === null ? "Unknown" : commit.pushed ? "Pushed" : "Unpushed"}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function WorktreeRow({
  busy,
  onAction,
  onRefresh,
  repository,
  rootPath,
  tab,
  worktree,
}: {
  readonly busy: boolean;
  readonly onAction: (
    worktree: WorkspaceGitWorktreeSnapshot,
    action: Extract<GitStackedAction, "commit" | "push" | "commit_push">,
  ) => void;
  readonly onRefresh: () => void;
  readonly repository: WorkspaceGitRepositorySnapshot;
  readonly rootPath: string | null;
  readonly tab: WorkspaceGitTab;
  readonly worktree: WorkspaceGitWorktreeSnapshot;
}) {
  const hasRemote = repository.remotes.length > 0;
  const pushReason = resolveWorkspaceGitActionDisabledReason(worktree, "push", busy, hasRemote);
  const commitReason = resolveWorkspaceGitActionDisabledReason(worktree, "commit", busy, hasRemote);
  const commitPushReason = resolveWorkspaceGitActionDisabledReason(
    worktree,
    "commit_push",
    busy,
    hasRemote,
  );

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <FolderGit2Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-semibold text-foreground" title={worktree.path}>
              {worktree.label}
            </span>
            <StatusBadge worktree={worktree} />
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
            {shortPath(worktree.path, rootPath)}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <Button type="button" variant="outline" size="xs" onClick={onRefresh} disabled={busy}>
            <RefreshCwIcon className={cn("size-3", busy && "animate-spin")} />
            <span>Refresh</span>
          </Button>
          <ActionButton
            disabledReason={commitReason}
            icon={<GitCommitIcon className="size-3" />}
            onClick={() => onAction(worktree, "commit")}
          >
            Commit
          </ActionButton>
          <ActionButton
            disabledReason={pushReason}
            icon={<CloudUploadIcon className="size-3" />}
            onClick={() => onAction(worktree, "push")}
          >
            Push
          </ActionButton>
          <ActionButton
            disabledReason={commitPushReason}
            icon={<CloudUploadIcon className="size-3" />}
            onClick={() => onAction(worktree, "commit_push")}
          >
            Commit & Push
          </ActionButton>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0 rounded-md bg-muted/30 px-2.5 py-2">
          <div className="text-muted-foreground">Branch</div>
          <div className="truncate font-medium text-foreground">
            {worktree.branch ?? `Detached ${worktree.headSha?.slice(0, 7) ?? ""}`}
          </div>
        </div>
        <div className="min-w-0 rounded-md bg-muted/30 px-2.5 py-2">
          <div className="text-muted-foreground">Upstream</div>
          <div className="truncate font-medium text-foreground">{worktree.upstream ?? "None"}</div>
        </div>
        <div className="min-w-0 rounded-md bg-muted/30 px-2.5 py-2">
          <div className="text-muted-foreground">Ahead / Behind</div>
          <div className="font-medium text-foreground">
            {worktree.aheadCount} / {worktree.behindCount}
          </div>
        </div>
        <div className="min-w-0 rounded-md bg-muted/30 px-2.5 py-2">
          <div className="text-muted-foreground">Changes</div>
          <div className="font-medium text-foreground">
            {worktree.stagedCount} staged / {worktree.unstagedCount} unstaged /{" "}
            {worktree.untrackedCount} new
          </div>
        </div>
      </div>

      {worktree.statusError ? (
        <div className="mt-3 flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-words">{worktree.statusError}</span>
        </div>
      ) : null}

      {tab === "overview" ? (
        <div className="mt-3 truncate text-xs text-muted-foreground">
          {worktree.headSha ? (
            <>
              <span className="font-mono">{worktree.headSha.slice(0, 7)}</span>
              {worktree.headSubject ? ` - ${worktree.headSubject}` : ""}
            </>
          ) : (
            "No HEAD commit"
          )}
        </div>
      ) : null}
      {tab === "changes" ? (
        <div className="mt-3">
          <WorktreeChanges worktree={worktree} />
        </div>
      ) : null}
      {tab === "commits" ? (
        <div className="mt-3">
          <WorktreeCommits worktree={worktree} />
        </div>
      ) : null}
    </div>
  );
}

function DashboardContent({
  actionError,
  busyWorktreePath,
  environmentId,
  error,
  loading,
  onAction,
  onRefresh,
  snapshot,
}: {
  readonly actionError: string | null;
  readonly busyWorktreePath: string | null;
  readonly environmentId: EnvironmentId | null;
  readonly error: string | null;
  readonly loading: boolean;
  readonly onAction: (
    worktree: WorkspaceGitWorktreeSnapshot,
    action: Extract<GitStackedAction, "commit" | "push" | "commit_push">,
  ) => void;
  readonly onRefresh: () => void;
  readonly snapshot: WorkspaceGitSnapshotResult | null;
}) {
  const [tab, setTab] = useState<WorkspaceGitTab>("overview");
  const summary = useMemo(() => summarizeWorkspaceGitSnapshot(snapshot), [snapshot]);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <GitBranchIcon className="size-4 text-muted-foreground" />
            Project Git
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
            {snapshot?.rootPath ?? "Loading project root..."}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={onRefresh}
          disabled={loading || environmentId === null}
        >
          <RefreshCwIcon className={cn("size-3", loading && "animate-spin")} />
          <span>Refresh</span>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-5">
        <Metric label="Repos" value={summary.repositoryCount} />
        <Metric label="Worktrees" value={summary.worktreeCount} />
        <Metric label="Dirty" value={summary.dirtyWorktreeCount} />
        <Metric label="Ahead" value={summary.aheadWorktreeCount} />
        <Metric label="Behind" value={summary.behindWorktreeCount} />
      </div>

      <div className="flex items-center justify-between gap-3 border-y border-border px-4 py-2">
        <ToggleGroup
          aria-label="Workspace Git view"
          value={[tab]}
          onValueChange={(value) => {
            const next = value[0];
            if (next === "overview" || next === "changes" || next === "commits") {
              setTab(next);
            }
          }}
          size="xs"
          variant="outline"
        >
          <Toggle value="overview">Overview</Toggle>
          <Toggle value="changes">Changes</Toggle>
          <Toggle value="commits">Commits</Toggle>
        </ToggleGroup>
      </div>

      {error ? (
        <div className="mx-4 mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {actionError ? (
        <div className="mx-4 mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {loading && !snapshot ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Loading repositories...
            </div>
          ) : null}
          {!loading && snapshot?.repositories.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No Git repositories found under this project root.
            </div>
          ) : null}
          {snapshot?.repositories.map((repository) => (
            <section key={repository.id} className="space-y-2">
              <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {repository.label}
                  </h3>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">
                    {shortPath(repository.rootPath, snapshot.rootPath)}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  {repository.remotes.length === 0 ? (
                    <Badge variant="outline">No remote</Badge>
                  ) : (
                    repository.remotes.slice(0, 2).map((remote) => (
                      <Badge key={remote.name} variant="outline">
                        {remote.name}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {repository.worktrees.map((worktree) => (
                  <WorktreeRow
                    key={worktree.id}
                    busy={busyWorktreePath === worktree.path}
                    onAction={onAction}
                    onRefresh={onRefresh}
                    repository={repository}
                    rootPath={snapshot.rootPath}
                    tab={tab}
                    worktree={worktree}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export function WorkspaceGitDashboard({
  environmentId,
  projectRoot,
  trigger,
}: WorkspaceGitDashboardProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<WorkspaceGitSnapshotResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [busyWorktreePath, setBusyWorktreePath] = useState<string | null>(null);

  useEffect(() => {
    setSnapshot(null);
    setError(null);
    setActionError(null);
  }, [environmentId, projectRoot]);

  const refresh = useCallback(async () => {
    const rootPath = projectRoot?.trim() ?? "";
    if (environmentId === null || !rootPath) {
      setError("Project Git is unavailable until this thread has an active project root.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const connection = readEnvironmentConnection(environmentId);
      if (!connection) {
        throw new Error("Environment connection is unavailable.");
      }
      const next = await connection.client.vcs.workspaceSnapshot({ rootPath });
      setSnapshot(next);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load project Git.");
    } finally {
      setLoading(false);
    }
  }, [environmentId, projectRoot]);

  useEffect(() => {
    if (open && !snapshot && !loading) {
      void refresh();
    }
  }, [loading, open, refresh, snapshot]);

  const runAction = useCallback(
    async (worktree: WorkspaceGitWorktreeSnapshot, action: GitStackedAction, message?: string) => {
      if (environmentId === null) {
        setActionError("Environment connection is unavailable.");
        return;
      }
      const connection = readEnvironmentConnection(environmentId);
      if (!connection) {
        setActionError("Environment connection is unavailable.");
        return;
      }
      setBusyWorktreePath(worktree.path);
      setActionError(null);
      try {
        await connection.client.git.runStackedAction({
          actionId: randomUUID(),
          cwd: worktree.path,
          action,
          ...(message?.trim() ? { commitMessage: message.trim() } : {}),
        });
        await refresh();
      } catch (nextError) {
        setActionError(
          nextError instanceof Error ? nextError.message : "Project Git action failed.",
        );
      } finally {
        setBusyWorktreePath(null);
      }
    },
    [environmentId, refresh],
  );

  const openAction = useCallback(
    (
      worktree: WorkspaceGitWorktreeSnapshot,
      action: Extract<GitStackedAction, "commit" | "push" | "commit_push">,
    ) => {
      if (action === "push") {
        void runAction(worktree, action);
        return;
      }
      setCommitMessage("");
      setPendingAction({ worktree, action });
    },
    [runAction],
  );

  const content = (
    <DashboardContent
      actionError={actionError}
      busyWorktreePath={busyWorktreePath}
      environmentId={environmentId}
      error={error}
      loading={loading}
      onAction={openAction}
      onRefresh={refresh}
      snapshot={snapshot}
    />
  );

  return (
    <>
      {isMobile ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={trigger} />
          <SheetPopup side="right" className="max-w-xl">
            <SheetHeader className="sr-only">
              <SheetTitle>Project Git</SheetTitle>
              <SheetDescription>
                Repositories and worktrees under the project root.
              </SheetDescription>
            </SheetHeader>
            <SheetPanel className="flex h-full min-h-0 flex-col p-0">{content}</SheetPanel>
          </SheetPopup>
        </Sheet>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger render={trigger} />
          <PopoverPopup
            align="start"
            side="bottom"
            sideOffset={8}
            className="h-[min(760px,calc(100vh-96px))] w-[min(960px,calc(100vw-32px))] overflow-hidden p-0"
          >
            {content}
          </PopoverPopup>
        </Popover>
      )}

      <Dialog
        open={pendingAction !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingAction(null);
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {pendingAction?.action === "commit_push" ? "Commit & push" : "Commit changes"}
            </DialogTitle>
            <DialogDescription>
              {`Enter the commit message to use for ${pendingAction?.worktree.label ?? "this worktree"}.`}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <Textarea
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              placeholder="feat: describe the change"
              rows={5}
              aria-label="Commit message"
            />
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingAction(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!commitMessage.trim() || pendingAction === null}
              onClick={() => {
                if (!pendingAction) return;
                const action = pendingAction;
                setPendingAction(null);
                void runAction(action.worktree, action.action, commitMessage);
              }}
            >
              {pendingAction?.action === "commit_push" ? "Commit & Push" : "Commit"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
