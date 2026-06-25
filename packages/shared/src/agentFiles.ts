export type AgentFileProvider =
  | "codex"
  | "opencode"
  | "claude"
  | "cursor"
  | "copilot"
  | "gemini"
  | "windsurf"
  | "devin"
  | "t3";

export type AgentFileKind =
  | "instructions"
  | "provider-rule"
  | "provider-settings"
  | "mcp-config"
  | "harness-manifest"
  | "harness-context"
  | "validation"
  | "memory"
  | "loop"
  | "artifact"
  | "template"
  | "skill"
  | "script"
  | "other";

export interface AgentFileClassification {
  readonly providers: readonly AgentFileProvider[];
  readonly kind: AgentFileKind;
  readonly autoLoaded: boolean;
  readonly recommended: boolean;
  readonly editable: boolean;
  readonly deletable: boolean;
  readonly description: string;
  readonly templateId?: string;
}

export interface AgentFileTemplate extends AgentFileClassification {
  readonly relativePath: string;
  readonly templateId: string;
  readonly contents: string;
}

interface AgentFileMatcher extends AgentFileClassification {
  readonly test: (relativePath: string) => boolean;
}

const ROOT_AGENT_PROMPT = `# Agent Operating Guide

## Mission

This repository should be easy for coding agents to understand, run, test, and safely modify.

## Required Reading

1. \`.agents/project.md\`
2. \`.agents/architecture.md\`
3. \`.agents/context-map.md\`
4. \`.agents/commands.md\`
5. \`.agents/validation.md\`
6. Any relevant skill in \`.agents/skills/\`

## Rules

- Prefer small, verifiable changes.
- Use documented commands from \`.agents/commands.md\`.
- Do not invent architecture; update \`.agents/architecture.md\` when reusable facts change.
- Run the validation contract before reporting completion.
- Record important reusable findings in \`.agents/logs/worklog.md\`.
`;

const SHIM_PROMPT = (provider: string) => `# ${provider} Instructions

Read \`AGENTS.md\` first. This repo uses the shared \`.agents/\` harness for project context, validation, memory, artifacts, and loop contracts.
`;

const README_PROMPT = (title: string, body: string) => `# ${title}

${body}
`;

export const AGENT_HARNESS_MANIFEST_TEMPLATE = `{
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
`;

export const AGENT_FILE_TEMPLATES: readonly AgentFileTemplate[] = [
  {
    relativePath: "AGENTS.md",
    templateId: "root-agents-md",
    providers: ["codex", "opencode"],
    kind: "instructions",
    autoLoaded: true,
    recommended: true,
    editable: true,
    deletable: false,
    description:
      "Canonical repo instructions read by Codex/OpenCode and referenced by provider shims.",
    contents: ROOT_AGENT_PROMPT,
  },
  {
    relativePath: "CLAUDE.md",
    templateId: "claude-shim",
    providers: ["claude"],
    kind: "instructions",
    autoLoaded: true,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Claude Code project instructions shim that points back to AGENTS.md.",
    contents: SHIM_PROMPT("Claude"),
  },
  {
    relativePath: "GEMINI.md",
    templateId: "gemini-shim",
    providers: ["gemini"],
    kind: "instructions",
    autoLoaded: true,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Gemini CLI project instructions shim that points back to AGENTS.md.",
    contents: SHIM_PROMPT("Gemini"),
  },
  {
    relativePath: ".cursor/rules/project.mdc",
    templateId: "cursor-project-rule",
    providers: ["cursor"],
    kind: "provider-rule",
    autoLoaded: true,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Cursor project rule shim that points back to AGENTS.md and the .agents harness.",
    contents: `---
alwaysApply: true
---

Read \`AGENTS.md\` first. Treat it as the canonical repo instruction file. Use \`.agents/\` for project context, validation, memory, artifacts, and loop contracts.
`,
  },
  {
    relativePath: ".github/copilot-instructions.md",
    templateId: "copilot-instructions",
    providers: ["copilot"],
    kind: "instructions",
    autoLoaded: true,
    recommended: true,
    editable: true,
    deletable: true,
    description: "GitHub Copilot custom instructions shim that points back to AGENTS.md.",
    contents: SHIM_PROMPT("GitHub Copilot"),
  },
  {
    relativePath: ".windsurfrules",
    templateId: "windsurf-rules",
    providers: ["windsurf"],
    kind: "provider-rule",
    autoLoaded: true,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Windsurf legacy workspace rules shim that points back to AGENTS.md.",
    contents:
      "Read `AGENTS.md` first. Use `.agents/` for project context, validation, memory, artifacts, and loop contracts.\n",
  },
  {
    relativePath: ".codex/AGENTS.md",
    templateId: "codex-agents-shim",
    providers: ["codex"],
    kind: "instructions",
    autoLoaded: true,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Codex-specific shim for projects that keep provider files under .codex.",
    contents: "Read `../AGENTS.md` first. Treat it as the canonical repo instruction file.\n",
  },
  {
    relativePath: ".agents/harness.json",
    templateId: "t3-harness-manifest",
    providers: ["t3"],
    kind: "harness-manifest",
    autoLoaded: true,
    recommended: true,
    editable: true,
    deletable: true,
    description:
      "T3 Code project harness manifest for memory, validation, and project-scoped MCPs.",
    contents: AGENT_HARNESS_MANIFEST_TEMPLATE,
  },
  {
    relativePath: ".agents/README.md",
    templateId: "agents-readme",
    providers: ["t3"],
    kind: "harness-context",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Overview for the repo-local agent harness.",
    contents: README_PROMPT(
      ".agents Harness",
      "This directory contains repo context, validation contracts, loop definitions, memory, artifacts, templates, and scripts for coding agents.",
    ),
  },
  {
    relativePath: ".agents/project.md",
    templateId: "agents-project",
    providers: ["t3"],
    kind: "harness-context",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Project/business context for agents.",
    contents: README_PROMPT(
      "Project Context",
      "Describe the product, users, critical flows, current priorities, and high-risk areas.",
    ),
  },
  {
    relativePath: ".agents/architecture.md",
    templateId: "agents-architecture",
    providers: ["t3"],
    kind: "harness-context",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Architecture notes and system boundaries for agents.",
    contents: README_PROMPT(
      "Architecture",
      "Document apps, packages, data flow, external services, and boundaries that agents must respect.",
    ),
  },
  {
    relativePath: ".agents/context-map.md",
    templateId: "agents-context-map",
    providers: ["t3"],
    kind: "harness-context",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Repo map for quickly finding apps, packages, tests, and high-risk areas.",
    contents: README_PROMPT(
      "Context Map",
      "| Path | Purpose | Notes |\n|---|---|---|\n| `.` | Repository root | Fill this in for the project. |",
    ),
  },
  {
    relativePath: ".agents/commands.md",
    templateId: "agents-commands",
    providers: ["t3"],
    kind: "harness-context",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Documented install, dev, test, build, and validation commands.",
    contents: README_PROMPT(
      "Commands",
      "List the exact package manager and commands agents should use. Do not leave command discovery to guesswork.",
    ),
  },
  {
    relativePath: ".agents/validation.md",
    templateId: "agents-validation",
    providers: ["t3"],
    kind: "validation",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Validation contract agents must satisfy before reporting completion.",
    contents: README_PROMPT(
      "Validation Contract",
      "Document required checks, narrow test strategy, browser/E2E evidence expectations, and verifier rules.",
    ),
  },
  {
    relativePath: ".agents/conventions.md",
    templateId: "agents-conventions",
    providers: ["t3"],
    kind: "harness-context",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Coding conventions and local patterns agents should follow.",
    contents: README_PROMPT(
      "Conventions",
      "Document local naming, style, testing, and abstraction patterns.",
    ),
  },
  {
    relativePath: ".agents/security.md",
    templateId: "agents-security",
    providers: ["t3"],
    kind: "harness-context",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Security rules, secret-handling rules, and sensitive workflows.",
    contents: README_PROMPT(
      "Security",
      "Document secrets policy, high-risk operations, auth boundaries, and data that must not be logged.",
    ),
  },
  {
    relativePath: ".agents/worktrees.md",
    templateId: "agents-worktrees",
    providers: ["t3"],
    kind: "harness-context",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Parallel agent branch and worktree rules.",
    contents: README_PROMPT(
      "Worktree Rules",
      "Document branch naming, isolation, promotion, and destructive-command boundaries for parallel agents.",
    ),
  },
  {
    relativePath: ".agents/memory/project-facts.md",
    templateId: "agents-memory-project-facts",
    providers: ["t3"],
    kind: "memory",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Durable project facts discovered by agents.",
    contents: README_PROMPT(
      "Project Facts",
      "Record durable facts that future agent sessions should know.",
    ),
  },
  {
    relativePath: ".agents/memory/known-decisions.md",
    templateId: "agents-memory-known-decisions",
    providers: ["t3"],
    kind: "memory",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Durable decisions and rationale.",
    contents: README_PROMPT(
      "Known Decisions",
      "Record durable technical and product decisions with dates.",
    ),
  },
  {
    relativePath: ".agents/memory/recurring-issues.md",
    templateId: "agents-memory-recurring-issues",
    providers: ["t3"],
    kind: "memory",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Recurring bugs, pitfalls, and failure modes.",
    contents: README_PROMPT(
      "Recurring Issues",
      "Record repeated failures, symptoms, causes, and fixes.",
    ),
  },
  {
    relativePath: ".agents/memory/glossary.md",
    templateId: "agents-memory-glossary",
    providers: ["t3"],
    kind: "memory",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Project vocabulary for agents.",
    contents: README_PROMPT(
      "Glossary",
      "Define domain terms, abbreviations, and project-specific names.",
    ),
  },
  {
    relativePath: ".agents/logs/worklog.md",
    templateId: "agents-worklog",
    providers: ["t3"],
    kind: "artifact",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Shared worklog for important agent findings and validation evidence.",
    contents: README_PROMPT("Worklog", "- YYYY-MM-DD: Initialized agent harness."),
  },
  {
    relativePath: ".agents/skills/README.md",
    templateId: "agents-skills-readme",
    providers: ["t3"],
    kind: "skill",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Index for project-specific agent skills.",
    contents: README_PROMPT(
      "Skills",
      "Add focused instructions for repeatable work types in this repo.",
    ),
  },
  {
    relativePath: ".agents/loops/README.md",
    templateId: "agents-loops-readme",
    providers: ["t3"],
    kind: "loop",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Index for project-specific loop contracts.",
    contents: README_PROMPT(
      "Loops",
      "Loop folders define repeatable agent workflows, inputs, boundaries, and logs.",
    ),
  },
  {
    relativePath: ".agents/loops/coding/README.md",
    templateId: "agents-loop-coding-readme",
    providers: ["t3"],
    kind: "loop",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Coding loop contract.",
    contents: README_PROMPT(
      "Coding Loop",
      "Pick one task, make the smallest useful change, validate it, update artifacts, and record what happened.",
    ),
  },
  {
    relativePath: ".agents/loops/coding/backlog.md",
    templateId: "agents-loop-coding-backlog",
    providers: ["t3"],
    kind: "loop",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Coding loop backlog.",
    contents: README_PROMPT("Coding Backlog", "- [ ] Add tasks here."),
  },
  {
    relativePath: ".agents/loops/coding/timeline.md",
    templateId: "agents-loop-coding-timeline",
    providers: ["t3"],
    kind: "loop",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Coding loop timeline.",
    contents: README_PROMPT("Coding Timeline", "- YYYY-MM-DD: Initialized."),
  },
  {
    relativePath: ".agents/artifacts/README.md",
    templateId: "agents-artifacts-readme",
    providers: ["t3"],
    kind: "artifact",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Index for shared agent artifacts.",
    contents: README_PROMPT(
      "Artifacts",
      "Store signals, tasks, decisions, tickets, docs, and experiments here.",
    ),
  },
  {
    relativePath: ".agents/artifacts/signals/README.md",
    templateId: "agents-signals-readme",
    providers: ["t3"],
    kind: "artifact",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Signal artifact guidance.",
    contents: README_PROMPT(
      "Signals",
      "Signals are reusable observations about bugs, friction, risks, or ideas.",
    ),
  },
  {
    relativePath: ".agents/templates/signal.template.md",
    templateId: "agents-template-signal",
    providers: ["t3"],
    kind: "template",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Template for signal artifacts.",
    contents: `---
id: signal-YYYYMMDD-slug
type: bug | friction | idea | risk | opportunity | ux | performance
status: new | investigating | accepted | resolved | ignored
source: support | test | logs | user | agent | analytics | manual
created: YYYY-MM-DD
updated: YYYY-MM-DD
confidence: low | medium | high
impact: low | medium | high
---

# Signal title

## Summary

What was observed?

## Evidence

- Source:
- Link/file:
- Reproduction:

## Suggested action

What should happen next?
`,
  },
  {
    relativePath: ".agents/templates/task.template.md",
    templateId: "agents-template-task",
    providers: ["t3"],
    kind: "template",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Template for task artifacts.",
    contents: `---
id: task-YYYYMMDD-slug
status: todo | doing | blocked | done | cancelled
priority: low | medium | high | urgent
owner: agent | human
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Task title

## Goal

What needs to be achieved?

## Acceptance criteria

- [ ] Criterion 1
- [ ] Tests/validation completed
`,
  },
  {
    relativePath: ".agents/templates/decision.template.md",
    templateId: "agents-template-decision",
    providers: ["t3"],
    kind: "template",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Template for decision artifacts.",
    contents: README_PROMPT(
      "Decision Title",
      "## Context\n\nWhat problem was decided?\n\n## Decision\n\nWhat was chosen?\n\n## Consequences\n\nWhat tradeoffs follow?",
    ),
  },
];

const exact = (expected: string) => (relativePath: string) =>
  relativePath.toLowerCase() === expected.toLowerCase();

const matches = (pattern: RegExp) => (relativePath: string) => pattern.test(relativePath);

const AGENT_FILE_MATCHERS: readonly AgentFileMatcher[] = [
  {
    test: matches(/(^|\/)AGENTS\.md$/iu),
    providers: ["codex", "opencode"],
    kind: "instructions",
    autoLoaded: true,
    recommended: true,
    editable: true,
    deletable: true,
    description: "AGENTS.md instructions read by Codex/OpenCode in the repo path hierarchy.",
    templateId: "root-agents-md",
  },
  {
    test: exact("CLAUDE.md"),
    providers: ["claude"],
    kind: "instructions",
    autoLoaded: true,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Claude Code project instructions.",
    templateId: "claude-shim",
  },
  {
    test: exact("GEMINI.md"),
    providers: ["gemini"],
    kind: "instructions",
    autoLoaded: true,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Gemini CLI project instructions.",
    templateId: "gemini-shim",
  },
  {
    test: exact(".cursorrules"),
    providers: ["cursor"],
    kind: "provider-rule",
    autoLoaded: true,
    recommended: false,
    editable: true,
    deletable: true,
    description: "Legacy Cursor project rule file.",
  },
  {
    test: matches(/(^|\/)\.cursor\/rules\/[^/]+\.mdc$/iu),
    providers: ["cursor"],
    kind: "provider-rule",
    autoLoaded: true,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Cursor project rule file.",
    templateId: "cursor-project-rule",
  },
  {
    test: exact(".cursor/mcp.json"),
    providers: ["cursor"],
    kind: "mcp-config",
    autoLoaded: true,
    recommended: false,
    editable: true,
    deletable: true,
    description: "Cursor MCP configuration.",
  },
  {
    test: exact(".github/copilot-instructions.md"),
    providers: ["copilot"],
    kind: "instructions",
    autoLoaded: true,
    recommended: true,
    editable: true,
    deletable: true,
    description: "GitHub Copilot repository custom instructions.",
    templateId: "copilot-instructions",
  },
  {
    test: matches(/(^|\/)\.github\/instructions\/[^/]+\.instructions\.md$/iu),
    providers: ["copilot"],
    kind: "instructions",
    autoLoaded: true,
    recommended: false,
    editable: true,
    deletable: true,
    description: "GitHub Copilot scoped instruction file.",
  },
  {
    test: exact(".windsurfrules"),
    providers: ["windsurf"],
    kind: "provider-rule",
    autoLoaded: true,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Legacy Windsurf workspace rules.",
    templateId: "windsurf-rules",
  },
  {
    test: matches(/(^|\/)\.windsurf\/rules\/[^/]+\.md$/iu),
    providers: ["windsurf"],
    kind: "provider-rule",
    autoLoaded: true,
    recommended: false,
    editable: true,
    deletable: true,
    description: "Windsurf workspace rule file.",
  },
  {
    test: matches(/(^|\/)\.devin\/rules\/[^/]+\.md$/iu),
    providers: ["devin"],
    kind: "provider-rule",
    autoLoaded: true,
    recommended: false,
    editable: true,
    deletable: true,
    description: "Devin workspace rule file.",
  },
  {
    test: matches(/(^|\/)\.claude\/settings\.json$/iu),
    providers: ["claude"],
    kind: "provider-settings",
    autoLoaded: true,
    recommended: false,
    editable: true,
    deletable: true,
    description: "Claude Code project settings.",
  },
  {
    test: matches(/(^|\/)\.claude\/commands\/.+\.md$/iu),
    providers: ["claude"],
    kind: "provider-rule",
    autoLoaded: true,
    recommended: false,
    editable: true,
    deletable: true,
    description: "Claude Code custom command.",
  },
  {
    test: matches(/(^|\/)\.claude\/agents\/.+\.md$/iu),
    providers: ["claude"],
    kind: "provider-rule",
    autoLoaded: true,
    recommended: false,
    editable: true,
    deletable: true,
    description: "Claude Code subagent definition.",
  },
  {
    test: matches(/(^|\/)\.claude\/skills\/[^/]+\/SKILL\.md$/iu),
    providers: ["claude"],
    kind: "skill",
    autoLoaded: true,
    recommended: false,
    editable: true,
    deletable: true,
    description: "Claude Code project skill.",
  },
  {
    test: exact(".mcp.json"),
    providers: ["claude"],
    kind: "mcp-config",
    autoLoaded: true,
    recommended: false,
    editable: true,
    deletable: true,
    description: "Project MCP configuration used by providers that support .mcp.json.",
  },
  {
    test: matches(/(^|\/)\.codex\/.+/iu),
    providers: ["codex"],
    kind: "provider-settings",
    autoLoaded: true,
    recommended: false,
    editable: true,
    deletable: true,
    description: "Codex-specific project configuration or instructions.",
    templateId: "codex-agents-shim",
  },
  {
    test: exact(".agents/harness.json"),
    providers: ["t3"],
    kind: "harness-manifest",
    autoLoaded: true,
    recommended: true,
    editable: true,
    deletable: true,
    description: "T3 Code agent harness manifest.",
    templateId: "t3-harness-manifest",
  },
  {
    test: matches(/(^|\/)\.agents\/memory\/.+/iu),
    providers: ["t3"],
    kind: "memory",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Project memory for future agent sessions.",
  },
  {
    test: matches(/(^|\/)\.agents\/loops\/.+/iu),
    providers: ["t3"],
    kind: "loop",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Loop contract or loop state shared by agents.",
  },
  {
    test: matches(/(^|\/)\.agents\/artifacts\/.+/iu),
    providers: ["t3"],
    kind: "artifact",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Shared artifact for agent sessions.",
  },
  {
    test: matches(/(^|\/)\.agents\/templates\/.+/iu),
    providers: ["t3"],
    kind: "template",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Template used by agent artifacts or loops.",
  },
  {
    test: matches(/(^|\/)\.agents\/skills\/.+/iu),
    providers: ["t3"],
    kind: "skill",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Project-specific agent skill.",
  },
  {
    test: matches(/(^|\/)\.agents\/scripts\/.+/iu),
    providers: ["t3"],
    kind: "script",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Executable helper script for agent workflows.",
  },
  {
    test: matches(/(^|\/)\.agents\/validation\.md$/iu),
    providers: ["t3"],
    kind: "validation",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "Validation contract for agent work.",
    templateId: "agents-validation",
  },
  {
    test: matches(/(^|\/)\.agents\/.+/iu),
    providers: ["t3"],
    kind: "harness-context",
    autoLoaded: false,
    recommended: true,
    editable: true,
    deletable: true,
    description: "T3 Code project agent harness file.",
  },
];

export function normalizeAgentFilePath(relativePath: string): string {
  return relativePath.trim().replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+/gu, "/");
}

export function classifyAgentFilePath(relativePath: string): AgentFileClassification | null {
  const normalized = normalizeAgentFilePath(relativePath);
  if (!normalized || normalized.startsWith("../") || normalized === "..") return null;
  const match = AGENT_FILE_MATCHERS.find((entry) => entry.test(normalized));
  if (!match) return null;
  const { test: _test, ...classification } = match;
  return classification;
}

export function isInstructionRulePath(relativePath: string): boolean {
  return classifyAgentFilePath(relativePath) !== null;
}

export function instructionRuleDescription(relativePath: string): string {
  return (
    classifyAgentFilePath(relativePath)?.description ??
    "Available repo rule/config file; add explicitly for this draft"
  );
}

export function getAgentFileTemplate(templateId: string): AgentFileTemplate | undefined {
  return AGENT_FILE_TEMPLATES.find((template) => template.templateId === templateId);
}

export function getRecommendedAgentFileTemplates(): readonly AgentFileTemplate[] {
  return AGENT_FILE_TEMPLATES.filter((template) => template.recommended);
}
