// @effect-diagnostics nodeBuiltinImport:off globalTimers:off - E2E preflight probes external host tools.
import * as NodeChildProcess from "node:child_process";

export interface PreflightResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly magicDnsName?: string;
}

function runCommand(
  command: string,
  args: readonly string[],
  timeoutMs = 10_000,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = NodeChildProcess.spawn(command, [...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ code: null, stdout, stderr: error.message });
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

function readMagicDnsName(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { Self?: { DNSName?: unknown } };
    const dnsName = parsed.Self?.DNSName;
    return typeof dnsName === "string" && dnsName.trim() ? dnsName.replace(/\.$/u, "") : null;
  } catch {
    return null;
  }
}

export async function preflightTailscale(): Promise<PreflightResult> {
  const status = await runCommand("tailscale", ["status", "--json"]);
  if (status.code !== 0) {
    return {
      ok: false,
      reason: status.stderr.trim() || "tailscale status --json failed.",
    };
  }
  const magicDnsName = readMagicDnsName(status.stdout);
  if (!magicDnsName) {
    return {
      ok: false,
      reason: "tailscale status did not report a MagicDNS name.",
    };
  }
  return { ok: true, magicDnsName };
}

export async function requireTailscaleMutationAllowed(): Promise<PreflightResult> {
  const tailscale = await preflightTailscale();
  if (!tailscale.ok) return tailscale;
  if (process.env.T3CODE_E2E_ALLOW_TAILSCALE_MUTATION !== "1") {
    return {
      ok: false,
      reason: "Set T3CODE_E2E_ALLOW_TAILSCALE_MUTATION=1 to run Tailscale Serve mutation tests.",
    };
  }
  return tailscale;
}

export function providerRunAllowed(): PreflightResult {
  if (process.env.T3CODE_E2E_ALLOW_PROVIDER_RUN !== "1") {
    return {
      ok: false,
      reason: "Set T3CODE_E2E_ALLOW_PROVIDER_RUN=1 to run real provider tests.",
    };
  }
  return { ok: true };
}

export function skipOrFailForPreflight(result: PreflightResult): void {
  if (result.ok) return;
  if (process.env.T3CODE_E2E_REQUIRE_EXTERNALS === "1") {
    throw new Error(result.reason ?? "External E2E preflight failed.");
  }
}
