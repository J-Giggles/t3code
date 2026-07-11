export interface IsolatedAgentChromeArgs {
  readonly url: string;
}

export function parseIsolatedAgentChromeArgs(args: ReadonlyArray<string>): IsolatedAgentChromeArgs {
  const options = args.filter((argument) => argument !== "--");
  if (options.length > 1) {
    throw new Error("Usage: pnpm run agent-browser:isolated -- [https://example.com]");
  }
  const url = options[0] ?? "about:blank";
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
