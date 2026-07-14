import { describe, expect, it } from "vite-plus/test";

import { containsSensitiveText, redactSensitiveText } from "./sensitiveText.ts";

describe("sensitive text egress sanitizer", () => {
  it("OTG-UT-009/013/019: redacts adversarial credential formats through one shared boundary", () => {
    const secrets = [
      "password is hunter2",
      "API_KEY='do-not-share'",
      "Authorization: Bearer abcdefghijklmnop",
      "sk-abcdefghijklmnopqrstuvwxyz",
      "ghp_abcdefghijklmnopqrstuvwxyz",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.abcdefghijklmno",
      "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----",
      "https://alice:hunter2@example.test/path?access_token=do-not-share",
      "PROVIDER_REFRESH_TOKEN=do-not-share",
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    ];
    for (const secret of secrets) {
      const redacted = redactSensitiveText(`Safe prefix. ${secret} Safe suffix.`);
      expect(redacted).toContain("Safe prefix.");
      expect(redacted).not.toContain("hunter2");
      expect(redacted).not.toContain("do-not-share");
      expect(containsSensitiveText(secret)).toBe(true);
    }
  });

  it("OTG-UT-009: preserves ordinary prose and short non-secret identifiers", () => {
    const prose = "Tests passed for chat-123 and the follow summary is ready.";
    expect(redactSensitiveText(prose)).toBe(prose);
    expect(containsSensitiveText(prose)).toBe(false);
  });
});
