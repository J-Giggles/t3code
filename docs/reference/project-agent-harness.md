# Project Agent Harness

T3 Code treats repo-local agent files as a harness, not only prompts. A harness
can include provider instructions, project context, executable scripts,
validation rules, memory, artifacts, loop contracts, and project-scoped MCP
configuration.

## Recognized Files

The shared catalog lives in `packages/shared/src/agentFiles.ts`.

Initial recognized paths include:

- `AGENTS.md`, nested `**/AGENTS.md`, and `.codex/**`
- `CLAUDE.md`, `.claude/settings.json`, `.claude/commands/**/*.md`,
  `.claude/agents/**/*.md`, `.claude/skills/**/SKILL.md`, and `.mcp.json`
- `.cursor/rules/**/*.mdc`, `.cursorrules`, and `.cursor/mcp.json`
- `.github/copilot-instructions.md` and
  `.github/instructions/**/*.instructions.md`
- `GEMINI.md`
- `.windsurfrules`, `.windsurf/rules/**/*.md`, and `.devin/rules/**/*.md`
- `.agents/**`, including the harness manifest, context, validation, memory,
  loops, artifacts, templates, skills, and scripts

Each catalog entry classifies providers, kind, default loading, recommendation,
edit/delete capability, description, and template id.

## Manifest

`.agents/harness.json` is optional. When it exists, T3 Code decodes schema
version 1.

```json
{
  "version": 1,
  "canonicalInstructions": "AGENTS.md",
  "mcpServers": [],
  "memory": {
    "projectFacts": ".agents/memory/project-facts.md",
    "knownDecisions": ".agents/memory/known-decisions.md",
    "recurringIssues": ".agents/memory/recurring-issues.md"
  },
  "validation": {
    "requiredCommands": []
  },
  "toolAuth": {}
}
```

Invalid manifests return list warnings instead of failing Agent Files listing.

## Project MCP Servers

MCP servers are declared in `mcpServers`.

```json
{
  "id": "jira-local",
  "name": "jira-local",
  "enabled": true,
  "command": "node",
  "args": ["./path/to/server.js"],
  "env": {
    "JIRA_TOKEN": { "secretRef": "JIRA_TOKEN" }
  }
}
```

Project MCP merge order on provider session start:

1. The built-in `t3-code` MCP remains reserved.
2. Existing global T3 access MCPs are enabled as before.
3. Project harness MCPs are added when enabled and all referenced secrets are
   configured.
4. Duplicate MCP names are skipped with a warning. `t3-code` cannot be
   overridden.

Missing secrets never expose values. They mark the MCP unavailable in Agent
Files and prevent that MCP from being injected into the provider session.

## Tool Auth

`toolAuth` stores project-scoped environment bindings for CLIs or tools that are
not themselves MCP servers. This supports per-project GitHub CLI, Vercel,
PostHog, or similar credentials.

```json
{
  "toolAuth": {
    "vercel": {
      "env": {
        "VERCEL_TOKEN": { "secretRef": "VERCEL_TOKEN" }
      }
    },
    "posthog": {
      "env": {
        "POSTHOG_PERSONAL_API_KEY": { "secretRef": "POSTHOG_PERSONAL_API_KEY" }
      }
    }
  }
}
```

Resolved tool-auth environment variables are added to the provider process
environment for the active project session. Secret values stay in the server
secret store.

## Secret Storage

Secret values are stored under a stable key:

```text
project-agent:<project-key>:<secretRef>
```

`project-key` is derived from repository identity when available. Otherwise T3
Code hashes the normalized workspace root. Repo files should contain only
`secretRef` names, never the auth value itself.

## Provider Handling

- Claude receives project MCP `env` values in stdio MCP config.
- Cursor and Grok ACP map MCP `env` values to ACP environment variables.
- Codex and OpenCode receive resolved project tool/MCP environment values in
  the provider process environment while keeping command/args wiring unchanged.
