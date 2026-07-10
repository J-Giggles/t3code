// @effect-diagnostics nodeBuiltinImport:off - Operations scripts use synchronous child processes to keep ordered audit logs.
import * as NodeChildProcess from "node:child_process";

export interface ProcessCommandResult {
  readonly command: string;
  readonly cwd: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunProcessCommandOptions {
  readonly allowFailure?: boolean;
  readonly timeoutMs?: number;
  readonly env?: NodeJS.ProcessEnv;
  readonly input?: string;
}

export function formatProcessCommand(command: string, args: ReadonlyArray<string>): string {
  return [command, ...args].join(" ");
}

export function runProcessCommand(
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
  options: RunProcessCommandOptions = {},
): ProcessCommandResult {
  const result = NodeChildProcess.spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    ...(options.input === undefined ? {} : { input: options.input }),
    ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
    ...(options.env === undefined ? {} : { env: { ...process.env, ...options.env } }),
  });
  const exitCode = typeof result.status === "number" ? result.status : 1;
  const commandResult: ProcessCommandResult = {
    command: formatProcessCommand(command, args),
    cwd,
    exitCode,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? (result.error ? result.error.message : ""),
  };
  if (exitCode !== 0 && options.allowFailure !== true) {
    throw new Error(
      `${commandResult.command} failed with exit code ${exitCode}\n${
        commandResult.stderr || commandResult.stdout
      }`,
    );
  }
  return commandResult;
}
