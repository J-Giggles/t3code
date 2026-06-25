import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { ChildProcessSpawner } from "effect/unstable/process";

import {
  assertTailscaleServePathAvailable,
  buildTailscaleHttpsBaseUrl,
  DEFAULT_TAILSCALE_SERVE_PATH,
  disableTailscaleServe,
  disableTailscaleServeIfOwned,
  ensureTailscaleServe,
  isTailscaleIpv4Address,
  parseTailscaleMagicDnsName,
  parseTailscaleServeRouteStatus,
  parseTailscaleStatus,
  probeTailscaleHttpsEndpoint,
  readTailscaleServeRouteAvailability,
  readTailscaleServeRouteStatus,
  readTailscaleStatus,
  TailscaleServePathConflictError,
  TailscaleStatusParseError,
} from "./tailscale.ts";

const encoder = new TextEncoder();
const tailscaleStatusJson = `{"Self":{"DNSName":"desktop.tail.ts.net.","TailscaleIPs":["100.100.100.100","fd7a:115c:a1e0::1","192.168.1.20"]}}`;
const tailscaleStatusWithSingleIpJson = `{"Self":{"DNSName":"desktop.tail.ts.net.","TailscaleIPs":["100.90.1.2"]}}`;
const tailscaleServeStatusJson = `{"TCP":{"443":{"HTTPS":true}},"Web":{"desktop.tail.ts.net:443":{"Handlers":{"/t3code":{"Proxy":"http://127.0.0.1:4173"},"/t3code-staging":{"Proxy":"http://127.0.0.1:4174"}}}}}`;

function mockHandle(result: { stdout?: string; stderr?: string; code?: number }) {
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(result.code ?? 0)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    unref: Effect.succeed(Effect.void),
    stdin: Sink.drain,
    stdout: Stream.make(encoder.encode(result.stdout ?? "")),
    stderr: Stream.make(encoder.encode(result.stderr ?? "")),
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

function mockSpawnerLayer(
  handler: (
    command: string,
    args: ReadonlyArray<string>,
  ) => { stdout?: string; stderr?: string; code?: number },
) {
  return Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) => {
      const childProcess = command as unknown as {
        readonly command: string;
        readonly args: ReadonlyArray<string>;
      };
      return Effect.succeed(mockHandle(handler(childProcess.command, childProcess.args)));
    }),
  );
}

describe("tailscale", () => {
  it.effect("defaults Tailscale Serve to the T3 Code public path", () =>
    Effect.sync(() => {
      assert.equal(DEFAULT_TAILSCALE_SERVE_PATH, "/t3code");
    }),
  );

  it.effect("detects Tailnet IPv4 addresses", () =>
    Effect.sync(() => {
      assert.equal(isTailscaleIpv4Address("100.64.0.1"), true);
      assert.equal(isTailscaleIpv4Address("100.127.255.254"), true);
      assert.equal(isTailscaleIpv4Address("100.128.0.1"), false);
      assert.equal(isTailscaleIpv4Address("192.168.1.44"), false);
    }),
  );

  it.effect("parses MagicDNS names from tailscale status", () =>
    Effect.gen(function* () {
      const dnsName = yield* parseTailscaleMagicDnsName(tailscaleStatusJson);
      assert.equal(dnsName, "desktop.tail.ts.net");
      assert.equal(yield* parseTailscaleMagicDnsName("{}"), null);
    }),
  );

  it.effect("parses status facts", () =>
    Effect.gen(function* () {
      const status = yield* parseTailscaleStatus(tailscaleStatusJson);
      assert.deepEqual(status, {
        magicDnsName: "desktop.tail.ts.net",
        tailnetIpv4Addresses: ["100.100.100.100"],
      });
    }),
  );

  it.effect("preserves status decoding failures without exposing cause text", () =>
    Effect.gen(function* () {
      const error = yield* parseTailscaleStatus("{not-json").pipe(Effect.flip);

      assert.instanceOf(error, TailscaleStatusParseError);
      assert.equal(error.message, "Failed to decode tailscale status JSON.");
      assert.isDefined(error.cause);
      assert.notInclude(error.message, String(error.cause));
    }),
  );

  it.effect("builds clean HTTPS base URLs", () =>
    Effect.sync(() => {
      assert.equal(
        buildTailscaleHttpsBaseUrl({ magicDnsName: "desktop.tail.ts.net" }),
        "https://desktop.tail.ts.net/t3code/",
      );
      assert.equal(
        buildTailscaleHttpsBaseUrl({ magicDnsName: "desktop.tail.ts.net", servePort: 8443 }),
        "https://desktop.tail.ts.net:8443/t3code/",
      );
      assert.equal(
        buildTailscaleHttpsBaseUrl({
          magicDnsName: "desktop.tail.ts.net",
          servePath: "/t3code",
        }),
        "https://desktop.tail.ts.net/t3code/",
      );
    }),
  );

  it.effect("probes path-prefixed HTTPS endpoints without dropping the serve path", () => {
    const requestUrls: string[] = [];
    const layer = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) =>
        Effect.sync(() => {
          requestUrls.push(request.url);
          return HttpClientResponse.fromWeb(request, new Response("", { status: 200 }));
        }),
      ),
    );

    return Effect.gen(function* () {
      const reachable = yield* probeTailscaleHttpsEndpoint({
        baseUrl: "https://desktop.tail.ts.net/t3code/",
      });

      assert.equal(reachable, true);
      assert.deepEqual(requestUrls, [
        "https://desktop.tail.ts.net/t3code/.well-known/t3/environment",
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("parses path-prefixed tailscale serve route status", () =>
    Effect.gen(function* () {
      const defaultConfigured = yield* parseTailscaleServeRouteStatus(tailscaleServeStatusJson, {
        localPort: 4173,
      });
      assert.deepEqual(defaultConfigured, {
        configured: true,
        proxyUrl: "http://127.0.0.1:4173",
      });

      const configured = yield* parseTailscaleServeRouteStatus(tailscaleServeStatusJson, {
        servePath: "/t3code",
        localPort: 4173,
      });
      assert.deepEqual(configured, {
        configured: true,
        proxyUrl: "http://127.0.0.1:4173",
      });

      const mismatched = yield* parseTailscaleServeRouteStatus(tailscaleServeStatusJson, {
        servePath: "/t3code",
        localPort: 4174,
      });
      assert.deepEqual(mismatched, {
        configured: false,
        proxyUrl: "http://127.0.0.1:4173",
      });

      const missing = yield* parseTailscaleServeRouteStatus(tailscaleServeStatusJson, {
        servePath: "/missing",
        localPort: 4173,
      });
      assert.deepEqual(missing, {
        configured: false,
        proxyUrl: null,
      });
    }),
  );

  it.effect("reads tailscale status through the process spawner service", () => {
    const layer = mockSpawnerLayer((command, args) => {
      assert.equal(command, "tailscale");
      assert.deepEqual(args, ["status", "--json"]);
      return {
        stdout: tailscaleStatusWithSingleIpJson,
      };
    });

    return Effect.gen(function* () {
      const status = yield* readTailscaleStatus.pipe(Effect.provide(layer));
      assert.deepEqual(status, {
        magicDnsName: "desktop.tail.ts.net",
        tailnetIpv4Addresses: ["100.90.1.2"],
      });
    });
  });

  it.effect("reads tailscale serve route status through the process spawner service", () => {
    const layer = mockSpawnerLayer((command, args) => {
      assert.equal(command, "tailscale");
      assert.deepEqual(args, ["serve", "status", "--json"]);
      return {
        stdout: tailscaleServeStatusJson,
      };
    });

    return Effect.gen(function* () {
      const status = yield* readTailscaleServeRouteStatus({
        servePath: "/t3code",
        localPort: 4173,
      }).pipe(Effect.provide(layer));
      assert.deepEqual(status, {
        configured: true,
        proxyUrl: "http://127.0.0.1:4173",
      });
    });
  });

  it.effect("configures tailscale serve through the process spawner service", () => {
    const layer = mockSpawnerLayer((command, args) => {
      assert.equal(command, "tailscale");
      assert.deepEqual(args, [
        "serve",
        "--bg",
        "--https=8443",
        "--set-path=/t3code",
        "http://127.0.0.1:13773",
      ]);
      return {};
    });

    return ensureTailscaleServe({ localPort: 13773, servePort: 8443 }).pipe(Effect.provide(layer));
  });

  it.effect("configures path-prefixed tailscale serve routes", () => {
    const layer = mockSpawnerLayer((command, args) => {
      assert.equal(command, "tailscale");
      assert.deepEqual(args, [
        "serve",
        "--bg",
        "--https=443",
        "--set-path=/t3code",
        "http://127.0.0.1:13773",
      ]);
      return {};
    });

    return ensureTailscaleServe({
      localPort: 13773,
      servePath: "/t3code/",
    }).pipe(Effect.provide(layer));
  });

  it.effect("configures path-prefixed tailscale serve routes with a local target path", () => {
    const layer = mockSpawnerLayer((command, args) => {
      assert.equal(command, "tailscale");
      assert.deepEqual(args, [
        "serve",
        "--bg",
        "--https=443",
        "--set-path=/project/main/app",
        "http://127.0.0.1:3030/project/main/app",
      ]);
      return {};
    });

    return ensureTailscaleServe({
      localPort: 3030,
      servePath: "/project/main/app/",
      localPath: "/project/main/app/",
    }).pipe(Effect.provide(layer));
  });

  it.effect("disables tailscale serve through the process spawner service", () => {
    const commands: {
      readonly command: string;
      readonly args: ReadonlyArray<string>;
    }[] = [];
    const layer = mockSpawnerLayer((command, args) => {
      commands.push({ command, args });
      assert.equal(command, "tailscale");
      assert.deepEqual(args, ["serve", "--https=8443", "--set-path=/t3code", "off"]);
      return {};
    });

    return Effect.gen(function* () {
      yield* disableTailscaleServe({ servePort: 8443 }).pipe(Effect.provide(layer));
      assert.deepEqual(commands, [
        {
          command: "tailscale",
          args: ["serve", "--https=8443", "--set-path=/t3code", "off"],
        },
      ]);
    });
  });

  it.effect("disables path-prefixed tailscale serve routes", () => {
    const layer = mockSpawnerLayer((command, args) => {
      assert.equal(command, "tailscale");
      assert.deepEqual(args, ["serve", "--https=443", "--set-path=/t3code", "off"]);
      return {};
    });

    return disableTailscaleServe({ servePath: "/t3code/" }).pipe(Effect.provide(layer));
  });

  it.effect("disables an owned tailscale serve route", () => {
    const commands: Array<{ readonly command: string; readonly args: ReadonlyArray<string> }> = [];
    const layer = mockSpawnerLayer((command, args) => {
      commands.push({ command, args });
      assert.equal(command, "tailscale");
      return args.join(" ") === "serve status --json" ? { stdout: tailscaleServeStatusJson } : {};
    });

    return Effect.gen(function* () {
      const result = yield* disableTailscaleServeIfOwned({
        servePath: "/t3code",
        localPort: 4173,
      }).pipe(Effect.provide(layer));

      assert.deepEqual(result, {
        disabled: true,
        existingProxyUrl: "http://127.0.0.1:4173",
      });
      assert.deepEqual(commands, [
        { command: "tailscale", args: ["serve", "status", "--json"] },
        { command: "tailscale", args: ["serve", "--https=443", "--set-path=/t3code", "off"] },
      ]);
    });
  });

  it.effect("does not disable a tailscale serve route owned by another backend", () => {
    const commands: Array<{ readonly command: string; readonly args: ReadonlyArray<string> }> = [];
    const layer = mockSpawnerLayer((command, args) => {
      commands.push({ command, args });
      assert.equal(command, "tailscale");
      assert.deepEqual(args, ["serve", "status", "--json"]);
      return { stdout: tailscaleServeStatusJson };
    });

    return Effect.gen(function* () {
      const result = yield* disableTailscaleServeIfOwned({
        servePath: "/t3code",
        localPort: 4174,
      }).pipe(Effect.provide(layer));

      assert.deepEqual(result, {
        disabled: false,
        existingProxyUrl: "http://127.0.0.1:4173",
      });
      assert.deepEqual(commands, [{ command: "tailscale", args: ["serve", "status", "--json"] }]);
    });
  });

  it.effect("allows a serve path that is free or already bound to this backend", () => {
    const layer = mockSpawnerLayer((command, args) => {
      assert.equal(command, "tailscale");
      assert.deepEqual(args, ["serve", "status", "--json"]);
      return { stdout: tailscaleServeStatusJson };
    });

    return assertTailscaleServePathAvailable({
      servePath: "/t3code",
      localPort: 4173,
    }).pipe(Effect.provide(layer));
  });

  it.effect("reports an available tailscale serve route", () => {
    const layer = mockSpawnerLayer((command, args) => {
      assert.equal(command, "tailscale");
      assert.deepEqual(args, ["serve", "status", "--json"]);
      return { stdout: tailscaleServeStatusJson };
    });

    return Effect.gen(function* () {
      const availability = yield* readTailscaleServeRouteAvailability({
        servePath: "/missing",
        localPort: 4173,
      }).pipe(Effect.provide(layer));

      assert.deepEqual(availability, {
        status: "available",
        available: true,
        owned: false,
        conflict: false,
        servePath: "/missing",
        servePort: 443,
        expectedProxyUrl: "http://127.0.0.1:4173",
        existingProxyUrl: null,
      });
    });
  });

  it.effect("reports an owned tailscale serve route", () => {
    const layer = mockSpawnerLayer((command, args) => {
      assert.equal(command, "tailscale");
      assert.deepEqual(args, ["serve", "status", "--json"]);
      return { stdout: tailscaleServeStatusJson };
    });

    return Effect.gen(function* () {
      const availability = yield* readTailscaleServeRouteAvailability({
        servePath: "/t3code",
        localPort: 4173,
      }).pipe(Effect.provide(layer));

      assert.deepEqual(availability, {
        status: "owned",
        available: false,
        owned: true,
        conflict: false,
        servePath: "/t3code",
        servePort: 443,
        expectedProxyUrl: "http://127.0.0.1:4173",
        existingProxyUrl: "http://127.0.0.1:4173",
      });
    });
  });

  it.effect("reports a conflicting tailscale serve route", () => {
    const layer = mockSpawnerLayer((command, args) => {
      assert.equal(command, "tailscale");
      assert.deepEqual(args, ["serve", "status", "--json"]);
      return { stdout: tailscaleServeStatusJson };
    });

    return Effect.gen(function* () {
      const availability = yield* readTailscaleServeRouteAvailability({
        servePath: "/t3code",
        localPort: 13773,
      }).pipe(Effect.provide(layer));

      assert.deepEqual(availability, {
        status: "conflict",
        available: false,
        owned: false,
        conflict: true,
        servePath: "/t3code",
        servePort: 443,
        expectedProxyUrl: "http://127.0.0.1:13773",
        existingProxyUrl: "http://127.0.0.1:4173",
      });
    });
  });

  it.effect("allows a serve path already bound to this backend with a local target path", () => {
    const layer = mockSpawnerLayer((command, args) => {
      assert.equal(command, "tailscale");
      assert.deepEqual(args, ["serve", "status", "--json"]);
      return {
        stdout:
          '{"TCP":{"443":{"HTTPS":true}},"Web":{"desktop.tail.ts.net:443":{"Handlers":{"/project/main/app":{"Proxy":"http://127.0.0.1:3030/project/main/app"}}}}}',
      };
    });

    return assertTailscaleServePathAvailable({
      servePath: "/project/main/app",
      localPath: "/project/main/app",
      localPort: 3030,
    }).pipe(Effect.provide(layer));
  });

  it.effect("rejects a serve path already bound to another backend", () => {
    const layer = mockSpawnerLayer((command, args) => {
      assert.equal(command, "tailscale");
      assert.deepEqual(args, ["serve", "status", "--json"]);
      return { stdout: tailscaleServeStatusJson };
    });

    return Effect.gen(function* () {
      const error = yield* assertTailscaleServePathAvailable({
        servePath: "/t3code",
        localPort: 13773,
      }).pipe(Effect.provide(layer), Effect.flip);
      assert.instanceOf(error, TailscaleServePathConflictError);
      assert.equal(error.servePath, "/t3code");
      assert.equal(error.existingProxyUrl, "http://127.0.0.1:4173");
      assert.equal(error.expectedProxyUrl, "http://127.0.0.1:13773");
      assert.match(error.message, /already in use/);
      assert.include(error.message, "http://127.0.0.1:4173");
      assert.include(error.message, "http://127.0.0.1:13773");
    });
  });
});
