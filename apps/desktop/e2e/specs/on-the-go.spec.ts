import { VoiceDockPage } from "../localTopics/onTheGo/VoiceDockPage.ts";
import { expect, test } from "../support/electronHarness.ts";
import { addAndOpenFixtureProject, createWorkspaceFixture } from "../support/workspaceFixture.ts";

test("On-the-Go core voice journey preserves reciprocal controls @smoke", async ({
  harness,
  page,
}) => {
  await page.addInitScript(() => {
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
  await page.getByTestId("composer-editor").fill("Reply with OK and make no file changes.");
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
  await dock.say("Send it");
  await dock.expectCaption(
    "This has been queued. Say No, steer the running agent within ten seconds to correct it.",
  );
  await dock.expectQueuedWork(1);
  await dock.say("No steer the running agent");
  await expect(
    page.getByText(
      /The queued prompt was steered into the running agent|There is no unchanged queued prompt in its steering correction window/u,
    ),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});
