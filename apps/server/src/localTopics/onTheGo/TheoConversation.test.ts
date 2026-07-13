import {
  DEFAULT_ON_THE_GO_SETTINGS,
  DEFAULT_SERVER_SETTINGS,
  ProviderInstanceId,
  type ServerSettings,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  buildTheoAuthorizedContext,
  resolveTheoModelCandidates,
  runTheoModelCandidates,
} from "./TheoConversation.ts";

const settings = {
  ...DEFAULT_SERVER_SETTINGS,
  textGenerationModelSelection: {
    instanceId: ProviderInstanceId.make("codex"),
    model: "system-model",
  },
  onTheGo: {
    ...DEFAULT_ON_THE_GO_SETTINGS,
    theoModel: { providerId: "codex", modelId: "primary", capability: "reasoning" },
    fallbackModels: {
      transcription: [],
      speech: [],
      reasoning: [
        { providerId: "claudeAgent", modelId: "approved", capability: "reasoning" },
        { providerId: "codex", modelId: "primary", capability: "reasoning" },
      ],
    },
  },
} satisfies Pick<ServerSettings, "onTheGo" | "textGenerationModelSelection">;

describe("Theo conversation policy", () => {
  it("OTG-UT-015 uses only the selected model and deduplicated approved fallbacks", () => {
    expect(resolveTheoModelCandidates(settings)).toEqual([
      {
        label: "selected Theo model",
        providerId: "codex",
        modelId: "primary",
        modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "primary" },
        fallback: false,
      },
      {
        label: "claudeAgent/approved",
        providerId: "claudeAgent",
        modelId: "approved",
        modelSelection: {
          instanceId: ProviderInstanceId.make("claudeAgent"),
          model: "approved",
        },
        fallback: true,
      },
    ]);
  });

  it.effect("OTG-UT-015 retries an approved fallback and discloses it", () =>
    Effect.gen(function* () {
      const candidates = resolveTheoModelCandidates(settings);
      const attempted = new Array<string>();
      const outcome = yield* runTheoModelCandidates({
        candidates,
        consumeBudget: () => ({ allowed: true, warning: false }),
        generate: (candidate) => {
          attempted.push(candidate.label);
          return candidate.fallback
            ? Effect.succeed({ title: "NONE", body: "Fallback reply" })
            : Effect.fail("offline");
        },
      });
      expect(attempted).toEqual(["selected Theo model", "claudeAgent/approved"]);
      expect(outcome).toMatchObject({ fallbackLabel: "claudeAgent/approved", unavailable: false });
    }),
  );

  it.effect("OTG-UT-015 hard-stops remote calls at budget while preserving a local reply", () =>
    Effect.gen(function* () {
      let generated = false;
      const outcome = yield* runTheoModelCandidates({
        candidates: resolveTheoModelCandidates(settings),
        consumeBudget: () => ({ allowed: false, reason: "budget-exhausted" }),
        generate: () => {
          generated = true;
          return Effect.succeed({ title: "NONE", body: "must not run" });
        },
      });
      expect(generated).toBe(false);
      expect(outcome.generated.body).toContain("Local safety commands still work");
    }),
  );

  it("OTG-UT-014 keeps retrieved evidence explicitly untrusted and bounded", () => {
    expect(
      buildTheoAuthorizedContext({
        selectedResponseSummary: "Done",
        authorizedEvidence: "<context>Evidence</context>",
      }),
    ).toContain("UNTRUSTED FOCUSED RESPONSE AND AUTHORIZED T3 CONTEXT");
  });
});
