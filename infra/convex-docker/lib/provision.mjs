#!/usr/bin/env node
/**
 * Per-worktree pod provisioner — ports, manifest, rendered compose env.
 */
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeNet from "node:net";
import * as NodePath from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = NodePath.dirname(fileURLToPath(import.meta.url));
const INFRA_ROOT = NodePath.resolve(SCRIPT_DIR, "..");
const TEMPLATE_DIR = NodePath.join(INFRA_ROOT, "template");
const GENERATED_ROOT = NodePath.join(INFRA_ROOT, ".generated");
const REGISTRY_PATH = NodePath.join(
  process.env.HOME ?? "/tmp",
  ".local/share/t3code-local/convex-docker/registry.json",
);

const KNOWN_SLUG_PORTS = {
  "t3code-main": {
    cloud: 3210,
    site: 3211,
    dashboard: 6791,
    postgres: 5432,
    web: 8207,
    server: 16247,
    cdp: 9224,
    caddy: 8081,
    novnc: 6081,
  },
  "t3code-staging": {
    cloud: 3220,
    site: 3221,
    dashboard: 6792,
    postgres: 5433,
    web: 6657,
    server: 14697,
    cdp: 9232,
    caddy: 8080,
    novnc: 6080,
  },
};

function toSlug(worktreePath) {
  return NodePath.basename(NodePath.resolve(worktreePath));
}

function readRegistry() {
  if (!NodeFS.existsSync(REGISTRY_PATH)) return { entries: [] };
  return JSON.parse(NodeFS.readFileSync(REGISTRY_PATH, "utf8"));
}

function writeRegistry(registry) {
  NodeFS.mkdirSync(NodePath.dirname(REGISTRY_PATH), { recursive: true });
  NodeFS.writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

async function portAvailable(port) {
  return new Promise((resolve) => {
    const server = NodeNet.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

async function allocatePorts(slug, registry) {
  if (KNOWN_SLUG_PORTS[slug]) return { ...KNOWN_SLUG_PORTS[slug] };
  const used = new Set();
  for (const entry of registry.entries) {
    for (const value of Object.values(entry.ports ?? {})) used.add(value);
  }
  let base = 3230;
  while (used.has(base) || used.has(base + 1) || !(await portAvailable(base))) {
    base += 10;
  }
  return {
    cloud: base,
    site: base + 1,
    dashboard: 6801 + registry.entries.length,
    postgres: 5442 + registry.entries.length,
    web: base + 37,
    server: base + 11437,
    cdp: base + 6012,
    caddy: 8090 + registry.entries.length,
    novnc: 6100 + registry.entries.length,
  };
}

function secretHex() {
  return NodeCrypto.randomBytes(32).toString("hex");
}

function postgresDbName(instanceName) {
  return instanceName.replace(/-/g, "_");
}

/** Host path bind-mounted as /workspace/t3code (falls back when worktree checkout is empty). */
function resolvePodCodeMountPath(worktreePath) {
  if (NodeFS.existsSync(NodePath.join(worktreePath, "package.json"))) {
    return worktreePath;
  }
  const stagingSibling = NodePath.join(NodePath.dirname(worktreePath), "t3code-staging");
  if (NodeFS.existsSync(NodePath.join(stagingSibling, "package.json"))) {
    console.warn(
      `[provision] ${worktreePath} has no package.json; mounting ${stagingSibling} for pod code`,
    );
    return stagingSibling;
  }
  return worktreePath;
}

export async function provisionWorktree(options) {
  const worktreePath = NodePath.resolve(options.worktreePath);
  const codeMountPath = resolvePodCodeMountPath(worktreePath);
  const slug = options.slug?.trim() || toSlug(worktreePath);
  const codeRoot = NodePath.resolve(
    options.codeRoot ?? process.env.T3CODE_POD_CODE_ROOT ?? NodePath.join(worktreePath, "..", "code"),
  );
  const registry = readRegistry();
  const ports = await allocatePorts(slug, registry);
  const instanceName = slug;
  const generatedDir = NodePath.join(GENERATED_ROOT, slug);
  const manifestDir = NodePath.join(worktreePath, ".local", "convex-docker");
  const manifestPath = NodePath.join(manifestDir, "manifest.json");
  const existing = NodeFS.existsSync(manifestPath)
    ? JSON.parse(NodeFS.readFileSync(manifestPath, "utf8"))
    : null;

  const instanceSecret = existing?.secrets?.instanceSecret ?? secretHex();
  const postgresPassword = existing?.secrets?.postgresPassword ?? secretHex().slice(0, 24);
  const tailscaleEnabled = Boolean(options.tailscale ?? process.env.TS_AUTHKEY?.trim());
  const localOnly = options.localOnly ?? !tailscaleEnabled;

  const convexCloudOrigin = localOnly
    ? `http://127.0.0.1:${ports.cloud}`
    : options.publicConvexUrl ?? `https://${slug}.${options.magicDns ?? "tailnet"}.ts.net/convex`;
  /** In-pod services always reach Convex on the backend container's listen ports. */
  const convexInternalUrl = "http://127.0.0.1:3210";
  const convexInternalSiteUrl = "http://127.0.0.1:3211";

  const manifest = {
    slug,
    worktreePath,
    codeRoot,
    instanceName,
    composeProject: `t3code-pod-${slug}`,
    postgresDb: postgresDbName(instanceName),
    generatedDir,
    templateDir: TEMPLATE_DIR,
    ports: {
      cloud: ports.cloud,
      site: ports.site,
      dashboard: ports.dashboard,
      postgres: ports.postgres,
      web: ports.web,
      server: ports.server,
      cdp: ports.cdp,
      caddy: ports.caddy ?? 8080,
      novnc: ports.novnc ?? 6080,
    },
    tailscale: {
      hostname: slug,
      enabled: !localOnly,
      publicBaseUrl: localOnly ? null : options.publicBaseUrl ?? `https://${slug}.${options.magicDns ?? "tailnet"}.ts.net`,
    },
    mounts: {
      t3code: "/workspace/t3code",
      code: "/workspace/code",
      t3codeHome: "/data/t3code-home",
      codeMountPath,
    },
    urls: {
      local: {
        convexUrl: `http://127.0.0.1:${ports.cloud}`,
        convexSiteUrl: `http://127.0.0.1:${ports.site}`,
        appUrl: `http://127.0.0.1:${ports.web}`,
        serverUrl: `http://127.0.0.1:${ports.server}`,
        dashboardUrl: `http://127.0.0.1:${ports.dashboard}`,
        caddyUrl: `http://127.0.0.1:${ports.caddy ?? 8080}`,
      },
      remote: localOnly
        ? null
        : {
            convexUrl: `${options.publicBaseUrl ?? `https://${slug}.tailnet.ts.net`}/convex`,
            appUrl: options.publicBaseUrl ?? `https://${slug}.tailnet.ts.net/`,
            dashboardUrl: `${options.publicBaseUrl ?? `https://${slug}.tailnet.ts.net`}/dashboard/`,
            vncUrl: `${options.publicBaseUrl ?? `https://${slug}.tailnet.ts.net`}/vnc/`,
            devServers: `${options.publicBaseUrl ?? `https://${slug}.tailnet.ts.net`}/projects/`,
          },
    },
    secrets: { instanceSecret, postgresPassword },
    adminKeyFile: ".local/convex-docker/admin.key",
    localOnly,
    updatedAt: new Date().toISOString(),
  };

  NodeFS.mkdirSync(manifestDir, { recursive: true });
  NodeFS.mkdirSync(generatedDir, { recursive: true });

  const adminKeyPath = NodePath.join(manifestDir, "admin.key");
  if (!NodeFS.existsSync(adminKeyPath)) {
    NodeFS.writeFileSync(adminKeyPath, "run-keys-command-to-generate\n", { mode: 0o600 });
  }

  const envLines = [
    `POD_SLUG=${slug}`,
    `TS_HOSTNAME=${slug}`,
    `INSTANCE_NAME=${instanceName}`,
    `CONVEX_DB_NAME=${manifest.postgresDb}`,
    `PORT=${ports.cloud}`,
    `SITE_PROXY_PORT=${ports.site}`,
    `DASHBOARD_PORT=${ports.dashboard}`,
    `POSTGRES_PORT=${ports.postgres}`,
    `WEB_PORT=${ports.web}`,
    `SERVER_PORT=${ports.server}`,
    `CDP_PORT=${ports.cdp}`,
    `CADDY_PORT=${ports.caddy ?? 8080}`,
    `CADDY_LISTEN_PORT=8080`,
    `POD_BROWSER_ORIGIN=http://127.0.0.1:${ports.caddy ?? 8080}`,
    `NOVNC_PORT=${ports.novnc ?? 6080}`,
    `INSTANCE_SECRET=${instanceSecret}`,
    `POSTGRES_PASSWORD=${postgresPassword}`,
    `TS_AUTHKEY=${process.env.TS_AUTHKEY ?? ""}`,
    `TS_EXTRA_ARGS="${process.env.TS_EXTRA_ARGS ?? "--ssh --accept-routes"}"`,
    `TAILSCALE_SERVE=${localOnly ? "0" : "1"}`,
    `CONVEX_CLOUD_ORIGIN=${convexCloudOrigin}`,
    `CONVEX_SITE_ORIGIN=http://127.0.0.1:${ports.site}`,
    `CONVEX_INTERNAL_URL=${convexInternalUrl}`,
    `CONVEX_INTERNAL_SITE_URL=${convexInternalSiteUrl}`,
    `POD_PUBLIC_BASE_URL=${manifest.tailscale.publicBaseUrl ?? ""}`,
    `WORKTREE_PATH=${codeMountPath}`,
    `MANIFEST_WORKTREE_PATH=${worktreePath}`,
    `CODE_ROOT=${codeRoot}`,
    `TEMPLATE_DIR=${TEMPLATE_DIR}`,
    `LOCAL_ONLY=${localOnly ? "1" : "0"}`,
    `POD_NETWORK_MODE=${localOnly ? "service:local-net" : "service:tailscale"}`,
    `COMPOSE_PROFILES=${localOnly ? "local" : "tailscale"}`,
    `T3CODE_DESKTOP_VARIANT=${slug === "t3code-main" ? "local-main" : "local-staging"}`,
    `T3CODE_DEV_INSTANCE=${slug === "t3code-main" ? "t3code-local-main" : "t3code-local-staging"}`,
    `CONVEX_REV=${process.env.CONVEX_REV ?? "latest"}`,
    `TAILSCALE_REV=${process.env.TAILSCALE_REV ?? "latest"}`,
    `POD_BASE_IMAGE=${process.env.POD_BASE_IMAGE ?? "node:24-bookworm-slim"}`,
  ];

  NodeFS.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  NodeFS.writeFileSync(NodePath.join(generatedDir, ".env"), `${envLines.join("\n")}\n`, "utf8");
  NodeFS.copyFileSync(
    NodePath.join(TEMPLATE_DIR, "docker-compose.yml"),
    NodePath.join(generatedDir, "docker-compose.yml"),
  );
  NodeFS.copyFileSync(NodePath.join(TEMPLATE_DIR, "Caddyfile"), NodePath.join(generatedDir, "Caddyfile"));
  NodeFS.copyFileSync(
    NodePath.join(TEMPLATE_DIR, "init-db.sh"),
    NodePath.join(generatedDir, "init-db.sh"),
  );
  NodeFS.copyFileSync(
    NodePath.join(TEMPLATE_DIR, "entrypoint-tailscale.sh"),
    NodePath.join(generatedDir, "entrypoint-tailscale.sh"),
  );
  for (const name of ["entrypoint-t3-stack.sh", "entrypoint-desktop.sh", "dev-manager.mjs"]) {
    const src = NodePath.join(TEMPLATE_DIR, "scripts", name);
    const dest = NodePath.join(generatedDir, name);
    NodeFS.copyFileSync(src, dest);
    try {
      NodeFS.chmodSync(dest, 0o755);
    } catch {
      // windows
    }
  }

  const filtered = registry.entries.filter((e) => e.slug !== slug);
  filtered.push({ slug, worktreePath, manifestPath, generatedDir, ports: manifest.ports });
  writeRegistry({ entries: filtered, updatedAt: new Date().toISOString() });

  return manifest;
}

export function resolveManifest(input) {
  const registry = readRegistry();
  const normalized = input?.trim();
  if (!normalized) throw new Error("Missing worktree path or slug");
  const bySlug = registry.entries.find((e) => e.slug === normalized);
  if (bySlug && NodeFS.existsSync(bySlug.manifestPath)) {
    return JSON.parse(NodeFS.readFileSync(bySlug.manifestPath, "utf8"));
  }
  const worktreePath = NodePath.resolve(normalized);
  const manifestPath = NodePath.join(worktreePath, ".local", "convex-docker", "manifest.json");
  if (!NodeFS.existsSync(manifestPath)) {
    throw new Error(`No manifest at ${manifestPath}. Run: provision ${worktreePath}`);
  }
  return JSON.parse(NodeFS.readFileSync(manifestPath, "utf8"));
}

export function listManifests() {
  return readRegistry();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  if (cmd === "provision") {
    const worktreePath = process.argv[3];
    if (!worktreePath) {
      console.error("Usage: provision.mjs provision <worktree-path> [--code-root PATH]");
      process.exit(1);
    }
    let codeRoot;
    for (let i = 4; i < process.argv.length; i++) {
      if (process.argv[i] === "--code-root") codeRoot = process.argv[++i];
    }
    const manifest = await provisionWorktree({ worktreePath, codeRoot });
    console.log(JSON.stringify(manifest, null, 2));
  } else if (cmd === "resolve") {
    console.log(JSON.stringify(resolveManifest(process.argv[3]), null, 2));
  } else if (cmd === "list") {
    console.log(JSON.stringify(listManifests(), null, 2));
  } else {
    console.error("Usage: provision.mjs provision|resolve|list ...");
    process.exit(1);
  }
}
