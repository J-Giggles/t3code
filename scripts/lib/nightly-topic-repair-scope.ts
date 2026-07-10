import {
  runProcessCommand,
  type ProcessCommandResult,
  type RunProcessCommandOptions,
} from "./command-runner.ts";
import { localTopicRepairPaths, type LocalTopicPlugin } from "./local-topic-stack.ts";

export type RepairScopeCommandRunner = (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
  options?: RunProcessCommandOptions,
) => ProcessCommandResult;

export function resolveTopicRepairPaths(
  controlRoot: string,
  plugin: LocalTopicPlugin,
  commits: ReadonlyArray<string>,
  runner: RepairScopeCommandRunner = runProcessCommand,
): ReadonlyArray<string> {
  const paths = new Set(localTopicRepairPaths(plugin));
  for (const commit of commits) {
    const result = runner(
      "git",
      ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "-m", commit],
      controlRoot,
      { allowFailure: true },
    );
    if (result.exitCode !== 0) continue;
    for (const path of result.stdout.split(/\r?\n/u)) {
      if (path.length > 0) paths.add(path);
    }
  }
  return [...paths].sort();
}
