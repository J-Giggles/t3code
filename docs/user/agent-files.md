# Agent Files

Agent Files is a project-scoped surface for repo-local AI agent configuration.
Open it from the active project controls in the chat header.

The sheet shows files that coding agents and provider CLIs may read by default,
including `AGENTS.md`, provider rule files, `.agents/` harness files, memory,
artifacts, loop contracts, and project MCP configuration.

## Files

The **Files** tab groups detected files by role:

- Instructions
- Provider rules
- MCP/settings
- Harness
- Memory/artifacts

Present files show provider badges, default-loading status, size, and update
time. Missing recommended files can be created from T3 Code templates.

Editing writes directly to the active project repository through the project
RPC. Deleting asks for confirmation first. The canonical root `AGENTS.md` is
protected from deletion because it is the shared entry point for the harness.

## Harness

The **Harness** tab reads `.agents/harness.json` when present. The manifest is
optional; T3 Code still detects known provider files when it is absent.

Use **Scaffold** to create missing `.agents/` harness files. Scaffolding never
overwrites an existing file. It returns the created and skipped paths so you can
review what changed.

## MCP/Auth

The **MCP/Auth** tab lists secret references declared by project MCP servers and
tool-auth entries in `.agents/harness.json`.

Repo files are shareable. Auth values are not written into the repo. Secret
values are stored in T3 Code's server secret store under a project-scoped key.
The UI only shows whether a value is configured; it never re-renders stored
secret values.

Use this for per-project CLI or MCP credentials such as separate GitHub CLI,
Vercel, PostHog, Jira, or provider-specific tokens.

## Memory

The **Memory** tab shows `.agents/memory`, `.agents/artifacts`, and
`.agents/loops` files. These files are intended to carry reusable context
between agent sessions, such as project facts, known decisions, recurring
issues, signals, tasks, and loop timelines.

## Safety Rules

- Files are read and written relative to the active project root.
- Absolute paths and traversal paths are rejected.
- Directory deletes are rejected.
- Scaffolding skips existing files.
- Missing or invalid `.agents/harness.json` does not block file listing.
- Missing MCP secrets prevent that project MCP from being injected into provider
  sessions.
