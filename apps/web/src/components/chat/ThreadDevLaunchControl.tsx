import {
  type DesktopDevLaunchCollision,
  type DesktopDevLaunchLaunchInput,
  type DesktopDevLaunchRecord,
  type DesktopDevLaunchSetupInput,
  type DesktopDevLaunchState,
  type DesktopDevLaunchThreadRef,
  type EnvironmentId,
  type LocalApi,
  type ProjectDevLaunchProfile,
  type ProjectDevLaunchWarning,
  type ProjectId,
  type ThreadId,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { buildDevLaunchFailurePrompt, buildDevLaunchSetupPrompt } from "@t3tools/shared/devLaunch";
import {
  ChevronDownIcon,
  CopyIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  MonitorCogIcon,
  MonitorPlayIcon,
  PlayIcon,
  SquareIcon,
} from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";

import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { useSettings } from "~/hooks/useSettings";
import { readLocalApi } from "~/localApi";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

function readCollision(error: unknown): DesktopDevLaunchCollision | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "collision" in error &&
    typeof error.collision === "object" &&
    error.collision !== null &&
    "type" in error.collision
  ) {
    return error.collision as DesktopDevLaunchCollision;
  }
  return null;
}

export function describeDevLaunchCollision(collision: DesktopDevLaunchCollision | null): string {
  if (collision === null) {
    return "Dev app launch is blocked.";
  }
  if (collision.type === "port-conflict") {
    return `Port ${collision.requestedPort} is already in use by ${collision.blocking.profileName}.`;
  }
  if (collision.type === "route-conflict") {
    return `Route ${collision.servePath} is already taken by ${collision.existingProxyUrl}.`;
  }
  return `This worktree already has ${collision.blocking.profileName} running.`;
}

type ThreadDevLaunchApi = NonNullable<LocalApi["desktop"]> | LocalApi["server"];

export function resolveThreadDevLaunchApi(
  localApi: LocalApi | undefined,
): ThreadDevLaunchApi | null {
  return localApi?.desktop ?? localApi?.server ?? null;
}

export async function openDevLaunchPublicUrl(
  localApi: LocalApi | undefined,
  state: DesktopDevLaunchState,
): Promise<void> {
  if (!state.current?.publicUrl) return;
  await localApi?.shell.openExternal(state.current.publicUrl);
}

export async function openDevLaunchRecordUrl(
  localApi: LocalApi | undefined,
  launch: DesktopDevLaunchRecord,
): Promise<void> {
  await localApi?.shell.openExternal(launch.publicUrl);
}

export function getDevLaunchesForThread(input: {
  state: DesktopDevLaunchState | null;
  threadRef: DesktopDevLaunchThreadRef;
}): DesktopDevLaunchRecord[] {
  return (
    input.state?.active.filter(
      (launch) =>
        launch.threadRef.environmentId === input.threadRef.environmentId &&
        launch.threadRef.threadId === input.threadRef.threadId,
    ) ?? []
  );
}

export interface DevLaunchProfileRow {
  readonly profile: ProjectDevLaunchProfile;
  readonly launch: DesktopDevLaunchRecord | null;
}

export function buildDevLaunchProfileRows(input: {
  profiles: ReadonlyArray<ProjectDevLaunchProfile>;
  launches: ReadonlyArray<DesktopDevLaunchRecord>;
}): DevLaunchProfileRow[] {
  return input.profiles.map((profile) => ({
    profile,
    launch: input.launches.find((launch) => launch.profileId === profile.id) ?? null,
  }));
}

export function summarizeDevLaunchProfiles(
  profiles: ReadonlyArray<ProjectDevLaunchProfile>,
): string {
  if (profiles.length === 0) {
    return "No profiles are currently available.";
  }
  return profiles
    .map(
      (profile) =>
        `- ${profile.name} (${profile.id}): ${profile.command} in ${profile.cwd} on ${profile.host}:${profile.port}, health ${profile.healthCheckPath}`,
    )
    .join("\n");
}

export function buildDevLaunchThreadContext(input: {
  branch: string | null;
  projectRoot: string;
  worktreePath: string | null;
}): { branch: string; worktreePath: string } {
  const branch = input.branch?.trim() || "unknown";
  const worktreePath = input.worktreePath?.trim() || input.projectRoot.trim() || "unknown";
  return { branch, worktreePath };
}

export function resolveThreadDevLaunchTriggerPresentation(input: {
  profiles: ReadonlyArray<ProjectDevLaunchProfile>;
  runningCount: number;
  warnings: ReadonlyArray<ProjectDevLaunchWarning>;
}): { ariaLabel: string; tooltip: string } {
  const warning = input.warnings[0]?.message.trim();
  if (input.profiles.length === 0) {
    return {
      ariaLabel: "Set up dev app launch",
      tooltip: warning || "Set up dev app launch for this project.",
    };
  }

  if (input.runningCount > 0) {
    return {
      ariaLabel: "Manage running dev apps",
      tooltip: warning || "Manage running dev apps.",
    };
  }

  return {
    ariaLabel: "Open dev app launch menu",
    tooltip: warning || "Open dev app launch menu.",
  };
}

function DevLaunchThreadContext({
  branch,
  worktreePath,
}: {
  branch: string;
  worktreePath: string;
}) {
  return (
    <div className="grid gap-1 text-left text-xs">
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
        <span className="text-muted-foreground">Branch</span>
        <span className="min-w-0 break-all font-medium text-foreground">{branch}</span>
      </div>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
        <span className="text-muted-foreground">Worktree</span>
        <span className="min-w-0 break-all font-medium text-foreground">{worktreePath}</span>
      </div>
    </div>
  );
}

interface ThreadDevLaunchControlProps {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  projectId: ProjectId;
  projectName: string;
  projectRoot: string;
  branch: string | null;
  worktreePath: string | null;
  profiles: ReadonlyArray<ProjectDevLaunchProfile>;
  warnings: ReadonlyArray<ProjectDevLaunchWarning>;
  onOpenSetupHelper: (prompt: string) => Promise<void>;
  onOpenCollisionHelper: (prompt: string) => Promise<void>;
}

export const ThreadDevLaunchControl = memo(function ThreadDevLaunchControl(
  props: ThreadDevLaunchControlProps,
) {
  const [state, setState] = useState<DesktopDevLaunchState | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [collision, setCollision] = useState<DesktopDevLaunchCollision | null>(null);
  const [collisionPrompt, setCollisionPrompt] = useState("");
  const [failurePrompt, setFailurePrompt] = useState("");
  const [failureProfileName, setFailureProfileName] = useState("");
  const promptOverrides = useSettings((settings) => settings.promptOverrides);
  const localApi = readLocalApi();
  const devLaunchApi = resolveThreadDevLaunchApi(localApi);
  const threadRef = useMemo(
    () => scopeThreadRef(props.environmentId, props.threadId),
    [props.environmentId, props.threadId],
  );
  const threadLaunches = useMemo(
    () => getDevLaunchesForThread({ state, threadRef }),
    [state, threadRef],
  );
  const profileRows = useMemo(
    () => buildDevLaunchProfileRows({ profiles: props.profiles, launches: threadLaunches }),
    [props.profiles, threadLaunches],
  );
  const runningCount = profileRows.filter((row) => row.launch !== null).length;
  const stoppedRows = profileRows.filter((row) => row.launch === null);
  const triggerPresentation = resolveThreadDevLaunchTriggerPresentation({
    profiles: props.profiles,
    runningCount,
    warnings: props.warnings,
  });
  const threadContext = buildDevLaunchThreadContext({
    branch: props.branch,
    projectRoot: props.projectRoot,
    worktreePath: props.worktreePath,
  });
  const { copyToClipboard } = useCopyToClipboard({
    onCopy: () =>
      toastManager.add(
        stackedThreadToast({
          type: "success",
          title: "Copied to clipboard",
        }),
      ),
    onError: (error) =>
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not copy helper prompt",
          description: error instanceof Error ? error.message : "An unknown error occurred.",
        }),
      ),
  });

  useEffect(() => {
    if (!devLaunchApi) {
      setState(null);
      return;
    }
    void devLaunchApi
      .getDevLaunchState(threadRef)
      .then(setState)
      .catch(() => setState(null));
  }, [devLaunchApi, threadRef]);

  const openSetupHelper = async () => {
    const prompt = buildDevLaunchSetupPrompt(
      {
        threadRef,
        projectId: props.projectId,
        projectRoot: props.projectRoot,
        projectName: props.projectName,
        branch: props.branch,
        worktreePath: props.worktreePath,
      } satisfies DesktopDevLaunchSetupInput,
      { promptOverrides },
    );
    await props.onOpenSetupHelper(prompt);
  };

  const launchProfile = async (
    profile: ProjectDevLaunchProfile,
    options: { openAfterLaunch: boolean } = { openAfterLaunch: true },
  ): Promise<DesktopDevLaunchState | null> => {
    if (!devLaunchApi) return null;
    setIsLaunching(true);
    try {
      const next = await devLaunchApi.launchDevApp({
        threadRef,
        projectId: props.projectId,
        projectRoot: props.projectRoot,
        projectName: props.projectName,
        branch: props.branch,
        worktreePath: props.worktreePath,
        profileId: profile.id,
      } satisfies DesktopDevLaunchLaunchInput);
      setState(next);
      if (options.openAfterLaunch) {
        await openDevLaunchPublicUrl(localApi, next);
      }
      return next;
    } catch (error) {
      const nextCollision = readCollision(error);
      if (nextCollision) {
        setCollision(nextCollision);
        const prompt = await devLaunchApi.buildDevLaunchCollisionPrompt({
          collision: nextCollision,
          requestedThreadRef: threadRef,
        });
        setCollisionPrompt(prompt.prompt);
      } else {
        setFailureProfileName(profile.name);
        setFailurePrompt(
          buildDevLaunchFailurePrompt({
            setup: {
              threadRef,
              projectId: props.projectId,
              projectRoot: props.projectRoot,
              projectName: props.projectName,
              branch: props.branch,
              worktreePath: props.worktreePath,
            },
            profile,
            errorMessage: error instanceof Error ? error.message : String(error),
            remoteClientUrl: typeof window === "undefined" ? null : window.location.href,
            activeLaunches: threadLaunches,
            manifestSummary: summarizeDevLaunchProfiles(props.profiles),
            promptOverrides,
          }),
        );
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not launch dev app",
            description: error instanceof Error ? error.message : "An unknown error occurred.",
          }),
        );
      }
      return null;
    } finally {
      setIsLaunching(false);
    }
  };

  const launchAllProfiles = async () => {
    if (stoppedRows.length === 0) return;
    for (const row of stoppedRows) {
      const launched = await launchProfile(row.profile, { openAfterLaunch: false });
      if (!launched) {
        return;
      }
    }
  };

  const stopLaunch = async () => {
    if (!devLaunchApi) return;
    setIsLaunching(true);
    try {
      setState(await devLaunchApi.stopDevApp({ threadRef }));
    } catch (error) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not stop dev app",
          description: error instanceof Error ? error.message : "An unknown error occurred.",
        }),
      );
    } finally {
      setIsLaunching(false);
    }
  };

  if (!devLaunchApi) {
    return null;
  }

  if (props.profiles.length === 0) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={triggerPresentation.ariaLabel}
              disabled={isLaunching}
              size="icon-xs"
              variant="outline"
              onClick={() => void openSetupHelper()}
            >
              <MonitorCogIcon className="size-3.5" />
            </Button>
          }
        />
        <TooltipPopup side="bottom" className="max-w-80">
          {triggerPresentation.tooltip}
        </TooltipPopup>
      </Tooltip>
    );
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Menu>
              <MenuTrigger
                render={
                  <Button
                    aria-label={triggerPresentation.ariaLabel}
                    className="h-7 gap-0.5 px-1.5 sm:h-6"
                    disabled={isLaunching}
                    size="xs"
                    variant={runningCount > 0 ? "secondary" : "outline"}
                  />
                }
              >
                {isLaunching ? (
                  <LoaderCircleIcon className="size-3.5 animate-spin" />
                ) : (
                  <MonitorPlayIcon className="size-3.5" />
                )}
                <ChevronDownIcon className="size-3 text-muted-foreground/80" />
              </MenuTrigger>
              <MenuPopup
                align="end"
                className="min-w-[min(24rem,calc(100vw-1rem))] max-w-[min(26rem,calc(100vw-1rem))]"
              >
                <MenuGroup>
                  <MenuGroupLabel className="px-2 py-2">
                    <DevLaunchThreadContext
                      branch={threadContext.branch}
                      worktreePath={threadContext.worktreePath}
                    />
                  </MenuGroupLabel>
                </MenuGroup>
                <MenuSeparator />
                <MenuItem disabled={isLaunching} onClick={() => void openSetupHelper()}>
                  <MonitorCogIcon className="size-3.5" />
                  Set up launch profiles
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  disabled={stoppedRows.length === 0 || isLaunching}
                  onClick={() => void launchAllProfiles()}
                >
                  {isLaunching ? (
                    <LoaderCircleIcon className="size-3.5 animate-spin" />
                  ) : (
                    <PlayIcon className="size-3.5" />
                  )}
                  Launch all
                </MenuItem>
                {runningCount > 0 ? (
                  <MenuItem disabled={isLaunching} onClick={() => void stopLaunch()}>
                    <SquareIcon className="size-3.5" />
                    Stop all
                  </MenuItem>
                ) : null}
                <MenuSeparator />
                {profileRows.map((row) => (
                  <MenuGroup key={row.profile.id}>
                    <MenuGroupLabel className="px-2 py-1.5 normal-case">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-foreground">
                          {row.profile.name}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {row.launch ? "Running" : "Stopped"} · {row.profile.port}
                        </span>
                      </div>
                      <div className="mt-0.5 break-all font-normal text-[0.7rem] text-muted-foreground leading-snug">
                        {row.launch?.publicUrl ?? `${row.profile.host}:${row.profile.port}`}
                      </div>
                    </MenuGroupLabel>
                    {row.launch ? (
                      <>
                        <MenuItem
                          onClick={() => {
                            void openDevLaunchRecordUrl(localApi, row.launch!);
                          }}
                        >
                          <ExternalLinkIcon className="size-3.5" />
                          Open {row.profile.name}
                        </MenuItem>
                        <MenuItem
                          onClick={() => {
                            copyToClipboard(row.launch!.publicUrl);
                          }}
                        >
                          <CopyIcon className="size-3.5" />
                          Copy {row.profile.name} URL
                        </MenuItem>
                      </>
                    ) : (
                      <MenuItem
                        disabled={isLaunching}
                        onClick={() => void launchProfile(row.profile)}
                      >
                        <PlayIcon className="size-3.5" />
                        Launch {row.profile.name}
                      </MenuItem>
                    )}
                    <MenuSeparator />
                  </MenuGroup>
                ))}
              </MenuPopup>
            </Menu>
          }
        />
        <TooltipPopup side="bottom" className="max-w-96">
          <div className="grid gap-2">
            <div>{triggerPresentation.tooltip}</div>
            <DevLaunchThreadContext
              branch={threadContext.branch}
              worktreePath={threadContext.worktreePath}
            />
          </div>
        </TooltipPopup>
      </Tooltip>

      <Dialog open={collision !== null} onOpenChange={(open) => !open && setCollision(null)}>
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dev app launch blocked</DialogTitle>
            <DialogDescription>{describeDevLaunchCollision(collision)}</DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-2 text-sm">
            {collision?.type === "route-conflict" ? (
              <>
                <p>Route: {collision.servePath}</p>
                <p>Existing proxy: {collision.existingProxyUrl}</p>
                <p>Expected proxy: {collision.expectedProxyUrl}</p>
              </>
            ) : (
              <>
                <p>Worktree: {collision?.blocking.canonicalWorktreePath}</p>
                <p>Profile: {collision?.blocking.profileName}</p>
                <p>Port: {collision?.blocking.localPort}</p>
                <p>URL: {collision?.blocking.publicUrl}</p>
              </>
            )}
          </DialogPanel>
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                copyToClipboard(collisionPrompt);
              }}
            >
              Copy helper prompt
            </Button>
            <Button size="sm" onClick={() => void props.onOpenCollisionHelper(collisionPrompt)}>
              Open new worktree chat
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={failurePrompt.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setFailurePrompt("");
            setFailureProfileName("");
          }
        }}
      >
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dev app setup needs a fix</DialogTitle>
            <DialogDescription>
              {failureProfileName
                ? `${failureProfileName} did not launch cleanly. Open a setup fix chat with the failure evidence.`
                : "Open a setup fix chat with the failure evidence."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-2 text-sm">
            <p>
              The fix prompt includes the profile command, port, health check, current stack, and
              the remote Tailscale verification requirement.
            </p>
          </DialogPanel>
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                copyToClipboard(failurePrompt);
              }}
            >
              Copy fix prompt
            </Button>
            <Button size="sm" onClick={() => void props.onOpenSetupHelper(failurePrompt)}>
              Open setup fix chat
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
});
