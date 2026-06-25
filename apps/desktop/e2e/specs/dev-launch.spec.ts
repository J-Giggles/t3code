import { expect, test } from "../support/electronHarness.ts";
import { addAndOpenFixtureProject, createWorkspaceFixture } from "../support/workspaceFixture.ts";
import { requireTailscaleMutationAllowed, skipOrFailForPreflight } from "../support/preflight.ts";

test("dev-app stack launch starts multiple profiles, blocks duplicate profile launch, and stops @full", async ({
  harness,
  page,
}) => {
  const preflight = await requireTailscaleMutationAllowed();
  skipOrFailForPreflight(preflight);
  test.skip(!preflight.ok, preflight.reason);

  const fixture = await createWorkspaceFixture({ parentDir: harness.rootDir });
  await addAndOpenFixtureProject(harness, fixture);

  await page.getByRole("button", { name: "Launch dev apps" }).click();
  await page.getByRole("menuitem", { name: "Launch all" }).click();
  await expect(page.getByRole("button", { name: "View dev apps" })).toBeVisible({
    timeout: 90_000,
  });

  await expect
    .poll(
      async () => {
        const next = await page.evaluate(async () => window.desktopBridge?.listActiveDevLaunches());
        return (next?.active ?? []).map((launch) => launch.profileId).sort();
      },
      { timeout: 90_000 },
    )
    .toEqual(["api", "web"]);

  const latestState = await page.evaluate(async () =>
    window.desktopBridge?.listActiveDevLaunches(),
  );
  const launches = latestState?.active ?? [];
  expect(launches).toHaveLength(2);
  for (const launch of launches) {
    expect(launch.publicUrl).toContain(`/${launch.projectSlug}/${launch.worktreeSlug}/`);
    expect(launch.publicUrl).toContain(`/${launch.profileId}/`);
    harness.registerTailscaleServePath(launch.publicPath);
  }
  const launch = launches.find((candidate) => candidate.profileId === "web") ?? launches[0];

  const collision = await page.evaluate(async (activeLaunch) => {
    if (!window.desktopBridge || !activeLaunch) return null;
    try {
      await window.desktopBridge.launchDevApp({
        threadRef: {
          environmentId: activeLaunch.threadRef.environmentId,
          threadId: "thread-e2e-collision",
        },
        projectId: activeLaunch.projectId,
        projectRoot: activeLaunch.projectRoot,
        projectName: activeLaunch.projectSlug,
        branch: null,
        worktreePath: null,
        profileId: activeLaunch.profileId,
      });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, launch);
  expect(collision).toContain("already has");

  const latest = await page.evaluate(async () => window.desktopBridge?.listActiveDevLaunches());
  const active = latest?.active[0];
  if (active) {
    await page.evaluate(async (threadRef) => {
      await window.desktopBridge?.stopDevApp({ threadRef });
    }, active.threadRef);
  }
  await expect
    .poll(async () => {
      const next = await page.evaluate(async () => window.desktopBridge?.listActiveDevLaunches());
      return next?.active.length ?? 0;
    })
    .toBe(0);
});
