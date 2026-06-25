import { expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
import { Tool } from "effect/unstable/ai";

import { ObservabilityToolkit } from "./tools.ts";

it("exports read-only provider-compatible observability tools", () => {
  for (const tool of Object.values(ObservabilityToolkit.tools)) {
    const schema = Tool.getJsonSchema(tool) as {
      readonly type?: unknown;
      readonly anyOf?: unknown;
      readonly oneOf?: unknown;
    };

    expect(
      tool.description?.length ?? 0,
      `${tool.name} should have a useful description`,
    ).toBeGreaterThan(40);
    expect(schema.type, `${tool.name} must export a top-level object schema`).toBe("object");
    expect(schema.anyOf, `${tool.name} must not export a root anyOf`).toBeUndefined();
    expect(schema.oneOf, `${tool.name} must not export a root oneOf`).toBeUndefined();
    expect(Context.get(tool.annotations, Tool.Readonly), `${tool.name} should be read-only`).toBe(
      true,
    );
    expect(
      Context.get(tool.annotations, Tool.Idempotent),
      `${tool.name} should be idempotent`,
    ).toBe(true);
    expect(
      Context.get(tool.annotations, Tool.Destructive),
      `${tool.name} should not be destructive`,
    ).toBe(false);
    expect(
      Context.get(tool.annotations, Tool.OpenWorld),
      `${tool.name} should not call external services`,
    ).toBe(false);
  }
});
