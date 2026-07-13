import { expect, type Page } from "playwright/test";

export class VoiceDockPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async open() {
    await this.page.getByRole("button", { name: "Open On-the-Go Voice Dock" }).click();
    await expect(this.page.getByRole("region", { name: "On-the-Go Voice Dock" })).toBeVisible();
  }

  async turnOn() {
    await this.page.getByRole("button", { name: "Turn on" }).click();
  }

  async say(phrase: string) {
    const input = this.page.getByLabel("Type or speak a command");
    await input.fill(phrase);
    await this.page.getByRole("button", { name: "Run voice-equivalent command" }).click();
  }

  async speak(phrase: string) {
    await this.page.evaluate((transcript) => {
      const voiceWindow = window as typeof window & {
        __onTheGoRecognition?: { emit: (value: string) => void };
      };
      voiceWindow.__onTheGoRecognition?.emit(transcript);
    }, phrase);
  }

  async expectCaption(text: string) {
    await expect(this.page.getByText(text, { exact: true })).toBeVisible();
  }
}
