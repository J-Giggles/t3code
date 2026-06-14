#!/usr/bin/env node
/**
 * Start/list/stop project dev servers under /workspace/code and update Caddy snippet.
 */
import * as NodeFS from "node:fs";
import * as NodeNet from "node:net";
import * as NodePath from "node:path";
import { spawn } from "node:child_process";

const CODE_ROOT = process.env.CODE_ROOT?.trim() || "/workspace/code";
const MANIFEST_PATH = NodePath.join(CODE_ROOT, ".local", "dev-servers.json");
const CADDY_SNIPPET_PATH =
  process.env.CADDY_SNIPPET_PATH?.trim() || "/etc/caddy/dev_servers_snippet";
const BASE_PORT = Number.parseInt(process.env.DEV_SERVER_BASE_PORT ?? "9100", 10);
const PUBLIC_BASE = process.env.POD_PUBLIC_BASE_URL?.trim() || "";

function readManifest() {
  if (!NodeFS.existsSync(MANIFEST_PATH)) {
    return { servers: [] };
  }
  return JSON.parse(NodeFS.readFileSync(MANIFEST_PATH, "utf8"));
}

function writeManifest(manifest) {
  NodeFS.mkdirSync(NodePath.dirname(MANIFEST_PATH), { recursive: true });
  NodeFS.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function portFree(port) {
  return new Promise((resolve) => {
    const server = NodeNet.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

async function allocatePort(used) {
  for (let port = BASE_PORT; port < BASE_PORT + 200; port++) {
    if (used.has(port)) continue;
    if (await portFree(port)) return port;
  }
  throw new Error("No free dev server ports");
}

function renderCaddySnippet(servers) {
  if (servers.length === 0) {
    return "dev_servers_snippet {\n\trespond \"no dev servers\" 404\n}\n";
  }
  const blocks = servers
    .map(
      (s) =>
        `\thandle_path /projects/${s.name}/* {\n\t\treverse_proxy 127.0.0.1:${s.port} {\n\t\t\ttransport http {\n\t\t\t\tversions 1.1 2\n\t\t\t}\n\t\t}\n\t}`,
    )
    .join("\n\n");
  return `dev_servers_snippet {\n${blocks}\n\trespond \"unknown project\" 404\n}\n`;
}

function writeCaddySnippet(manifest) {
  const snippet = renderCaddySnippet(manifest.servers);
  try {
    NodeFS.writeFileSync(CADDY_SNIPPET_PATH, snippet, "utf8");
  } catch {
    // Running outside container or read-only caddy mount
  }
}

function detectDevCommand(projectDir) {
  const pkgPath = NodePath.join(projectDir, "package.json");
  if (!NodeFS.existsSync(pkgPath)) return null;
  const pkg = JSON.parse(NodeFS.readFileSync(pkgPath, "utf8"));
  if (pkg.scripts?.dev) return "pnpm dev";
  if (pkg.scripts?.start) return "pnpm start";
  return null;
}

async function cmdStart(name) {
  const manifest = readManifest();
  if (manifest.servers.some((s) => s.name === name)) {
    console.log(`[dev-manager] ${name} already running`);
    return;
  }
  const projectDir = NodePath.join(CODE_ROOT, name);
  const command = detectDevCommand(projectDir);
  if (!command) {
    throw new Error(`No dev script in ${projectDir}`);
  }
  const used = new Set(manifest.servers.map((s) => s.port));
  const port = await allocatePort(used);
  const logPath = NodePath.join(CODE_ROOT, ".local", `dev-${name}.log`);
  NodeFS.mkdirSync(NodePath.dirname(logPath), { recursive: true });
  const logFd = NodeFS.openSync(logPath, "a");
  const child = spawn(command, {
    cwd: projectDir,
    shell: true,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
  });
  child.unref();
  const entry = {
    name,
    path: projectDir,
    port,
    pid: child.pid,
    command,
    publicUrl: PUBLIC_BASE ? `${PUBLIC_BASE.replace(/\/$/, "")}/projects/${name}/` : null,
    startedAt: new Date().toISOString(),
  };
  manifest.servers.push(entry);
  writeManifest(manifest);
  writeCaddySnippet(manifest);
  console.log(JSON.stringify(entry, null, 2));
}

function cmdStop(name) {
  const manifest = readManifest();
  const target = manifest.servers.find((s) => s.name === name);
  if (!target) return;
  try {
    process.kill(target.pid, "SIGTERM");
  } catch {
    // already stopped
  }
  manifest.servers = manifest.servers.filter((s) => s.name !== name);
  writeManifest(manifest);
  writeCaddySnippet(manifest);
}

function cmdList() {
  console.log(JSON.stringify(readManifest(), null, 2));
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  if (command === "watch") {
    writeCaddySnippet(readManifest());
    setInterval(() => writeCaddySnippet(readManifest()), 5000);
    return;
  }
  if (command === "start" && arg) return cmdStart(arg);
  if (command === "stop" && arg) return cmdStop(arg);
  if (command === "list") return cmdList();
  console.error("Usage: dev-manager.mjs start|stop|list|watch <name>");
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
