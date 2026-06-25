import type {
  EditorId,
  EnvironmentId,
  ProjectAgentFileDescriptor,
  ProjectAgentFileKind,
  ProjectAgentSecretStatus,
} from "@t3tools/contracts";
import { getAgentFileTemplate } from "@t3tools/shared/agentFiles";
import {
  BotIcon,
  CheckIcon,
  FileTextIcon,
  KeyRoundIcon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import { type ReactElement, type ReactNode, useEffect, useMemo, useState } from "react";

import { usePreferredEditor } from "~/editorPreferences";
import { ensureEnvironmentApi } from "~/environmentApi";
import { ensureLocalApi } from "~/localApi";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  refreshProjectAgentFilesQueries,
  useProjectAgentFileReadQuery,
  useProjectAgentFilesListQuery,
} from "./projectAgentFilesQueryState";

type AgentFilesTab = "files" | "harness" | "auth" | "memory";

interface ProjectAgentFilesSheetProps {
  readonly environmentId: EnvironmentId;
  readonly projectName: string;
  readonly projectRoot: string;
  readonly availableEditors: ReadonlyArray<EditorId>;
  readonly trigger: ReactElement;
}

const TAB_LABELS: Record<AgentFilesTab, string> = {
  files: "Files",
  harness: "Harness",
  auth: "MCP/Auth",
  memory: "Memory",
};

const KIND_GROUPS: ReadonlyArray<{
  readonly label: string;
  readonly kinds: readonly ProjectAgentFileKind[];
}> = [
  { label: "Instructions", kinds: ["instructions"] },
  { label: "Provider Rules", kinds: ["provider-rule", "provider-settings"] },
  { label: "MCP/Settings", kinds: ["mcp-config", "harness-manifest"] },
  {
    label: "Harness",
    kinds: ["harness-context", "validation", "script", "skill", "template"],
  },
  { label: "Memory/Artifacts", kinds: ["memory", "loop", "artifact"] },
  { label: "Other", kinds: ["other"] },
];

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
}

function displayUpdatedAt(updatedAt: string | undefined): string {
  if (!updatedAt) return "";
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function providerLabel(provider: string): string {
  switch (provider) {
    case "opencode":
      return "OpenCode";
    case "copilot":
      return "Copilot";
    case "t3":
      return "T3";
    default:
      return provider.charAt(0).toUpperCase() + provider.slice(1);
  }
}

function fileSort(left: ProjectAgentFileDescriptor, right: ProjectAgentFileDescriptor): number {
  if (left.status === "missing" && right.status !== "missing") return 1;
  if (left.status !== "missing" && right.status === "missing") return -1;
  return left.relativePath.localeCompare(right.relativePath);
}

function joinProjectPath(projectRoot: string, relativePath: string): string {
  return `${projectRoot.replace(/[\\/]$/u, "")}/${relativePath}`;
}

function TabButton({
  active,
  children,
  onClick,
}: {
  readonly active: boolean;
  readonly children: ReactNode;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "h-7 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors",
        "hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function AgentFileRow({
  file,
  selected,
  onSelect,
}: {
  readonly file: ProjectAgentFileDescriptor;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border px-2 py-1.5 text-left",
        "hover:border-border hover:bg-accent/60",
        selected ? "border-primary/40 bg-primary/5" : "border-transparent",
      )}
      onClick={onSelect}
    >
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-foreground">
          {file.relativePath}
        </span>
        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
          {file.providers.map((provider) => (
            <Badge key={provider} size="sm" variant="outline">
              {providerLabel(provider)}
            </Badge>
          ))}
          {file.autoLoaded ? (
            <Badge size="sm" variant="success">
              default
            </Badge>
          ) : null}
          {file.status === "missing" ? (
            <Badge size="sm" variant="warning">
              missing
            </Badge>
          ) : null}
          {file.status === "invalid" ? (
            <Badge size="sm" variant="error">
              invalid
            </Badge>
          ) : null}
        </span>
      </span>
      <span className="text-[0.625rem] text-muted-foreground">{formatBytes(file.byteLength)}</span>
    </button>
  );
}

function AgentFileGroups({
  files,
  selectedPath,
  onSelect,
}: {
  readonly files: readonly ProjectAgentFileDescriptor[];
  readonly selectedPath: string | null;
  readonly onSelect: (file: ProjectAgentFileDescriptor) => void;
}) {
  return (
    <div className="min-h-0 overflow-auto px-2 pb-3">
      {KIND_GROUPS.map((group) => {
        const groupFiles = files
          .filter((file) => group.kinds.includes(file.kind))
          .toSorted(fileSort);
        if (groupFiles.length === 0) return null;
        return (
          <section key={group.label} className="py-2">
            <div className="mb-1 px-1 text-[0.625rem] font-semibold uppercase tracking-normal text-muted-foreground">
              {group.label}
            </div>
            <div className="space-y-1">
              {groupFiles.map((file) => (
                <AgentFileRow
                  key={file.relativePath}
                  file={file}
                  selected={selectedPath === file.relativePath}
                  onSelect={() => onSelect(file)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SecretRow({
  status,
  value,
  pending,
  onChange,
  onSave,
  onDelete,
}: {
  readonly status: ProjectAgentSecretStatus;
  readonly value: string;
  readonly pending: boolean;
  readonly onChange: (value: string) => void;
  readonly onSave: () => void;
  readonly onDelete: () => void;
}) {
  const usages = [...status.mcpServerIds, ...(status.toolIds ?? [])];
  return (
    <div className="rounded-md border border-border p-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-foreground">{status.secretRef}</div>
          <div className="mt-1 truncate text-[0.625rem] text-muted-foreground">
            {usages.length > 0 ? usages.join(", ") : "No manifest usage"}
          </div>
        </div>
        <Badge size="sm" variant={status.configured ? "success" : "warning"}>
          {status.configured ? "configured" : "missing"}
        </Badge>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="password"
          value={value}
          placeholder="Secret value"
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          size="xs"
          variant="outline"
          disabled={pending || value.length === 0}
          onClick={onSave}
        >
          <SaveIcon className="size-3.5" />
          Save
        </Button>
        <Button
          size="icon-xs"
          variant="destructive-outline"
          disabled={pending || !status.configured}
          aria-label={`Delete ${status.secretRef}`}
          onClick={onDelete}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function ProjectAgentFilesSheet({
  environmentId,
  projectName,
  projectRoot,
  availableEditors,
  trigger,
}: ProjectAgentFilesSheetProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AgentFilesTab>("files");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draftContents, setDraftContents] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [preferredEditor] = usePreferredEditor(availableEditors);
  const listQuery = useProjectAgentFilesListQuery(environmentId, projectRoot);
  const files = listQuery.data?.files ?? [];
  const selectedFile =
    files.find((file) => file.relativePath === selectedPath) ??
    files.find((file) => file.status === "present") ??
    files[0] ??
    null;
  const readQuery = useProjectAgentFileReadQuery(
    environmentId,
    projectRoot,
    selectedFile?.status === "present" || selectedFile?.status === "invalid"
      ? selectedFile.relativePath
      : null,
  );

  useEffect(() => {
    if (!open) return;
    if (!selectedPath && files.length > 0) {
      setSelectedPath(selectedFile?.relativePath ?? files[0]?.relativePath ?? null);
    }
  }, [files, open, selectedFile?.relativePath, selectedPath]);

  useEffect(() => {
    if (!selectedFile) {
      setDraftContents("");
      setDirty(false);
      return;
    }
    if (selectedFile.status === "missing") {
      const templateContents = selectedFile.templateId
        ? (getAgentFileTemplate(selectedFile.templateId)?.contents ?? "")
        : "";
      setDraftContents(templateContents);
      setDirty(false);
      return;
    }
    if (readQuery.data?.file.relativePath === selectedFile.relativePath) {
      setDraftContents(readQuery.data.contents);
      setDirty(false);
    }
  }, [readQuery.data, selectedFile]);

  const memoryFiles = useMemo(
    () =>
      files
        .filter(
          (file) => file.kind === "memory" || file.kind === "artifact" || file.kind === "loop",
        )
        .toSorted(fileSort),
    [files],
  );

  const refresh = (relativePath?: string | null) => {
    refreshProjectAgentFilesQueries({
      environmentId,
      cwd: projectRoot,
      ...(relativePath !== undefined ? { relativePath } : {}),
    });
    listQuery.refresh();
    if (relativePath) readQuery.refresh();
  };

  const runMutation = async (label: string, fn: () => Promise<void>) => {
    setPendingAction(label);
    setNotice(null);
    try {
      await fn();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPendingAction(null);
    }
  };

  const saveSelectedFile = async () => {
    if (!selectedFile) return;
    await runMutation("save-file", async () => {
      await ensureEnvironmentApi(environmentId).projects.writeAgentFile({
        cwd: projectRoot,
        relativePath: selectedFile.relativePath,
        contents: draftContents,
        mode: selectedFile.status === "missing" ? "create" : "update",
      });
      setDirty(false);
      refresh(selectedFile.relativePath);
      setNotice(
        selectedFile.status === "missing"
          ? `Created ${selectedFile.relativePath}`
          : `Saved ${selectedFile.relativePath}`,
      );
    });
  };

  const deleteSelectedFile = async () => {
    if (!selectedFile) return;
    const confirmed = await ensureLocalApi().dialogs.confirm(
      `Delete ${selectedFile.relativePath}? This cannot be undone by T3 Code.`,
    );
    if (!confirmed) return;
    await runMutation("delete-file", async () => {
      await ensureEnvironmentApi(environmentId).projects.deleteAgentFile({
        cwd: projectRoot,
        relativePath: selectedFile.relativePath,
      });
      setSelectedPath(null);
      refresh(null);
      setNotice(`Deleted ${selectedFile.relativePath}`);
    });
  };

  const scaffoldHarness = async () => {
    const confirmed = await ensureLocalApi().dialogs.confirm(
      "Create missing .agents harness files? Existing files will not be overwritten.",
    );
    if (!confirmed) return;
    await runMutation("scaffold", async () => {
      const result = await ensureEnvironmentApi(environmentId).projects.scaffoldAgentHarness({
        cwd: projectRoot,
      });
      refresh(null);
      setNotice(`Created ${result.created.length}; skipped ${result.skipped.length}.`);
    });
  };

  const openSelectedFileInEditor = async () => {
    if (!selectedFile || !preferredEditor) return;
    await ensureLocalApi().shell.openInEditor(
      joinProjectPath(projectRoot, selectedFile.relativePath),
      preferredEditor,
    );
  };

  const saveSecret = async (status: ProjectAgentSecretStatus) => {
    const value = secretDrafts[status.secretRef] ?? "";
    if (!value) return;
    await runMutation(`secret:${status.secretRef}`, async () => {
      await ensureEnvironmentApi(environmentId).projects.writeAgentSecret({
        cwd: projectRoot,
        secretRef: status.secretRef,
        value,
      });
      setSecretDrafts((current) => ({ ...current, [status.secretRef]: "" }));
      refresh(null);
      setNotice(`Updated ${status.secretRef}`);
    });
  };

  const deleteSecret = async (status: ProjectAgentSecretStatus) => {
    const confirmed = await ensureLocalApi().dialogs.confirm(`Delete secret ${status.secretRef}?`);
    if (!confirmed) return;
    await runMutation(`secret:${status.secretRef}`, async () => {
      await ensureEnvironmentApi(environmentId).projects.deleteAgentSecret({
        cwd: projectRoot,
        secretRef: status.secretRef,
      });
      refresh(null);
      setNotice(`Deleted ${status.secretRef}`);
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger} />
      <SheetPopup side="right" className="w-[min(96vw,980px)] max-w-none">
        <SheetHeader className="border-b border-border p-4">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="truncate text-base">Agent Files</SheetTitle>
              <SheetDescription className="mt-1 truncate">
                {projectName} · {projectRoot}
              </SheetDescription>
            </div>
            <Button
              size="xs"
              variant="outline"
              disabled={pendingAction !== null}
              onClick={scaffoldHarness}
            >
              {pendingAction === "scaffold" ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <PlusIcon className="size-3.5" />
              )}
              Scaffold
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1">
            {(Object.keys(TAB_LABELS) as AgentFilesTab[]).map((tabId) => (
              <TabButton key={tabId} active={tab === tabId} onClick={() => setTab(tabId)}>
                {TAB_LABELS[tabId]}
              </TabButton>
            ))}
          </div>
        </SheetHeader>
        <SheetPanel className="flex h-full min-h-0 flex-col p-0">
          {notice ? (
            <div
              className={cn(
                "border-b px-4 py-2 text-xs",
                notice.startsWith("Created") ||
                  notice.startsWith("Saved") ||
                  notice.startsWith("Updated")
                  ? "border-success/20 bg-success/8 text-success-foreground"
                  : "border-destructive/20 bg-destructive/8 text-destructive-foreground",
              )}
            >
              {notice}
            </div>
          ) : null}
          {listQuery.error ? (
            <div className="border-b border-destructive/20 bg-destructive/8 px-4 py-2 text-xs text-destructive-foreground">
              {listQuery.error}
            </div>
          ) : null}
          {listQuery.data?.warnings.map((warning) => (
            <div
              key={warning}
              className="border-b border-warning/20 bg-warning/8 px-4 py-2 text-xs text-warning-foreground"
            >
              {warning}
            </div>
          ))}
          {tab === "files" ? (
            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(260px,340px)_1fr]">
              <div className="min-h-0 border-b border-border md:border-b-0 md:border-r">
                {listQuery.isPending && files.length === 0 ? (
                  <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
                    <Loader2Icon className="size-3.5 animate-spin" />
                    Loading agent files
                  </div>
                ) : (
                  <AgentFileGroups
                    files={files}
                    selectedPath={selectedFile?.relativePath ?? selectedPath}
                    onSelect={(file) => setSelectedPath(file.relativePath)}
                  />
                )}
              </div>
              <div className="flex min-h-0 flex-col">
                {selectedFile ? (
                  <>
                    <div className="border-b border-border p-3">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">
                            {selectedFile.relativePath}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {selectedFile.description}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            <Badge size="sm" variant="outline">
                              {selectedFile.kind}
                            </Badge>
                            {selectedFile.autoLoaded ? (
                              <Badge size="sm" variant="success">
                                default
                              </Badge>
                            ) : null}
                            {selectedFile.updatedAt ? (
                              <Badge size="sm" variant="outline">
                                {displayUpdatedAt(selectedFile.updatedAt)}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  size="icon-xs"
                                  variant="outline"
                                  disabled={!preferredEditor || selectedFile.status === "missing"}
                                  aria-label="Open in editor"
                                  onClick={openSelectedFileInEditor}
                                >
                                  <FileTextIcon className="size-3.5" />
                                </Button>
                              }
                            />
                            <TooltipPopup>Open in editor</TooltipPopup>
                          </Tooltip>
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={
                              pendingAction !== null ||
                              !selectedFile.editable ||
                              (!dirty && selectedFile.status !== "missing")
                            }
                            onClick={saveSelectedFile}
                          >
                            {pendingAction === "save-file" ? (
                              <Loader2Icon className="size-3.5 animate-spin" />
                            ) : selectedFile.status === "missing" ? (
                              <PlusIcon className="size-3.5" />
                            ) : (
                              <SaveIcon className="size-3.5" />
                            )}
                            {selectedFile.status === "missing" ? "Create" : "Save"}
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="destructive-outline"
                            disabled={
                              pendingAction !== null ||
                              !selectedFile.deletable ||
                              selectedFile.status === "missing"
                            }
                            aria-label="Delete agent file"
                            onClick={deleteSelectedFile}
                          >
                            <Trash2Icon className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <textarea
                      className="min-h-[360px] flex-1 resize-none bg-background p-3 font-mono text-xs leading-5 outline-none"
                      spellCheck={false}
                      value={draftContents}
                      onChange={(event) => {
                        setDraftContents(event.target.value);
                        setDirty(true);
                      }}
                    />
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                    No agent file selected.
                  </div>
                )}
              </div>
            </div>
          ) : null}
          {tab === "harness" ? (
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border p-3">
                  <div className="text-xs font-medium text-foreground">Canonical instructions</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {listQuery.data?.manifest?.canonicalInstructions ?? "AGENTS.md"}
                  </div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-xs font-medium text-foreground">Required commands</div>
                  <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                    {(listQuery.data?.manifest?.validation.requiredCommands ?? []).length > 0
                      ? listQuery.data?.manifest?.validation.requiredCommands.map((command) => (
                          <code key={command} className="block truncate">
                            {command}
                          </code>
                        ))
                      : "No commands declared"}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {tab === "auth" ? (
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <KeyRoundIcon className="size-4 text-muted-foreground" />
                Project Secrets
              </div>
              <div className="space-y-2">
                {(listQuery.data?.secretStatuses ?? []).length > 0 ? (
                  listQuery.data?.secretStatuses.map((status) => (
                    <SecretRow
                      key={status.secretRef}
                      status={status}
                      value={secretDrafts[status.secretRef] ?? ""}
                      pending={pendingAction === `secret:${status.secretRef}`}
                      onChange={(value) =>
                        setSecretDrafts((current) => ({
                          ...current,
                          [status.secretRef]: value,
                        }))
                      }
                      onSave={() => void saveSecret(status)}
                      onDelete={() => void deleteSecret(status)}
                    />
                  ))
                ) : (
                  <div className="rounded-md border border-border p-4 text-xs text-muted-foreground">
                    No project secret refs declared in the harness manifest.
                  </div>
                )}
              </div>
            </div>
          ) : null}
          {tab === "memory" ? (
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <BotIcon className="size-4 text-muted-foreground" />
                Memory And Artifacts
              </div>
              <div className="space-y-2">
                {memoryFiles.length > 0 ? (
                  memoryFiles.map((file) => (
                    <button
                      key={file.relativePath}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-md border border-border p-2 text-left hover:bg-accent/50"
                      onClick={() => {
                        setSelectedPath(file.relativePath);
                        setTab("files");
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-foreground">
                          {file.relativePath}
                        </span>
                        <span className="block truncate text-[0.625rem] text-muted-foreground">
                          {file.description}
                        </span>
                      </span>
                      {file.status === "present" ? (
                        <CheckIcon className="size-3.5 text-success-foreground" />
                      ) : (
                        <PlusIcon className="size-3.5 text-muted-foreground" />
                      )}
                    </button>
                  ))
                ) : (
                  <div className="rounded-md border border-border p-4 text-xs text-muted-foreground">
                    No memory or artifact files found.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  );
}
