import { redactSensitiveText } from "@t3tools/shared/sensitiveText";

export type OnTheGoOutputPrivacy = "private" | "public";

const STACK_LINE = /^\s*at\s+\S+.*:\d+(?::\d+)?\)?\s*$/u;
const REDACTED_CREDENTIAL_LINE =
  /(?:api[_ -]?key|token|password|passwd|secret|authorization|credential).*(?:\[redacted\]|\[provider token redacted\]|\[private key redacted\])/iu;

const stripUnsafeSpeech = (text: string) => {
  const withoutFences = text.replace(/```[\s\S]*?```/gu, " ");
  return redactSensitiveText(withoutFences)
    .split(/\r?\n/u)
    .filter((line) => !STACK_LINE.test(line) && !REDACTED_CREDENTIAL_LINE.test(line))
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
};

export const renderOnTheGoSpeech = (text: string, privacy: OnTheGoOutputPrivacy) => {
  const safe = stripUnsafeSpeech(text);
  if (!safe) return "Theo produced no safe spoken content";
  const limit = privacy === "public" ? 240 : 1_200;
  if (safe.length <= limit) return safe;
  const bounded = safe.slice(0, limit);
  const sentenceBoundary = Math.max(
    bounded.lastIndexOf(". "),
    bounded.lastIndexOf("? "),
    bounded.lastIndexOf("! "),
  );
  return `${(sentenceBoundary >= 80 ? bounded.slice(0, sentenceBoundary + 1) : bounded).trim()}…`;
};

export const renderOnTheGoDisplay = (text: string) => stripUnsafeSpeech(text);
