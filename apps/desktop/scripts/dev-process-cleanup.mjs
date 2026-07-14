import * as NodeChildProcess from "node:child_process";

export function cleanupDarwinDevProcesses({
  devRootArg,
  signal,
  spawnSync = NodeChildProcess.spawnSync,
}) {
  const matches = spawnSync("pgrep", ["-f", "--", devRootArg], { encoding: "utf8" });
  if (matches.status === 0 && typeof matches.stdout === "string") {
    for (const pid of matches.stdout.split("\n").map((value) => value.trim())) {
      if (!/^\d+$/u.test(pid)) {
        continue;
      }
      spawnSync("pkill", [`-${signal}`, "-P", pid], { stdio: "ignore" });
    }
  }

  spawnSync("pkill", [`-${signal}`, "-f", "--", devRootArg], { stdio: "ignore" });
}
