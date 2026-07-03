# Project Agent File Schemas, CRUD, And Scaffold Safety

## Purpose

Provide project-scoped agent file management with typed schemas, safe CRUD, and scaffold support.

## Current Commits

- `a4018fb808c108e43aa333244ea9bb99a1456d72` `feat(project-agent-files): add schemas, CRUD, and scaffold safety`

## Squash / Replay History

This topic combines schemas, server operations, UI sheet behavior, secret handling, and docs for project agent files.

## Added Features

- [x] Agent file descriptor and harness manifest schemas are defined in contracts (`packages/contracts/src/localTopics/projectAgentFiles/index.ts`, `packages/contracts/src/localTopics/projectAgentFiles/index.ts`).
- [x] Project-safe read, write, scaffold, and secret-key operations are owned by server project layers (`apps/server/src/project/Layers/ProjectAgentFiles.ts`).
- [x] Provider MCP/env injection supports project-scoped harness files (`apps/server/src/project/Layers/ProjectAgentFiles.ts`, `packages/contracts/src/localTopics/projectAgentFiles/index.ts`).

## Added UI

- [x] Agent Files sheet lists, reads, edits, and scaffolds project agent files (`apps/web/src/components/project-agent-files/ProjectAgentFilesSheet.tsx`).

## Added Server And Runtime Behavior

- [x] Server file operations stay scoped to the active project root (`apps/server/src/project/Layers/ProjectAgentFiles.ts`).
- [x] Secret resolution injects project-scoped MCP keys without exposing raw secrets in UI state (`apps/server/src/project/Layers/ProjectAgentFiles.ts`, `packages/contracts/src/localTopics/projectAgentFiles/index.ts`).

## Added Tests

- [x] Schema, resolver, CRUD, scaffold safety, and browser sheet behavior are covered by focused tests (`packages/contracts/src/projectAgentFiles.test.ts`, `apps/web/src/components/project-agent-files/projectAgentFilesQueryState.test.ts`).

## Component Entrypoints

Componentization status: `complete`.

- `packages/contracts/src/localTopics/projectAgentFiles/index.ts` (source, facade)
- `apps/server/src/localTopics/projectAgentFiles/index.ts` (source, internal)
- `apps/web/src/localTopics/projectAgentFiles/index.ts` (source, internal)

## Integration Points

- `packages/contracts/src/localTopics/projectAgentFiles/index.ts`
- `apps/server/src/project/Layers/ProjectAgentFiles.ts`
- `apps/server/src/project/Layers/ProjectAgentHarnessResolver.ts`
- `apps/web/src/components/projectAgentFiles`

## Focused Implementation Snippets

`packages/contracts/src/localTopics/projectAgentFiles/index.ts`

```ts
export {
  ProjectAgentFileDeleteInput,
  ProjectAgentFileDeleteResult,
  ProjectAgentFileDescriptor,
  ProjectAgentFileKind,
  ProjectAgentFileOperationError,
  ProjectAgentFileProvider,
  ProjectAgentFileReadInput,
  ProjectAgentFileReadResult,
  ProjectAgentFilesListInput,
  ProjectAgentFilesListResult,
  ProjectAgentFileStatus,
```

`apps/server/src/localTopics/projectAgentFiles/index.ts`

```ts
export * from "../../project/Layers/ProjectAgentFiles.ts";
export * from "../../project/Layers/ProjectAgentHarnessResolver.ts";
export * from "../../project/Services/ProjectAgentFiles.ts";
export * from "../../project/Services/ProjectAgentHarnessResolver.ts";
export * from "../../project/projectAgentSecretKeys.ts";
```

## Replay Notes

Replay after app-automation so browser sheet coverage can use the headed automation utilities when needed.

## Verification

- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
