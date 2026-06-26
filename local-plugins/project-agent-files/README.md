# Project Agent File Schemas, CRUD, And Scaffold Safety

## Purpose

Provide project-scoped agent file management with typed schemas, safe CRUD, and scaffold support.

## Current Commits

- `2068feb0dd69076677136bb57d7539033a50102b` `feat(project-agent-files): add schemas, CRUD, and scaffold safety`

## Squash / Replay History

This topic combines schemas, server operations, UI sheet behavior, secret handling, and docs for project agent files.

## Added Features

- Agent file descriptor schemas and harness manifest schemas.
- Project-safe read, write, scaffold, and secret-key operations.
- Provider MCP/env injection for project-scoped harness files.

## Added UI

- Agent Files sheet for listing, reading, editing, and scaffolding project agent files.

## Added Server And Runtime Behavior

- Server file operations stay scoped to the active project root.
- Secret resolution injects project-scoped MCP keys without exposing raw secrets in UI state.

## Added Tests

- Schema, resolver, CRUD, scaffold safety, and browser sheet tests.

## Component Entrypoints

Pending legacy extraction:

- `apps/web/src/localTopics/projectAgentFiles/index.ts`
- `apps/server/src/localTopics/projectAgentFiles/index.ts`
- `packages/contracts/src/localTopics/projectAgentFiles/index.ts`

## Integration Points

- `packages/contracts/src/projectAgentFiles.ts`
- `apps/server/src/project/Layers/ProjectAgentFiles.ts`
- `apps/server/src/project/Layers/ProjectAgentHarnessResolver.ts`
- `apps/web/src/components/projectAgentFiles`

## Focused Implementation Snippets

`apps/server/src/project/Layers/ProjectAgentFiles.ts`

```ts
listProjectAgentFiles(projectId);
readProjectAgentFile(input);
writeProjectAgentFile(input);
scaffoldProjectAgentHarness(input);
```

`packages/contracts/src/projectAgentFiles.ts`

```ts
ProjectAgentFileDescriptor;
ProjectAgentHarnessManifest;
ProjectAgentHarnessScaffoldResult;
```

## Replay Notes

Replay after app-automation so browser sheet coverage can use the headed automation utilities when needed.

## Verification

- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- Extract Agent Files sheet state and server layer wiring into topic-owned modules.
