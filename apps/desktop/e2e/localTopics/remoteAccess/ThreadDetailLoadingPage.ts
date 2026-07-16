import type { Page, Response } from "playwright/test";

export class ThreadDetailLoadingPage {
  readonly #page: Page;
  readonly #threadId: string;
  readonly #threadTitle: string;
  readonly #detailResponses: Response[] = [];

  constructor(page: Page, input: { threadId: string; threadTitle: string }) {
    this.#page = page;
    this.#threadId = input.threadId;
    this.#threadTitle = input.threadTitle;
  }

  get detailResponseCount(): number {
    return this.#detailResponses.length;
  }

  async observeColdSidebar(): Promise<void> {
    this.#detailResponses.length = 0;
    this.#page.on("response", this.#recordDetailResponse);
    await this.#page.reload({ waitUntil: "domcontentloaded" });
    await this.#page.getByTestId(`thread-row-${this.#threadId}`).waitFor({ state: "visible" });
    await this.#page.waitForTimeout(750);
  }

  async openThread(): Promise<Response> {
    const responsePromise = this.#page.waitForResponse((response) =>
      this.#isThreadDetailResponse(response),
    );
    await this.#page.getByTestId(`thread-row-${this.#threadId}`).click();
    const response = await responsePromise;
    await this.#page
      .locator("main")
      .getByText(this.#threadTitle, { exact: true })
      .last()
      .waitFor({ state: "visible" });
    return response;
  }

  dispose(): void {
    this.#page.off("response", this.#recordDetailResponse);
  }

  readonly #recordDetailResponse = (response: Response): void => {
    if (this.#isThreadDetailResponse(response)) {
      this.#detailResponses.push(response);
    }
  };

  #isThreadDetailResponse(response: Response): boolean {
    return new URL(response.url()).pathname.endsWith(
      `/api/orchestration/threads/${this.#threadId}`,
    );
  }
}
