// @effect-diagnostics nodeBuiltinImport:off - The opt-in Linux audio test owns transient PipeWire test devices.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";

import { VoiceDockPage } from "../localTopics/onTheGo/VoiceDockPage.ts";
import { seedOnTheGoProviderState } from "../localTopics/onTheGo/seedOnTheGoProviderState.ts";
import { expect, test } from "../support/electronHarness.ts";
import { addAndOpenFixtureProject, createWorkspaceFixture } from "../support/workspaceFixture.ts";

test.use({ e2eSeed: { run: seedOnTheGoProviderState } });

const runPactl = (...args: ReadonlyArray<string>) =>
  NodeChildProcess.execFileSync("pactl", args, { encoding: "utf8" }).trim();

const playFixture = (fixturePath: string) =>
  new Promise<void>((resolve, reject) => {
    const child = NodeChildProcess.spawn("paplay", ["--device=t3code_voice_test", fixturePath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`paplay exited ${code ?? "without a code"}: ${stderr.trim()}`));
    });
  });

test("On-the-Go transcribes a real virtual microphone utterance @audio", async ({ page }) => {
  const fixturePath = process.env.T3CODE_ON_THE_GO_AUDIO_FIXTURE?.trim();
  test.skip(
    // oxlint-disable-next-line t3code/no-global-process-runtime -- This standalone Linux-only E2E owns transient PipeWire devices before an Effect runtime exists.
    NodeOS.platform() !== "linux" || !fixturePath || !NodeFS.existsSync(fixturePath),
    "Set T3CODE_ON_THE_GO_AUDIO_FIXTURE to a spoken 'Hey Theo' WAV or AIFF fixture on Linux.",
  );
  const verifiedFixturePath = fixturePath!;

  const originalSource = runPactl("get-default-source");
  const modules = new Array<string>();
  try {
    modules.push(
      runPactl(
        "load-module",
        "module-null-sink",
        "sink_name=t3code_voice_test",
        "sink_properties=device.description=T3CodeVoiceTest",
      ),
    );
    modules.push(
      runPactl(
        "load-module",
        "module-remap-source",
        "master=t3code_voice_test.monitor",
        "source_name=t3code_voice_test_source",
        "source_properties=device.description=T3CodeVoiceTestSource",
      ),
    );
    runPactl("set-default-source", "t3code_voice_test_source");

    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const dock = new VoiceDockPage(page);
    await dock.open();
    await dock.turnOn();
    await dock.expectCaption("Listening for T3 or Hey Theo");
    await playFixture(verifiedFixturePath);
    await dock.expectCaption("Theo conversation");
  } finally {
    try {
      runPactl("set-default-source", originalSource);
    } catch {
      // Module cleanup must still run if the prior default source disappeared during the test.
    }
    for (const moduleId of modules.toReversed()) {
      try {
        runPactl("unload-module", moduleId);
      } catch {
        // Cleanup remains best effort when PipeWire has already removed a transient module.
      }
    }
  }
});

test("On-the-Go core voice journey preserves reciprocal controls @smoke", async ({
  harness,
  page,
}) => {
  await page.addInitScript(() => {
    (
      window as typeof window & { __t3codeOnTheGoUseBrowserRecognition?: boolean }
    ).__t3codeOnTheGoUseBrowserRecognition = true;
    localStorage.setItem("t3code:on-the-go:device-id", "device:e2e-on-the-go");
    localStorage.setItem("t3code:on-the-go:voice-session-id", "voice-session:e2e-on-the-go");
    class FakeRecognition {
      continuous = false;
      interimResults = false;
      lang = "en-US";
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        (
          window as typeof window & { __onTheGoRecognition?: FakeRecognition }
        ).__onTheGoRecognition = this;
      }
      abort() {}
      emit(transcript: string) {
        this.onresult?.({
          results: { length: 1, 0: { isFinal: true, 0: { transcript } } },
        });
      }
    }
    Object.defineProperty(window, "SpeechRecognition", { value: FakeRecognition });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {
        text: string;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        private listeners = new Map<string, Array<() => void>>();
        constructor(text: string) {
          this.text = text;
        }
        addEventListener(type: string, listener: () => void) {
          this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
        }
        emit(type: string) {
          for (const listener of this.listeners.get(type) ?? []) listener();
        }
      },
    });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        cancel() {},
        pause() {},
        resume() {},
        speaking: false,
        speak(utterance: { emit: (type: string) => void }) {
          queueMicrotask(() => utterance.emit("end"));
        },
      },
    });
  });
  const pageErrors = new Array<Error>();
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.reload();
  const fixture = await createWorkspaceFixture({ parentDir: harness.rootDir });
  await addAndOpenFixtureProject(harness, fixture);
  await page
    .getByTestId("composer-editor")
    .fill("Run `sleep 90` in the terminal, then reply with OK. Do not make any file changes.");
  await Promise.all([
    page.waitForURL((url) => !url.hash.startsWith("#/draft/"), { timeout: 30_000 }),
    page.getByRole("button", { name: "Send message" }).click(),
  ]);

  const dock = new VoiceDockPage(page);
  await dock.open();
  await expect(page.getByText("Available while minimized", { exact: true })).toBeVisible();
  await dock.turnOn();
  await dock.expectCaption("Listening for T3 or Hey Theo");
  await dock.speak("Hey Theo");
  await dock.expectCaption("Theo conversation");
  await dock.speak("Stop");
  await dock.expectCaption("Stopped");
  await dock.speak("T3 what was the last announcement");
  await dock.expectCaption("There is no matching announcement to read");
  await dock.say("Follow this chat");
  await expect(page.getByText(/^Following /u)).toBeVisible();
  await dock.say("Stop following");
  await dock.expectCaption("Stopped following");
  await dock.say("Start dictation");
  await dock.expectCaption(
    "Dictation State. Command words are protected as text until you say Finish dictation.",
  );
  await dock.say("Send it should remain ordinary prompt text");
  await dock.expectCaption("Dictation draft: Send it should remain ordinary prompt text");
  await dock.say("Finish dictation");
  await dock.expectPreparedPrompt("Send it should remain ordinary prompt text");

  await page.reload();
  await dock.open();
  await dock.expectPreparedPrompt("Send it should remain ordinary prompt text");
  await dock.turnOn();
  await dock.expectCaption("Listening for T3 or Hey Theo");
  await dock.say("Send it");
  await dock.expectCaption(
    "This has been queued. Say No, steer the running agent within ten seconds to correct it.",
  );
  await dock.expectQueuedWork(1);
  await dock.say("No steer the running agent");
  await dock.expectCaption("The queued prompt was steered into the running agent");
  await dock.expectQueuedWork(0);
  expect(pageErrors).toEqual([]);
});
