# Local Topic Plugins

This directory describes the local replay stack as repo-internal plugins. These
folders are documentation and ownership manifests for the Jordan topic stack;
they are not installable Codex plugins and must not contain
`.codex-plugin/plugin.json`.

Each `local-plugins/<topic>/` folder owns one cherry-pickable topic listed in
`docs/operations/jordan-topic-stack.manifest.json`. The folder must contain:

- `plugin.json` with the topic id, current commit hash, owned paths,
  component entrypoints or pending legacy entrypoints, and verification commands.
- `README.md` using the required headings from
  `scripts/lib/local-topic-stack.ts`.

When a topic is squashed, split, renamed, dropped, or materially changed, update
the manifest and matching plugin folder in the same branch. New local topic code
should be componentized behind package-local modules such as
`apps/web/src/localTopics/<topic>/index.ts`, then wired into main app files with
thin imports.

Run validation with:

```bash
pnpm run topic-plugins:check
```
