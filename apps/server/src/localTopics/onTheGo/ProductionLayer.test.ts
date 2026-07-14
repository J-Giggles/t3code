import { OnTheGoCommandId, type OnTheGoCommandDisposition } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { boundOnTheGoDispositions } from "./ProductionLayer.ts";

describe("On-the-Go production persistence", () => {
  it("OTG-UT-022: compacts command dispositions to a fixed recent window", () => {
    const entries = Array.from({ length: 4_100 }, (_, index) => {
      const commandId = OnTheGoCommandId.make(`command-${index}`);
      const disposition: OnTheGoCommandDisposition = { status: "accepted", commandId };
      return [commandId, disposition] as const;
    });
    const bounded = boundOnTheGoDispositions(Object.fromEntries(entries));

    expect(Object.keys(bounded)).toHaveLength(4_096);
    expect(Object.keys(bounded)[0]).toBe("command-4");
    expect(Object.keys(bounded).at(-1)).toBe("command-4099");
  });
});
