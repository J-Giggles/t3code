export type OnTheGoOutputPrivacy = "private" | "public";

const SECRET_LINE =
  /(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|passwd|secret|authorization)\s*[:=]/iu;
const INLINE_SECRET =
  /\b(api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|passwd|secret|authorization)\s*[:=]\s*([^\s,;]+)/giu;
const BEARER_TOKEN = /\bbearer\s+[a-z0-9._~+/=-]+/giu;
const STACK_LINE = /^\s*at\s+\S+.*:\d+(?::\d+)?\)?\s*$/u;

const stripUnsafeSpeech = (text: string) => {
  const withoutFences = text.replace(/```[\s\S]*?```/gu, " ");
  return withoutFences
    .split(/\r?\n/u)
    .filter((line) => !SECRET_LINE.test(line) && !STACK_LINE.test(line))
    .join(" ")
    .replace(INLINE_SECRET, "$1: [redacted]")
    .replace(BEARER_TOKEN, "Bearer [redacted]")
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
