import * as NodeAssert from "node:assert/strict";

import { it } from "vite-plus/test";

import { mapCodexModelCapabilities, normalizeCodexUsage } from "./CodexProvider.ts";

it("maps current Codex model capability fields", () => {
  const capabilities = mapCodexModelCapabilities({
    additionalSpeedTiers: [],
    defaultReasoningEffort: "super-high",
    description: "Test model",
    displayName: "GPT Test",
    hidden: false,
    id: "gpt-test",
    isDefault: true,
    model: "gpt-test",
    defaultServiceTier: "flex",
    serviceTiers: [
      {
        id: "priority",
        name: "Fast",
        description: "Lower latency responses.",
      },
      {
        id: "flex",
        name: "Flex",
        description: "Lower-cost asynchronous routing.",
      },
    ],
    supportedReasoningEfforts: [
      {
        description: "Maximum reasoning",
        reasoningEffort: "super-high",
      },
    ],
  });

  NodeAssert.deepStrictEqual(capabilities.optionDescriptors, [
    {
      id: "reasoningEffort",
      label: "Reasoning",
      type: "select",
      options: [{ id: "super-high", label: "super-high", isDefault: true }],
      currentValue: "super-high",
    },
    {
      id: "serviceTier",
      label: "Service Tier",
      type: "select",
      options: [
        { id: "default", label: "Standard" },
        {
          id: "priority",
          label: "Fast",
          description: "Lower latency responses.",
        },
        {
          id: "flex",
          label: "Flex",
          description: "Lower-cost asynchronous routing.",
          isDefault: true,
        },
      ],
      currentValue: "flex",
    },
  ]);
});

it("uses standard routing when the catalog has no default service tier", () => {
  const capabilities = mapCodexModelCapabilities({
    additionalSpeedTiers: ["fast"],
    defaultReasoningEffort: "medium",
    defaultServiceTier: null,
    description: "Test model",
    displayName: "GPT Test",
    hidden: false,
    id: "gpt-test",
    isDefault: true,
    model: "gpt-test",
    serviceTiers: [
      {
        id: "priority",
        name: "Fast",
        description: "1.5x speed, increased usage",
      },
    ],
    supportedReasoningEfforts: [],
  });

  NodeAssert.deepStrictEqual(capabilities.optionDescriptors, [
    {
      id: "serviceTier",
      label: "Service Tier",
      type: "select",
      options: [
        { id: "default", label: "Standard", isDefault: true },
        {
          id: "priority",
          label: "Fast",
          description: "1.5x speed, increased usage",
        },
      ],
      currentValue: "default",
    },
  ]);
});

it("defaults to fast service tier when Codex exposes one", () => {
  const capabilities = mapCodexModelCapabilities({
    additionalSpeedTiers: [],
    defaultReasoningEffort: "medium",
    defaultServiceTier: "flex",
    description: "Test model",
    displayName: "GPT Test",
    hidden: false,
    id: "gpt-test",
    isDefault: true,
    model: "gpt-test",
    serviceTiers: [
      {
        id: "fast",
        name: "Fast",
        description: "Lower latency responses.",
      },
      {
        id: "flex",
        name: "Flex",
        description: "Lower-cost asynchronous routing.",
      },
    ],
    supportedReasoningEfforts: [],
  });

  const serviceTierDescriptor = capabilities.optionDescriptors?.find(
    (descriptor) => descriptor.id === "serviceTier",
  );
  NodeAssert.deepStrictEqual(serviceTierDescriptor, {
    id: "serviceTier",
    label: "Service Tier",
    type: "select",
    options: [
      { id: "default", label: "Standard" },
      {
        id: "fast",
        label: "Fast",
        description: "Lower latency responses.",
        isDefault: true,
      },
      {
        id: "flex",
        label: "Flex",
        description: "Lower-cost asynchronous routing.",
      },
    ],
    currentValue: "fast",
  });
});

it("normalizes Codex usage limits in a stable display order", () => {
  const usage = normalizeCodexUsage({
    checkedAt: "2026-06-18T12:00:00.000Z",
    rateLimits: {
      rateLimits: {
        limitId: "fallback",
        limitName: "Fallback",
        primary: { usedPercent: 1, windowDurationMins: 1440 },
      },
      rateLimitsByLimitId: {
        zulu: {
          limitId: "zulu",
          limitName: "Zulu",
          primary: { usedPercent: 7, windowDurationMins: 1440 },
        },
        spark: {
          limitId: "spark",
          limitName: "Codex Spark",
          primary: { usedPercent: 70, windowDurationMins: 10080 },
          secondary: { usedPercent: 20, windowDurationMins: 1440 },
        },
        alpha: {
          limitId: "alpha",
          limitName: "Alpha",
          primary: { usedPercent: 12, windowDurationMins: null },
          secondary: { usedPercent: 4, windowDurationMins: 60 },
        },
        codex: {
          limitId: "codex",
          limitName: "Codex",
          primary: { usedPercent: 65, windowDurationMins: 1440 },
          secondary: { usedPercent: 30, windowDurationMins: 60 },
        },
      },
    },
  });

  NodeAssert.deepStrictEqual(
    usage.limits.map((limit) => limit.label),
    ["Codex", "Codex Spark", "Alpha", "Zulu"],
  );
  NodeAssert.deepStrictEqual(
    usage.limits
      .find((limit) => limit.label === "Codex")
      ?.windows.map((window) => ({
        label: window.label,
        windowMinutes: window.windowMinutes,
      })),
    [
      { label: "1h limit", windowMinutes: 60 },
      { label: "Daily limit", windowMinutes: 1440 },
    ],
  );
  NodeAssert.deepStrictEqual(
    usage.limits
      .find((limit) => limit.label === "Codex Spark")
      ?.windows.map((window) => ({
        label: window.label,
        windowMinutes: window.windowMinutes,
      })),
    [
      { label: "Daily limit", windowMinutes: 1440 },
      { label: "Weekly limit", windowMinutes: 10080 },
    ],
  );
  NodeAssert.deepStrictEqual(
    usage.limits
      .find((limit) => limit.label === "Alpha")
      ?.windows.map((window) => ({
        label: window.label,
        windowMinutes: window.windowMinutes,
      })),
    [
      { label: "1h limit", windowMinutes: 60 },
      { label: "Limit", windowMinutes: null },
    ],
  );
});
