export interface IsolatedAgentChromeArgs {
  readonly url: string;
}

export function parseIsolatedAgentChromeArgs(args: ReadonlyArray<string>): IsolatedAgentChromeArgs {
  if (args.length > 1) {
    throw new Error("Usage: pnpm run agent-browser:isolated -- [https://example.com]");
  }
  const url = args[0] ?? "about:blank";
  if (url !== "about:blank") {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("The isolated browser accepts only HTTP, HTTPS, or about:blank URLs.");
    }
  }
  return { url };
}

export function buildIsolatedAgentChromeCommand(
  profileDirectory: string,
  url: string,
): ReadonlyArray<string> {
  return [
    `--user-data-dir=${profileDirectory}`,
    "--disable-sync",
    "--no-first-run",
    "--no-default-browser-check",
    url,
  ];
}
