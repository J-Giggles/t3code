import { expect, it } from "vite-plus/test";

import { makeBrowserLogsPayload } from "./clientLogs";

it("builds an OTLP logs payload for browser console errors", () => {
  const payload = makeBrowserLogsPayload({
    level: "ERROR",
    message: "boom",
    attributes: {
      component: "test",
      count: 2,
    },
  }) as {
    resourceLogs: Array<{
      resource: { attributes: Array<{ key: string; value: Record<string, unknown> }> };
      scopeLogs: Array<{
        logRecords: Array<{
          severityText: string;
          body: { stringValue: string };
          attributes: Array<{ key: string; value: Record<string, unknown> }>;
        }>;
      }>;
    }>;
  };

  const record = payload.resourceLogs[0]?.scopeLogs[0]?.logRecords[0];
  expect(record?.severityText).toBe("ERROR");
  expect(record?.body.stringValue).toBe("boom");
  expect(record?.attributes.some((entry) => entry.key === "component")).toBe(true);
  expect(
    payload.resourceLogs[0]?.resource.attributes.some((entry) => entry.key === "service.name"),
  ).toBe(true);
});
