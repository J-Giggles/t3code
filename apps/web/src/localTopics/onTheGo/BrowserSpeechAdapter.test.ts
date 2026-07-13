import { describe, expect, it } from "vite-plus/test";

import { makeBrowserSpeechAdapter } from "./BrowserSpeechAdapter.ts";

describe("Browser On-the-Go speech adapter", () => {
  it("OTG-UT-003/021: keeps Stop universal, makes Barge-In optional, and suspends foreground web when hidden", () => {
    let resultListener: (text: string) => void = () => {
      throw new Error("recognition not started");
    };
    let aborted = 0;
    let canceled = 0;
    let speaking = true;
    const adapter = makeBrowserSpeechAdapter({
      backgroundAvailable: false,
      visibility: () => "visible",
      recognition: {
        start: (listener) => {
          resultListener = listener;
        },
        abort: () => {
          aborted += 1;
        },
      },
      synthesis: {
        speak: async () => undefined,
        cancel: () => {
          canceled += 1;
          speaking = false;
        },
        isSpeaking: () => speaking,
      },
    });
    const heard = new Array<string>();
    adapter.setBargeInEnabled(false);
    const stop = adapter.start((text) => heard.push(text));
    resultListener("background conversation");
    resultListener("Stop");
    expect(heard).toEqual(["Stop"]);
    expect(canceled).toBe(1);
    expect(adapter.availability()).toEqual({ available: true, background: false });

    adapter.handleVisibilityChange("hidden");
    expect(aborted).toBe(1);
    stop();
  });
});
