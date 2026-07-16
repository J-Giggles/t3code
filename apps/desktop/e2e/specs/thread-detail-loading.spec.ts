import { expect, test } from "../support/electronHarness.ts";
import {
  CHAT_LAYOUT_THREAD_TITLES,
  seedOversizedThreadDetailState,
} from "../support/seedChatLayoutState.ts";
import { ThreadDetailLoadingPage } from "../localTopics/remoteAccess/ThreadDetailLoadingPage.ts";

const OVERSIZED_THREAD_ID = "thread-e2e-chat-layout-1";

test.use({ e2eSeed: { run: seedOversizedThreadDetailState } });

test("oversized task detail cold-opens through one compressed response @smoke", async ({
  page,
}) => {
  const task = new ThreadDetailLoadingPage(page, {
    threadId: OVERSIZED_THREAD_ID,
    threadTitle: CHAT_LAYOUT_THREAD_TITLES[0],
  });

  try {
    await task.observeColdSidebar();
    expect(task.detailResponseCount).toBe(0);

    const response = await task.openThread();
    const headers = await response.allHeaders();

    expect(response.status()).toBe(200);
    expect(headers["content-encoding"]).toBe("gzip");
    expect(headers.vary?.split(",").map((value) => value.trim())).toEqual(
      expect.arrayContaining(["Origin", "Accept-Encoding"]),
    );
    expect(task.detailResponseCount).toBe(1);
  } finally {
    task.dispose();
  }
});
