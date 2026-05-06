export type WhisperStdoutEvent =
  | { kind: "partial"; text: string }
  | { kind: "commit"; text: string };

const ANSI_ESCAPE_RE = /\[[0-9;]*[a-zA-Z]/g;

function clean(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, "").trim();
}

export function parseWhisperStdoutLine(line: string): WhisperStdoutEvent | null {
  if (line.trim().length === 0) return null;

  if (line.startsWith("[partial]")) {
    return { kind: "partial", text: clean(line.slice("[partial]".length)) };
  }
  if (line.startsWith("[commit]")) {
    return { kind: "commit", text: clean(line.slice("[commit]".length)) };
  }
  return null;
}
