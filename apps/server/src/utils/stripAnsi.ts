/**
 * Strip ANSI escape sequences (CSI and OSC) from a string.
 *
 * Anchored on the ESC byte (\x1b) to avoid false positives on text that
 * contains bracket-number patterns like "meeting at [3pm]". Matches:
 *   - CSI sequences: ESC `[` digits/semicolons letter (e.g. \x1b[2K, \x1b[1;31m)
 *   - OSC sequences: ESC `]` text BEL (e.g. \x1b]0;title\x07)
 */
// eslint-disable-next-line no-control-regex
export const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*[A-Za-z]|\x1b\].*?\x07/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, "");
}
