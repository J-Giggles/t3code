import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { CodexSettings } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { resetCodexNativeProviderState } from "./CodexNativeReset.ts";

const decodeCodexSettings = Schema.decodeSync(CodexSettings);

const makeTempDir = Effect.fn("CodexNativeReset.test.makeTempDir")(function* (prefix: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({ prefix });
});

const writeTextFile = Effect.fn("CodexNativeReset.test.writeTextFile")(function* (
  filePath: string,
  contents: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fileSystem.makeDirectory(path.dirname(filePath), { recursive: true });
  yield* fileSystem.writeFileString(filePath, contents);
});

it.layer(NodeServices.layer)("CodexNativeReset", (it) => {
  describe("resetCodexNativeProviderState", () => {
    it.effect("preserves auth and sessions while removing extras and MCP config", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const homePath = yield* makeTempDir("t3code-codex-native-reset-");
        yield* writeTextFile(path.join(homePath, "auth.json"), '{"token":"keep"}');
        yield* writeTextFile(path.join(homePath, "sessions", "session.json"), "{}");
        yield* writeTextFile(path.join(homePath, "skills", "demo", "SKILL.md"), "# remove");
        yield* writeTextFile(path.join(homePath, "plugins", "demo", "plugin.json"), "{}");
        yield* writeTextFile(
          path.join(homePath, "config.toml"),
          [
            'model = "gpt-5-codex"',
            "",
            "[mcp_servers.jira-local]",
            'command = "/usr/bin/node"',
            'args = ["/tmp/server.js"]',
            "",
            "[profiles.default]",
            'model = "gpt-5-codex"',
            "",
          ].join("\n"),
        );

        const result = yield* resetCodexNativeProviderState(decodeCodexSettings({ homePath }));

        expect(result.status).toBe("completed");
        expect(yield* fileSystem.exists(path.join(homePath, "auth.json"))).toBe(true);
        expect(yield* fileSystem.exists(path.join(homePath, "sessions", "session.json"))).toBe(
          true,
        );
        expect(yield* fileSystem.exists(path.join(homePath, "skills"))).toBe(false);
        expect(yield* fileSystem.exists(path.join(homePath, "plugins"))).toBe(false);
        const config = yield* fileSystem.readFileString(path.join(homePath, "config.toml"));
        expect(config).toContain('model = "gpt-5-codex"');
        expect(config).toContain("[profiles.default]");
        expect(config).not.toContain("[mcp_servers.jira-local]");
      }),
    );

    it.effect("cleans shared shadow-home extras and preserves private shadow auth", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const sharedHome = yield* makeTempDir("t3code-codex-native-shared-");
        const shadowRoot = yield* makeTempDir("t3code-codex-native-shadow-root-");
        const shadowHome = path.join(shadowRoot, "shadow");
        yield* writeTextFile(path.join(sharedHome, "auth.json"), '{"token":"shared"}');
        yield* writeTextFile(path.join(sharedHome, "skills", "demo", "SKILL.md"), "# remove");
        yield* writeTextFile(
          path.join(sharedHome, "config.toml"),
          ['approval = "ask"', "", "[mcp_servers.jira-local]", 'command = "/usr/bin/node"'].join(
            "\n",
          ),
        );
        yield* writeTextFile(path.join(shadowHome, "auth.json"), '{"token":"shadow"}');

        yield* resetCodexNativeProviderState(
          decodeCodexSettings({
            homePath: sharedHome,
            shadowHomePath: shadowHome,
          }),
        );

        expect(yield* fileSystem.exists(path.join(sharedHome, "skills", "demo", "SKILL.md"))).toBe(
          false,
        );
        expect(yield* fileSystem.readFileString(path.join(shadowHome, "auth.json"))).toBe(
          '{"token":"shadow"}',
        );
        const config = yield* fileSystem.readFileString(path.join(sharedHome, "config.toml"));
        expect(config).not.toContain("[mcp_servers.jira-local]");
        expect(config).toContain('approval = "ask"');
      }),
    );
  });
});
