import { describe, expect, it } from "vite-plus/test";

import {
  ON_THE_GO_INTEGRATION_CONTRACT,
  validateOnTheGoIntegrationContract,
} from "./IntegrationContract.ts";

describe("On-the-Go replay integration contract", () => {
  it("OTG-UT-023: fails closed for semantic seam drift", () => {
    expect(
      validateOnTheGoIntegrationContract({
        ...ON_THE_GO_INTEGRATION_CONTRACT,
        seams: {
          ...ON_THE_GO_INTEGRATION_CONTRACT.seams,
          "rpc.dispatch": "renamed.dispatch",
        },
      }),
    ).toMatchObject({ valid: false, violations: ["rpc.dispatch:renamed.dispatch"] });
    const { "provider.events": _removed, ...missingProviderEvents } =
      ON_THE_GO_INTEGRATION_CONTRACT.seams;
    expect(
      validateOnTheGoIntegrationContract({
        ...ON_THE_GO_INTEGRATION_CONTRACT,
        seams: missingProviderEvents,
      }).valid,
    ).toBe(false);
  });

  it("OTG-UT-023: permits mechanical file moves when exported seam identities are unchanged", () => {
    expect(
      validateOnTheGoIntegrationContract({
        version: 1,
        seams: Object.fromEntries(
          Object.entries(ON_THE_GO_INTEGRATION_CONTRACT.seams).toReversed(),
        ),
      }),
    ).toEqual({ valid: true, violations: [] });
  });
});
