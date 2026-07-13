import { VoiceDockPage } from "../localTopics/onTheGo/VoiceDockPage.ts";
import { expect, test } from "../support/electronHarness.ts";
import { addAndOpenFixtureProject, createWorkspaceFixture } from "../support/workspaceFixture.ts";

test("On-the-Go core voice journey preserves reciprocal controls @smoke", async ({
  harness,
  page,
}) => {
  await page.addInitScript(() => {
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
  await dock.expectCaption("There is no announcement to read");
  expect(pageErrors).toEqual([]);
});
