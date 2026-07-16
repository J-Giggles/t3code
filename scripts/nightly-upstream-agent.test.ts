// @effect-diagnostics nodeBuiltinImport:off globalDate:off - Tests use temporary filesystem fixtures for run-scoped evidence.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

import {
  collectProofArtifacts,
  decideNightlyReplay,
  existingAutonomousRepairFiles,
  extractReplayChecklistItems,
  formatAppliedTopicsTelegramMessages,
  formatAutonomousRepairPrompt,
  formatConflictBriefGenerationPrompt,
  formatConflictDecisionCardTelegramMessage,
  formatConflictBriefTelegramMessages,
  formatFinalTelegramSummaryMessages,
  formatRunningTelegramNotice,
  formatTopicCatalog,
  formatTopicStackChecklistTelegramMessages,
  formatTelegramSummary,
  formatUpstreamTelegramNotice,
  formatUpstreamTelegramNoticeMessages,
  isSafeAutonomousRepairPath,
  normalizeConflictBriefForTelegram,
  outOfScopeAutonomousRepairPaths,
  parseAutonomousRepairWorkerResult,
  proofSummaryLines,
  remainingAutonomousRepairAttempts,
  shouldResumePausedNightlyReplay,
  shouldSkipEmptyResolvedCherryPick,
  unexpectedAutonomousRepairPaths,
  type NightlyAgentStatus,
} from "./lib/nightly-upstream-agent.ts";

describe("nightly-upstream-agent", () => {
  it("skips a clean run when upstream and original are already current", () => {
    expect(
      decideNightlyReplay({
        force: false,
        upstreamBefore: "aaa",
        upstreamAfter: "aaa",
        originalExists: true,
        originalHead: "aaa",
        nightlyExists: true,
        nightlyDirty: false,
      }),
    ).toEqual({
      apply: false,
      reason: "upstream-unchanged",
    });
  });

  it("replays when upstream moved after fetch", () => {
    expect(
      decideNightlyReplay({
        force: false,
        upstreamBefore: "aaa",
        upstreamAfter: "bbb",
        originalExists: true,
        originalHead: "aaa",
        nightlyExists: true,
        nightlyDirty: false,
      }),
    ).toEqual({
      apply: true,
      reason: "upstream-changed",
    });
  });

  it("retries a failed clean run when upstream is unchanged", () => {
    expect(
      decideNightlyReplay({
        force: false,
        upstreamBefore: "aaa",
        upstreamAfter: "aaa",
        originalExists: true,
        originalHead: "aaa",
        nightlyExists: true,
        nightlyDirty: false,
        previousRunStatus: "failed",
        previousRunUpstreamAfter: "aaa",
      }),
    ).toEqual({
      apply: true,
      reason: "retry-failed-run",
    });
  });

  it("fails closed when nightly is dirty", () => {
    expect(
      decideNightlyReplay({
        force: false,
        upstreamBefore: "aaa",
        upstreamAfter: "aaa",
        originalExists: true,
        originalHead: "aaa",
        nightlyExists: true,
        nightlyDirty: true,
      }),
    ).toEqual({
      apply: false,
      blocker: "Nightly worktree is dirty; refusing to reset or replay it.",
      reason: "nightly-dirty",
    });
  });

  it("resumes only a known contract-approved paused replay conflict", () => {
    const resumable = {
      nightlyDirty: true,
      activeCherryPick: true,
      hasConflictArtifacts: true,
      autoRepair: true,
      maxRepairAttempts: 1,
      cherryPickMatchesTopic: true,
      topicAutonomy: "guarded-auto-repair" as const,
    };

    expect(shouldResumePausedNightlyReplay(resumable)).toBe(true);
    expect(shouldResumePausedNightlyReplay({ ...resumable, activeCherryPick: false })).toBe(false);
    expect(shouldResumePausedNightlyReplay({ ...resumable, hasConflictArtifacts: false })).toBe(
      false,
    );
    expect(
      shouldResumePausedNightlyReplay({ ...resumable, topicAutonomy: "manual-decision" }),
    ).toBe(false);
    expect(shouldResumePausedNightlyReplay({ ...resumable, maxRepairAttempts: 0 })).toBe(false);
    expect(shouldResumePausedNightlyReplay({ ...resumable, cherryPickMatchesTopic: false })).toBe(
      false,
    );
  });

  it("parses only structured autonomous repair decisions", () => {
    expect(
      parseAutonomousRepairWorkerResult(
        JSON.stringify({
          decision: "fundamental-conflict",
          summary: "Upstream removed the provider usage contract.",
          changedFiles: [],
          testsRun: [],
          risks: ["Jordan must choose a replacement UX."],
          rerereReady: false,
        }),
      ),
    ).toEqual({
      decision: "fundamental-conflict",
      summary: "Upstream removed the provider usage contract.",
      changedFiles: [],
      testsRun: [],
      risks: ["Jordan must choose a replacement UX."],
      rerereReady: false,
    });
    expect(parseAutonomousRepairWorkerResult("not json")).toBeUndefined();
    expect(
      parseAutonomousRepairWorkerResult(
        JSON.stringify({ decision: "repaired", summary: "Missing required fields." }),
      ),
    ).toBeUndefined();
  });

  it("accepts only repo-relative autonomous repair paths", () => {
    expect(isSafeAutonomousRepairPath("apps/web/src/example.ts")).toBe(true);
    expect(isSafeAutonomousRepairPath("../staging/example.ts")).toBe(false);
    expect(isSafeAutonomousRepairPath("apps/web/../../staging/example.ts")).toBe(false);
    expect(isSafeAutonomousRepairPath("/home/jgigg/code/t3code/example.ts")).toBe(false);
    expect(isSafeAutonomousRepairPath("")).toBe(false);
  });

  it("rejects undeclared autonomous repair paths before parent staging", () => {
    expect(
      unexpectedAutonomousRepairPaths(
        [
          "apps/web/src/declared.ts",
          "apps/server/src/undeclared.ts",
          ".t3code-nightly-runs/20260710/plan.json",
        ],
        ["apps/web/src/declared.ts"],
      ),
    ).toEqual(["apps/server/src/undeclared.ts"]);
  });

  it("limits autonomous repairs to topic-owned paths and integration points", () => {
    expect(
      outOfScopeAutonomousRepairPaths(
        ["apps/web/src/localTopics/provider/index.ts", "apps/server/src/unrelated.ts"],
        ["apps/web/src/localTopics/provider", "apps/web/src/components/ChatView.tsx"],
      ),
    ).toEqual(["apps/server/src/unrelated.ts"]);
  });

  it("formats only existing autonomous repair files", () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "nightly-repair-format-"));
    NodeFS.mkdirSync(NodePath.join(root, "docs"), { recursive: true });
    NodeFS.writeFileSync(NodePath.join(root, "docs/repair.md"), "repair\n");

    expect(
      existingAutonomousRepairFiles(root, ["docs/repair.md", "docs/deleted.md", "docs/repair.md"]),
    ).toEqual(["docs/repair.md"]);
  });

  it("bounds repair attempts per conflict instead of per nightly run", () => {
    const attempts = [{ commit: "topic-a" }, { commit: "topic-b" }, { commit: "topic-b" }];
    expect(remainingAutonomousRepairAttempts(attempts, "topic-a", 1)).toBe(0);
    expect(remainingAutonomousRepairAttempts(attempts, "topic-b", 3)).toBe(1);
    expect(remainingAutonomousRepairAttempts(attempts, "topic-c", 1)).toBe(1);
    expect(remainingAutonomousRepairAttempts(attempts, undefined, 1)).toBe(0);
  });

  it("skips an empty resolved cherry-pick only after continue fails cleanly", () => {
    expect(
      shouldSkipEmptyResolvedCherryPick({
        continueExitCode: 1,
        activeCherryPick: true,
        unresolvedFiles: 0,
        unstagedQuiet: true,
        stagedQuiet: true,
      }),
    ).toBe(true);
    expect(
      shouldSkipEmptyResolvedCherryPick({
        continueExitCode: 1,
        activeCherryPick: true,
        unresolvedFiles: 1,
        unstagedQuiet: true,
        stagedQuiet: true,
      }),
    ).toBe(false);
  });

  it("extracts checked replay checklist items from topic readmes", () => {
    expect(
      extractReplayChecklistItems(
        [
          "## Added Features",
          "- [x] Feature proof in `apps/web/src/example.ts`.",
          "- [ ] Unchecked item is not proof.",
          "## Added Tests",
          "- [X] Test proof in `scripts/example.test.ts`.",
        ].join("\n"),
      ),
    ).toEqual({
      "Added Features": ["- [x] Feature proof in `apps/web/src/example.ts`."],
      "Added Tests": ["- [X] Test proof in `scripts/example.test.ts`."],
    });
  });

  it("keeps Telegram summaries bounded", () => {
    const summary = formatTelegramSummary({
      status: "success" satisfies NightlyAgentStatus,
      startedAt: "2026-07-09T00:00:00.000Z",
      finishedAt: "2026-07-09T00:01:00.000Z",
      controlRoot: "/repo",
      repoFamilyRoot: "/repo",
      originalPath: "/repo/.worktrees/original",
      nightlyPath: "/repo/.worktrees/nightly",
      artifactDir: "/repo/.worktrees/nightly/.t3code-nightly-runs/run",
      reportPath: "/repo/.worktrees/nightly/.t3code-nightly-runs/run/nightly-agent-report.md",
      topicCatalogPath: "/repo/.worktrees/nightly/.t3code-nightly-runs/run/topic-catalog.md",
      decisionReason: "upstream-changed",
      upstreamBefore: "a".repeat(40),
      upstreamAfter: "b".repeat(40),
      upstreamCommits: [],
      topicSummaries: Array.from({ length: 200 }, (_, index) => ({
        id: `topic-${index}`,
        pluginPath: `local-plugins/topic-${index}`,
        title: `Topic ${index}`,
        subject: `feat(topic-${index}): ${"x".repeat(80)}`,
        commits: [],
        verification: [],
        checklist: {},
        replayStatuses: [],
      })),
      topicRecords: [],
      commandResults: [],
      conflictFiles: [],
      conflictArtifacts: [],
      proofArtifacts: [],
    });

    expect(summary.length).toBeLessThanOrEqual(3_700);
    expect(summary).toContain("[truncated");
  });

  it("includes conflict brief status in Telegram summaries", () => {
    const summary = formatTelegramSummary({
      status: "failed" satisfies NightlyAgentStatus,
      startedAt: "2026-07-09T00:00:00.000Z",
      finishedAt: "2026-07-09T00:01:00.000Z",
      controlRoot: "/repo",
      repoFamilyRoot: "/repo",
      originalPath: "/repo/.worktrees/original",
      nightlyPath: "/repo/.worktrees/nightly",
      artifactDir: "/repo/.worktrees/nightly/.t3code-nightly-runs/run",
      reportPath: "/repo/.worktrees/nightly/.t3code-nightly-runs/run/nightly-agent-report.md",
      topicCatalogPath: "/repo/.worktrees/nightly/.t3code-nightly-runs/run/topic-catalog.md",
      decisionReason: "upstream-changed",
      upstreamBefore: "a".repeat(40),
      upstreamAfter: "b".repeat(40),
      upstreamCommits: [],
      topicSummaries: [],
      topicRecords: [],
      commandResults: [],
      conflictFiles: ["apps/web/example.ts"],
      conflictArtifacts: ["/repo/.worktrees/nightly/.t3code-nightly-runs/run/conflict-packet.md"],
      conflictBriefPath: "/repo/.worktrees/nightly/.t3code-nightly-runs/run/conflict-brief.md",
      conflictBriefError: "delivery failed: network down",
      proofArtifacts: [],
    });

    expect(summary).toContain("Conflict Brief:");
    expect(summary).toContain("Hermes Conflict Brief failed: delivery failed: network down");
  });

  it("formats final summaries as direct Telegram result cards", () => {
    const messages = formatFinalTelegramSummaryMessages({
      status: "failed" satisfies NightlyAgentStatus,
      startedAt: "2026-07-09T00:00:00.000Z",
      finishedAt: "2026-07-09T00:01:00.000Z",
      controlRoot: "/repo",
      repoFamilyRoot: "/repo",
      originalPath: "/repo/.worktrees/original",
      nightlyPath: "/repo/.worktrees/nightly",
      artifactDir: "/repo/.worktrees/nightly/.t3code-nightly-runs/run",
      reportPath: "/repo/.worktrees/nightly/.t3code-nightly-runs/run/nightly-agent-report.md",
      topicCatalogPath: "/repo/.worktrees/nightly/.t3code-nightly-runs/run/topic-catalog.md",
      decisionReason: "nightly-dirty",
      upstreamBefore: "a".repeat(40),
      upstreamAfter: "b".repeat(40),
      upstreamCommits: [],
      topicSummaries: [],
      topicRecords: [
        {
          id: "remote-access",
          subject: "feat(remote-access): manage Tailscale and routed browser access",
          commit: "abc123",
          status: "conflict",
        },
      ],
      commandResults: [],
      conflictFiles: ["apps/web/example.ts"],
      conflictArtifacts: [],
      conflictBriefPath: "/repo/.worktrees/nightly/.t3code-nightly-runs/run/conflict-brief.md",
      proofArtifacts: [],
      autoRepairAttempts: [
        {
          attempt: 1,
          topicId: "remote-access",
          commit: "abc123",
          status: "repaired",
          autonomy: "guarded-auto-repair",
          risk: "high",
          promptPath:
            "/repo/.worktrees/nightly/.t3code-nightly-runs/run/autonomous-repair-prompt-attempt-1.md",
          resultPath:
            "/repo/.worktrees/nightly/.t3code-nightly-runs/run/autonomous-repair-result-attempt-1.json",
          message: "rerere proof will be checked by rerun",
        },
      ],
      errorMessage: "Nightly worktree is dirty; refusing to reset or replay it.",
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]!.html).toContain("<b>T3 Code Nightly FAILED</b>");
    expect(messages[0]!.html).toContain("conflict: 1");
    expect(messages[0]!.html).toContain("<code>apps/web/example.ts</code>");
    expect(messages[0]!.html).toContain(
      "<code>/repo/.worktrees/nightly/.t3code-nightly-runs/run/nightly-agent-report.md</code>",
    );
    expect(messages[0]!.html).toContain("remote-access: repaired");
    expect(JSON.stringify(messages[0]!.replyMarkup)).toContain("Copy: ask full report");
  });

  it("formats autonomous repair prompts with topic replay contracts", () => {
    const prompt = formatAutonomousRepairPrompt({
      attempt: 1,
      maxAttempts: 1,
      conflictPromptPath:
        "/repo/.worktrees/nightly/.t3code-nightly-runs/run/hermes-conflict-prompt.md",
      conflictPacketPath: "/repo/.worktrees/nightly/.t3code-nightly-runs/run/conflict-packet.md",
      nightlyPath: "/repo/.worktrees/nightly",
      controlRoot: "/repo",
      resultPath:
        "/repo/.worktrees/nightly/.t3code-nightly-runs/run/autonomous-repair-result-attempt-1.json",
      repairEvidencePath:
        "/repo/.worktrees/nightly/.t3code-nightly-runs/run/repair-evidence-attempt-1.md",
      conflictFiles: ["apps/web/src/components/ChatView.tsx"],
      topic: {
        id: "provider-settings",
        pluginPath: "local-plugins/provider-settings",
        title: "Provider usage, reset, and T3 access controls",
        subject: "feat(provider-settings): add usage, reset, and T3 access controls",
        commits: ["abc123"],
        verification: ["vp check", "vp run typecheck"],
        repairPaths: [
          "apps/web/src/localTopics/providerSettings",
          "apps/web/src/components/ChatView.tsx",
        ],
        replayContract: {
          autonomy: "low-risk-auto-repair",
          risk: "low",
          intent: "Keep the provider usage popover visible.",
          preserve: ["Provider usage remains visible in the composer footer."],
          safeAutoRepair: ["Move thin composer wiring through the new upstream footer shape."],
          stopForHuman: ["Stop when upstream removes provider usage semantics."],
          verification: ["vp check", "vp run typecheck"],
        },
        checklist: {},
        replayStatuses: ["conflict:abc123"],
      },
    });

    expect(prompt).toContain("You may edit only this nightly worktree");
    expect(prompt).toContain("records its host, worktree policy, service, timer, checks");
    expect(prompt).toContain("Do not create tracker issues or unrelated repo files");
    expect(prompt).toContain("repair-evidence-attempt-1.md");
    expect(prompt).toContain("Do not print or read the full conflict packet");
    expect(prompt).toContain("apps/web/src/components/ChatView.tsx");
    expect(prompt).toContain(
      "use apply_patch to write the required structured JSON decision directly",
    );
    expect(prompt).toContain("do not rely on the final response");
    expect(prompt).toContain("apps/web/src/localTopics/providerSettings");
    expect(prompt).toContain("Autonomy: low-risk-auto-repair");
    expect(prompt).toContain("Keep the provider usage popover visible.");
    expect(prompt).toContain("git cherry-pick --continue");
    expect(prompt).toContain("wrapper independently enforces every Replay Contract");
    expect(prompt).toContain("Stop when upstream removes provider usage semantics.");
  });

  it("announces the running workflow before fetch and replay", () => {
    expect(
      formatRunningTelegramNotice({
        startedAt: "2026-07-09T00:00:00.000Z",
        controlRoot: "/repo",
        originalPath: "/repo/.worktrees/original",
        nightlyPath: "/repo/.worktrees/nightly",
      }),
    ).toContain("Running nightly upgrade workflow");
  });

  it("summarizes upstream commits before replay starts", () => {
    const summary = formatUpstreamTelegramNotice({
      decisionReason: "upstream-changed",
      willReplay: true,
      upstreamBefore: "a".repeat(40),
      upstreamAfter: "b".repeat(40),
      upstreamCommits: ["abc123 2026-07-09 feat: upstream thing"],
      topicSummaries: [
        {
          id: "remote-access",
          pluginPath: "local-plugins/remote-access",
          title: "Remote Access",
          subject: "feat(remote-access): manage Tailscale and routed browser access",
          commits: [],
          verification: [],
          checklist: {},
          replayStatuses: [],
        },
      ],
    });

    expect(summary).toContain("Nightly upstream summary");
    expect(summary).toContain("abc123 2026-07-09 feat: upstream thing");
    expect(summary).toContain("Replay: starting local topic stack replay now.");
  });

  it("formats upstream summaries as compact Telegram cards", () => {
    const messages = formatUpstreamTelegramNoticeMessages({
      decisionReason: "nightly-dirty",
      willReplay: false,
      blocker: "Nightly worktree is dirty; refusing to reset or replay it.",
      upstreamBefore: "a".repeat(40),
      upstreamAfter: "b".repeat(40),
      upstreamCommits: [
        "abc1234 2026-07-09 Expose mobile PR indicator labels to accessibility (#3828)",
        "def5678 2026-07-09 [codex] Label max and ultra reasoning (#3824)",
        "123abcd 2026-07-08 Upgrade Clerk toolchain to latest versions (#3785)",
        "456def0 2026-07-08 Fix desktop native optional dependency packaging (#3816)",
      ],
      topicSummaries: Array.from({ length: 8 }, (_, index) => ({
        id: `topic-${index + 1}`,
        pluginPath: `local-plugins/topic-${index + 1}`,
        title: `Topic ${index + 1}`,
        subject: `feat(topic-${index + 1}): replayable local feature ${index + 1}`,
        commits: [],
        verification: [],
        checklist: {},
        replayStatuses: [],
      })),
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]!.html).toContain("<b>Official changes overview</b>");
    expect(messages[0]!.html).toContain("<b>Mobile/client</b>: 1 change");
    expect(messages[0]!.html).toContain("<b>Codex/runtime</b>: 1 change");
    expect(messages[0]!.html).toContain("<b>Auth/dependencies</b>: 1 change");
    expect(messages[0]!.html).toContain("<b>Desktop/release</b>: 1 change");
    expect(messages[0]!.html).toContain("...and 2 more topics");
    expect(messages[0]!.html).not.toContain("feat(topic-8):");
    expect(JSON.stringify(messages[0]!.replyMarkup)).toContain("Copy: explain upstream");
  });

  it("prompts Hermes for a standalone feature-level Conflict Brief", () => {
    const prompt = formatConflictBriefGenerationPrompt({
      conflictPromptPath: "/run/hermes-conflict-prompt.md",
      conflictPacketPath: "/run/conflict-packet.md",
      reportPath: "/run/nightly-agent-report.md",
      topicCatalogPath: "/run/topic-catalog.md",
    });

    expect(prompt).toContain("standalone Conflict Brief");
    expect(prompt).toContain("feature-level, not file-by-file");
    expect(prompt).toContain("Default to auto-repair when the local topic feature can still work");
    expect(prompt).toContain("Auto-repair eligibility:");
    expect(prompt).toContain("Always give a recommendation");
    expect(prompt).toContain("exact decision Jordan needs to make");
  });

  it("keeps long Conflict Briefs bounded while preserving the next action", () => {
    const brief = normalizeConflictBriefForTelegram(
      [
        "# Conflict Brief",
        "Feature conflict overview:",
        "x".repeat(5_000),
        "Next action:",
        "Tap an option in the Conflict Decision Card.",
      ].join("\n"),
    );

    expect(brief.length).toBeLessThanOrEqual(3_700);
    expect(brief).toContain("raw draft saved as `conflict-brief.raw.md`");
    expect(brief.endsWith("Tap an option in the Conflict Decision Card.")).toBe(true);
  });

  it("formats Conflict Briefs as short Telegram HTML messages with copy actions", () => {
    const messages = formatConflictBriefTelegramMessages({
      markdown: [
        "# Conflict Brief",
        "Feature conflict overview:",
        "Remote access conflicts with upstream storage changes.",
        "What upstream changed:",
        "Upstream moved storage into `MobileSecureStorage`.",
        "What our local topic is preserving:",
        "Remote tokens and public route state.",
        "Why they collide:",
        "Both sides own persistence.",
        "Auto-repair eligibility:",
        "Safe to auto-repair by adapting local semantics to upstream storage.",
        "Resolution options:",
        "Keep upstream architecture and port local semantics.",
        "Recommendation:",
        "Use option 1.",
        "Confidence:",
        "Medium-high.",
        "Risks and trade-offs:",
        "A missed token path could regress mobile remote access.",
        "Proof/tests needed:",
        "Run `vp run lint:mobile`.",
        "Next action:",
        "Tap an option in the Conflict Decision Card.",
      ].join("\n"),
      reportPath: "/run/nightly-agent-report.md",
      topicCatalogPath: "/run/topic-catalog.md",
    });

    expect(messages).toHaveLength(3);
    expect(messages[0]!.html).toContain("<b>Feature conflict overview</b>");
    expect(messages[0]!.html).toContain("<code>MobileSecureStorage</code>");
    expect(messages[2]!.html).toContain("<b>Next action</b>");
    expect(messages[2]!.html).toContain("Tap an option in the Conflict Decision Card.");
  });

  it("formats a Conflict Decision Card with selectable Hermes actions", () => {
    const card = formatConflictDecisionCardTelegramMessage({
      markdown: [
        "# Conflict Brief",
        "Auto-repair eligibility:",
        "Safe to auto-repair by adapting local persistence to upstream storage.",
        "Recommendation:",
        "Keep upstream storage and port local `remote-access` behavior.",
      ].join("\n"),
      conflictPromptPath: "/run/hermes-conflict-prompt.md",
      reportPath: "/run/nightly-agent-report.md",
      topicCatalogPath: "/run/topic-catalog.md",
      runId: "20260709-145315",
      conflictTopicId: "remote-access",
    });

    expect(card.html).toContain("<b>Conflict Decision Card</b>");
    expect(card.html).toContain("<code>20260709-145315</code>");
    expect(card.html).toContain("<code>remote-access</code>");
    expect(card.html).toContain("<b>Auto-repair eligibility</b>");
    expect(JSON.stringify(card.replyMarkup)).toContain(
      "Jordan's Hermes: auto-repair nightly conflict 20260709-145315 remote-access",
    );
    expect(JSON.stringify(card.replyMarkup)).toContain("one_time_keyboard");
  });

  it("formats topics that applied without conflicts separately from auto-repairs", () => {
    const messages = formatAppliedTopicsTelegramMessages({
      status: "success" satisfies NightlyAgentStatus,
      decisionReason: "upstream-changed",
      reportPath: "/run/nightly-agent-report.md",
      topicCatalogPath: "/run/topic-catalog.md",
      topicSummaries: [
        {
          id: "remote-access",
          pluginPath: "local-plugins/remote-access",
          title: "Remote Access",
          subject: "feat(remote-access): manage routed access",
          commits: ["abc123"],
          verification: [],
          checklist: {},
          replayStatuses: ["applied:abc123"],
        },
        {
          id: "runtime",
          pluginPath: "local-plugins/runtime",
          title: "Runtime",
          subject: "feat(runtime): preserve context",
          commits: ["def456"],
          verification: [],
          checklist: {},
          replayStatuses: ["auto-resolved:def456"],
        },
        {
          id: "composer",
          pluginPath: "local-plugins/composer",
          title: "Composer",
          subject: "feat(composer): add menus",
          commits: ["fed321"],
          verification: [],
          checklist: {},
          replayStatuses: ["conflict:fed321"],
        },
        {
          id: "partial-repair",
          pluginPath: "local-plugins/partial-repair",
          title: "Partial Repair",
          subject: "feat(partial): repair then conflict",
          commits: ["123", "456"],
          verification: [],
          checklist: {},
          replayStatuses: ["auto-resolved:123", "conflict:456"],
        },
      ],
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]!.html).toContain("<b>T3 Code Topics Applied Without Conflicts</b>");
    expect(messages[0]!.html).toContain("[x] <code>01</code> <b>remote-access</b>");
    expect(messages[0]!.html).toContain("<b>Auto-repaired and completed</b>");
    expect(messages[0]!.html).toContain("[x] <code>01</code> <b>runtime</b>");
    expect(messages[0]!.html).not.toContain("composer");
    expect(messages[0]!.html).not.toContain("partial-repair");
  });

  it("reports only proof artifacts created during the current run", () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "nightly-proof-"));
    try {
      const proofDir = NodePath.join(root, "apps/desktop/test-results/nightly-public/run");
      NodeFS.mkdirSync(proofDir, { recursive: true });
      const stale = NodePath.join(proofDir, "stale.png");
      const current = NodePath.join(proofDir, "current.png");
      NodeFS.writeFileSync(stale, "stale");
      NodeFS.writeFileSync(current, "current");
      NodeFS.utimesSync(
        stale,
        new Date("2026-07-09T00:00:00.000Z"),
        new Date("2026-07-09T00:00:00.000Z"),
      );
      NodeFS.utimesSync(
        current,
        new Date("2026-07-10T00:01:00.000Z"),
        new Date("2026-07-10T00:01:00.000Z"),
      );

      expect(collectProofArtifacts(root, "2026-07-10T00:00:00.000Z")).toEqual([current]);
    } finally {
      NodeFS.rmSync(root, { recursive: true, force: true });
    }
  });

  it("summarizes completed-stack and focused verification results", () => {
    const lines = proofSummaryLines({
      status: "success",
      startedAt: "2026-07-10T00:00:00.000Z",
      finishedAt: "2026-07-10T00:02:00.000Z",
      controlRoot: "/repo",
      repoFamilyRoot: "/repo",
      originalPath: "/repo/.worktrees/original",
      nightlyPath: "/repo/.worktrees/nightly",
      artifactDir: "/repo/run",
      reportPath: "/repo/run/report.md",
      topicCatalogPath: "/repo/run/catalog.md",
      decisionReason: "upstream-changed",
      upstreamCommits: [],
      topicSummaries: [],
      topicRecords: [],
      commandResults: [
        {
          command: "corepack pnpm run topic-stack:nightly -- --apply",
          cwd: "/repo",
          exitCode: 1,
          stdout: "paused on the conflict before repair",
          stderr: "",
        },
        {
          command: "corepack pnpm run topic-stack:nightly -- --apply",
          cwd: "/repo",
          exitCode: 0,
          stdout: "",
          stderr: "",
        },
      ],
      conflictFiles: [],
      conflictArtifacts: [],
      autoRepairAttempts: [
        {
          attempt: 1,
          topicId: "provider-settings",
          commit: "abc",
          status: "repaired",
          promptPath: "/repo/run/prompt.md",
          resultPath: "/repo/run/result.json",
          message: "verified",
          verificationResults: [
            {
              command: "vp test run provider-settings.test.ts",
              cwd: "/repo/.worktrees/nightly",
              exitCode: 0,
              stdout: "",
              stderr: "",
            },
          ],
        },
      ],
      proofArtifacts: [],
    });

    expect(lines).toContain(
      "Completed stack: PASS (frozen install, vp check, vp run typecheck, topic metadata validation).",
    );
    expect(lines).toContain("PASS: vp test run provider-settings.test.ts");
    expect(lines).toContain("Nightly public verifier: not requested for this run.");
    expect(lines).toContain("Run-specific browser artifacts: none.");
  });

  it("formats the topic stack as a Telegram checklist", () => {
    const messages = formatTopicStackChecklistTelegramMessages({
      status: "failed" satisfies NightlyAgentStatus,
      decisionReason: "nightly-dirty",
      upstreamBefore: "a".repeat(40),
      upstreamAfter: "b".repeat(40),
      reportPath: "/run/nightly-agent-report.md",
      topicCatalogPath: "/run/topic-catalog.md",
      topicSummaries: [
        {
          id: "remote-access",
          pluginPath: "local-plugins/remote-access",
          title: "Remote Access",
          subject: "feat(remote-access): manage routed access",
          commits: ["abc123"],
          verification: [],
          checklist: {},
          replayStatuses: ["conflict:abc123"],
        },
        {
          id: "runtime",
          pluginPath: "local-plugins/runtime",
          title: "Runtime",
          subject: "feat(runtime): preserve context",
          commits: ["def456"],
          verification: [],
          checklist: {},
          replayStatuses: ["applied:def456"],
        },
        {
          id: "composer",
          pluginPath: "local-plugins/composer",
          title: "Composer",
          subject: "feat(composer): add menus",
          commits: ["fed321"],
          verification: [],
          checklist: {},
          replayStatuses: [],
        },
      ],
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]!.html).toContain("<b>T3 Code Topic Stack Checklist</b>");
    expect(messages[0]!.html).toContain("[!] <code>01</code> <b>remote-access</b> - conflicted");
    expect(messages[0]!.html).toContain("[x] <code>02</code> <b>runtime</b> - replayed");
    expect(messages[0]!.html).toContain("[ ] <code>03</code> <b>composer</b> - not run");
    expect(JSON.stringify(messages[0]!.replyMarkup)).toContain("Copy: show failed/conflicted");
  });

  it("creates a topic catalog that points agents at local topic docs and tests", () => {
    const catalog = formatTopicCatalog({
      status: "success" satisfies NightlyAgentStatus,
      startedAt: "2026-07-09T00:00:00.000Z",
      finishedAt: "2026-07-09T00:01:00.000Z",
      controlRoot: "/repo",
      repoFamilyRoot: "/repo",
      originalPath: "/repo/.worktrees/original",
      nightlyPath: "/repo/.worktrees/nightly",
      artifactDir: "/repo/.worktrees/nightly/.t3code-nightly-runs/run",
      reportPath: "/repo/.worktrees/nightly/.t3code-nightly-runs/run/nightly-agent-report.md",
      topicCatalogPath: "/repo/.worktrees/nightly/.t3code-nightly-runs/run/topic-catalog.md",
      decisionReason: "upstream-changed",
      upstreamBefore: "a".repeat(40),
      upstreamAfter: "b".repeat(40),
      upstreamCommits: ["abc123 2026-07-09 feat: upstream thing"],
      topicSummaries: [
        {
          id: "remote-access",
          pluginPath: "local-plugins/remote-access",
          title: "Remote Access",
          subject: "feat(remote-access): manage Tailscale and routed browser access",
          commits: ["abc123"],
          verification: ["vp test run apps/desktop/example.test.ts"],
          checklist: {
            "Added Tests": ["- [x] Test proof in `apps/desktop/example.test.ts`."],
          },
          replayStatuses: ["applied:abc123"],
        },
      ],
      topicRecords: [],
      commandResults: [],
      conflictFiles: [],
      conflictArtifacts: [],
      proofArtifacts: [],
    });

    expect(catalog).toContain("How To Use This Catalog");
    expect(catalog).toContain("local-plugins/remote-access/README.md");
    expect(catalog).toContain("vp test run apps/desktop/example.test.ts");
  });
});
