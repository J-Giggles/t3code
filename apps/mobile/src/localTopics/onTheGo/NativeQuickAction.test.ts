import type { Action } from "expo-quick-actions";
import { describe, expect, it } from "vitest";

import {
  ON_THE_GO_QUICK_ACTION,
  ON_THE_GO_QUICK_ACTION_ID,
  isOnTheGoQuickAction,
} from "./NativeQuickAction";

describe("On-the-Go native quick action", () => {
  it("OTG-UT-006/021: exposes one explicit launcher action for starting voice control", () => {
    expect(ON_THE_GO_QUICK_ACTION).toEqual({
      id: ON_THE_GO_QUICK_ACTION_ID,
      title: "On-the-Go voice",
      subtitle: "Start hands-free control",
      icon: "shortcut_icon",
      params: { onTheGo: "start" },
    });
    expect(isOnTheGoQuickAction(ON_THE_GO_QUICK_ACTION)).toBe(true);
  });

  it("OTG-UT-006: refuses a matching identifier when its bound action is changed", () => {
    expect(
      isOnTheGoQuickAction({
        ...ON_THE_GO_QUICK_ACTION,
        params: { onTheGo: "stop" },
      } as Action),
    ).toBe(false);
  });

  it("OTG-UT-021: ignores missing and unrelated platform actions", () => {
    expect(isOnTheGoQuickAction(null)).toBe(false);
    expect(isOnTheGoQuickAction(undefined)).toBe(false);
    expect(
      isOnTheGoQuickAction({
        ...ON_THE_GO_QUICK_ACTION,
        id: "open-thread",
      }),
    ).toBe(false);
  });
});
