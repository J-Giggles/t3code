import type { PromptOverrides } from "@t3tools/contracts";

export const PROMPT_IDS = {
  codexPlanDeveloperInstructions: "codex.collaboration.plan.developerInstructions",
  codexDefaultDeveloperInstructions: "codex.collaboration.default.developerInstructions",
  textGenerationCommitMessage: "textGeneration.commitMessage",
  textGenerationPullRequest: "textGeneration.pullRequest",
  textGenerationBranchName: "textGeneration.branchName",
  textGenerationThreadTitle: "textGeneration.threadTitle",
  devLaunchSetup: "devLaunch.setup",
  devLaunchFailure: "devLaunch.failure",
  devLaunchCollision: "devLaunch.collision",
  composerFixBug: "composer.fixBug",
  composerWriteTests: "composer.writeTests",
  composerExplainCode: "composer.explainCode",
  composerReview: "composer.review",
  planImplementation: "plan.implementation",
} as const;

export type PromptId = (typeof PROMPT_IDS)[keyof typeof PROMPT_IDS];

export type PromptCategory =
  | "system"
  | "text-generation"
  | "dev-launch"
  | "composer"
  | "plan-follow-up";

export const PROMPT_CATEGORY_LABELS = {
  system: "System",
  "text-generation": "Text Generation",
  "dev-launch": "Dev Launch",
  composer: "Composer",
  "plan-follow-up": "Plan Follow-up",
} as const satisfies Record<PromptCategory, string>;

export interface PromptPlaceholder {
  readonly name: string;
  readonly description: string;
}

export interface PromptDefinition {
  readonly id: PromptId;
  readonly category: PromptCategory;
  readonly title: string;
  readonly description: string;
  readonly defaultContent: string;
  readonly placeholders?: ReadonlyArray<PromptPlaceholder>;
}

export type PromptRenderVariables = Readonly<Record<string, string | number | boolean | null>>;

const T3_CODE_BROWSER_TOOL_INSTRUCTIONS = `

## T3 Code browser control

You are running inside T3 Code. When the \`playwright-extension\` MCP server exposes \`browser_*\` tools, use that shared authenticated Chrome browser for websites and browser-required work. It controls the existing agent-only Chrome profile, including its logged-in sessions, tabs, and extensions. Do not switch to another browser surface during the task.

Start shared-Chrome work with \`browser_tabs\` to select or create the target tab, then call \`browser_resize\` with width 1440 and height 900 before taking a fresh snapshot. Continue with \`browser_snapshot\` and the focused \`browser_*\` interaction tools, using snapshot-provided locators instead of coordinates.

If the \`playwright-extension\` tools are absent or explicitly unavailable, use the \`t3-code\` MCP server's collaborative browser as the fallback. Call \`preview_status\`, then \`preview_open\` when no automation-capable preview is attached, followed by \`preview_navigate\`, \`preview_resize\`, \`preview_snapshot\`, and the focused \`preview_*\` interaction tools. Use a 1440 by 900 freeform preview viewport unless the task requires a named device size.

Use \`app_*\` only when the task is about controlling T3 Code's own Electron UI. For app-shell work, first call \`app_status\` and then \`app_snapshot\`; prefer app_snapshot-provided locators over coordinates.

Only after both supported browser hosts explicitly report unavailable may you run \`pnpm run agent-browser:isolated -- <https-url>\`. That helper owns a temporary Chromium user-data directory and deletes it when Chromium exits. Use it only for work that does not depend on the shared Chrome login state.
Do not use raw CDP, OS mouse automation, a Node REPL browser runtime, standalone Playwright scripts, agent-browser, or a separately launched Brave/Chrome/Chromium process while either supported browser toolset is available. Inspect and retry actionable tool errors on the selected surface; change surfaces only when that surface reports an explicit unavailable or unsupported error.
`;

const CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS = `<collaboration_mode># Plan Mode (Conversational)

You work in 3 phases, and you should *chat your way* to a great plan before finalizing it. A great plan is very detailed-intent- and implementation-wise-so that it can be handed to another engineer or agent to be implemented right away. It must be **decision complete**, where the implementer does not need to make any decisions.

## Mode rules (strict)

You are in **Plan Mode** until a developer message explicitly ends it.

Plan Mode is not changed by user intent, tone, or imperative language. If a user asks for execution while still in Plan Mode, treat it as a request to **plan the execution**, not perform it.

## Plan Mode vs update_plan tool

Plan Mode is a collaboration mode that can involve requesting user input and eventually issuing a \`<proposed_plan>\` block.

Separately, \`update_plan\` is a checklist/progress/TODOs tool; it does not enter or exit Plan Mode. Do not confuse it with Plan mode or try to use it while in Plan mode. If you try to use \`update_plan\` in Plan mode, it will return an error.

## Execution vs. mutation in Plan Mode

You may explore and execute **non-mutating** actions that improve the plan. You must not perform **mutating** actions.

### Allowed (non-mutating, plan-improving)

Actions that gather truth, reduce ambiguity, or validate feasibility without changing repo-tracked state. Examples:

* Reading or searching files, configs, schemas, types, manifests, and docs
* Static analysis, inspection, and repo exploration
* Dry-run style commands when they do not edit repo-tracked files
* Tests, builds, or checks that may write to caches or build artifacts (for example, \`target/\`, \`.cache/\`, or snapshots) so long as they do not edit repo-tracked files

### Not allowed (mutating, plan-executing)

Actions that implement the plan or change repo-tracked state. Examples:

* Editing or writing files
* Running formatters or linters that rewrite files
* Applying patches, migrations, or codegen that updates repo-tracked files
* Side-effectful commands whose purpose is to carry out the plan rather than refine it

When in doubt: if the action would reasonably be described as "doing the work" rather than "planning the work," do not do it.

## PHASE 1 - Ground in the environment (explore first, ask second)

Begin by grounding yourself in the actual environment. Eliminate unknowns in the prompt by discovering facts, not by asking the user. Resolve all questions that can be answered through exploration or inspection. Identify missing or ambiguous details only if they cannot be derived from the environment. Silent exploration between turns is allowed and encouraged.

Before asking the user any question, perform at least one targeted non-mutating exploration pass (for example: search relevant files, inspect likely entrypoints/configs, confirm current implementation shape), unless no local environment/repo is available.

Exception: you may ask clarifying questions about the user's prompt before exploring, ONLY if there are obvious ambiguities or contradictions in the prompt itself. However, if ambiguity might be resolved by exploring, always prefer exploring first.

Do not ask questions that can be answered from the repo or system (for example, "where is this struct?" or "which UI component should we use?" when exploration can make it clear). Only ask once you have exhausted reasonable non-mutating exploration.

## PHASE 2 - Intent chat (what they actually want)

* Keep asking until you can clearly state: goal + success criteria, audience, in/out of scope, constraints, current state, and the key preferences/tradeoffs.
* Bias toward questions over guessing: if any high-impact ambiguity remains, do NOT plan yet-ask.

## PHASE 3 - Implementation chat (what/how we'll build)

* Once intent is stable, keep asking until the spec is decision complete: approach, interfaces (APIs/schemas/I/O), data flow, edge cases/failure modes, testing + acceptance criteria, rollout/monitoring, and any migrations/compat constraints.

## Asking questions

Critical rules:

* Strongly prefer using the \`request_user_input\` tool to ask any questions.
* Offer only meaningful multiple-choice options; don't include filler choices that are obviously wrong or irrelevant.
* In rare cases where an unavoidable, important question can't be expressed with reasonable multiple-choice options (due to extreme ambiguity), you may ask it directly without the tool.

You SHOULD ask many questions, but each question must:

* materially change the spec/plan, OR
* confirm/lock an assumption, OR
* choose between meaningful tradeoffs.
* not be answerable by non-mutating commands.

Use the \`request_user_input\` tool only for decisions that materially change the plan, for confirming important assumptions, or for information that cannot be discovered via non-mutating exploration.

## Two kinds of unknowns (treat differently)

1. **Discoverable facts** (repo/system truth): explore first.

   * Before asking, run targeted searches and check likely sources of truth (configs/manifests/entrypoints/schemas/types/constants).
   * Ask only if: multiple plausible candidates; nothing found but you need a missing identifier/context; or ambiguity is actually product intent.
   * If asking, present concrete candidates (paths/service names) + recommend one.
   * Never ask questions you can answer from your environment (e.g., "where is this struct").

2. **Preferences/tradeoffs** (not discoverable): ask early.

   * These are intent or implementation preferences that cannot be derived from exploration.
   * Provide 2-4 mutually exclusive options + a recommended default.
   * If unanswered, proceed with the recommended option and record it as an assumption in the final plan.

## Finalization rule

Only output the final plan when it is decision complete and leaves no decisions to the implementer.

When you present the official plan, wrap it in a \`<proposed_plan>\` block so the client can render it specially:

1) The opening tag must be on its own line.
2) Start the plan content on the next line (no text on the same line as the tag).
3) The closing tag must be on its own line.
4) Use Markdown inside the block.
5) Keep the tags exactly as \`<proposed_plan>\` and \`</proposed_plan>\` (do not translate or rename them), even if the plan content is in another language.

Example:

<proposed_plan>
plan content
</proposed_plan>

plan content should be human and agent digestible. The final plan must be plan-only and include:

* A clear title
* A brief summary section
* Important changes or additions to public APIs/interfaces/types
* Test cases and scenarios
* Explicit assumptions and defaults chosen where needed

Do not ask "should I proceed?" in the final output. The user can easily switch out of Plan mode and request implementation if you have included a \`<proposed_plan>\` block in your response. Alternatively, they can decide to stay in Plan mode and continue refining the plan.

Only produce at most one \`<proposed_plan>\` block per turn, and only when you are presenting a complete spec.
${T3_CODE_BROWSER_TOOL_INSTRUCTIONS}
</collaboration_mode>`;

const CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS = `<collaboration_mode># Collaboration Mode: Default

You are now in Default mode. Any previous instructions for other modes (e.g. Plan mode) are no longer active.

Your active mode changes only when new developer instructions with a different \`<collaboration_mode>...</collaboration_mode>\` change it; user requests or tool descriptions do not change mode by themselves. Known mode names are Default and Plan.

## request_user_input availability

The \`request_user_input\` tool is unavailable in Default mode. If you call it while in Default mode, it will return an error.

In Default mode, strongly prefer making reasonable assumptions and executing the user's request rather than stopping to ask questions. If you absolutely must ask a question because the answer cannot be discovered from local context and a reasonable assumption would be risky, ask the user directly with a concise plain-text question. Never write a multiple choice question as a textual assistant message.
${T3_CODE_BROWSER_TOOL_INSTRUCTIONS}
</collaboration_mode>`;

const TEXT_GENERATION_COMMIT_MESSAGE_PROMPT = `You write concise git commit messages.
Return a JSON object with keys: subject, body{{branchOutputKey}}.
Rules:
- subject must be imperative, <= 72 chars, and no trailing period
- body can be empty string or short bullet points
{{branchRule}}- capture the primary user-visible or developer-visible change{{policyInstructions}}Branch: {{branch}}

Staged files:
{{stagedSummary}}

Staged patch:
{{stagedPatch}}`;

const TEXT_GENERATION_PULL_REQUEST_PROMPT = `You write GitHub pull request content.
Return a JSON object with keys: title, body.
Rules:
- title should be concise and specific
- body must be markdown and include headings '## Summary' and '## Testing'
- under Summary, provide short bullet points
- under Testing, include bullet points with concrete checks or 'Not run' where appropriate{{policyInstructions}}Base branch: {{baseBranch}}
Head branch: {{headBranch}}

Commits:
{{commitSummary}}

Diff stat:
{{diffSummary}}

Diff patch:
{{diffPatch}}`;

const TEXT_GENERATION_BRANCH_NAME_PROMPT = `You generate concise git branch names.
Return a JSON object with key: branch.
Rules:
- Branch should describe the requested work from the user message.
- Keep it short and specific (2-6 words).
- Use plain words only, no issue prefixes and no punctuation-heavy text.
- If images are attached, use them as primary context for visual/UI issues.

User message:
{{message}}{{policyInstructions}}{{attachmentSection}}`;

const TEXT_GENERATION_THREAD_TITLE_PROMPT = `You write concise thread titles for coding conversations.
Return a JSON object with key: title.
Rules:
- Title should summarize the user's request, not restate it verbatim.
- Keep it short and specific (3-8 words).
- Avoid quotes, filler, prefixes, and trailing punctuation.
- If images are attached, use them as primary context for visual/UI issues.

User message:
{{message}}{{policyInstructions}}{{attachmentSection}}`;

const DEV_LAUNCH_SETUP_PROMPT = `Use the dev-env-url-wiring and monorepo-dev-launch-profiles skills.

Project: {{projectName}}
Project root: {{projectRoot}}
Workspace root: {{workspaceRoot}}
Branch: {{branch}}

Goal: make every relevant runnable target in this repo launchable from T3 Code over Tailscale local dev launch.
This must work from the remote T3 Code Vite client over Tailscale HTTPS, not only from localhost or the desktop Electron window.

Ownership boundary:
- T3 Code owns Tailscale Serve setup, public URL construction, and browser navigation.
- Do not install Tailscale packages, call the tailscale CLI, or add Tailscale SDK/API usage in this target repo.
- The target repo should only run its normal local dev server and read launcher-written env values.

Discovery requirements:
- Inspect the package manager and lockfile.
- Inspect workspace files such as pnpm-workspace.yaml, package.json workspaces, turbo.json, nx.json, lerna.json, or equivalent.
- Inspect app/package manifests, framework configs, existing dev scripts, env examples, and gitignore rules.
- Identify which packages are user-facing apps, APIs/workers needed by those apps, docs/storybook/tooling apps, libraries, and internal services.

Classify the repo before editing as one or more of:
- single app
- monorepo
- app plus API/backend
- API-only
- docs/storybook/tooling app
- unknown/custom

Required behavior:
- Identify each real runnable target and its dev command.
- Create one manifest profile per runnable target that should be remotely reachable.
- Include APIs/workers when browser apps depend on them or when the user requested them as launch targets.
- Make the dev server host and port env-driven.
- Make public origin, public base path, and public base URL env-driven where the framework needs them.
- Preserve production config and behavior.
- Create or update {{manifestRelativePath}}.
- Follow the user's gitignore preference for the manifest; if unknown, track reusable manifest profiles and gitignore only launcher-written env files.
- Use gitignored package-local env files for launcher-written values unless the repo already standardizes shared root env files.
- Do not import from T3 Code internals or from vendored repos.
- Verify every target works at / when appropriate and at a prefixed path like /project/worktree/app/.
- Verify through the remote T3 Code Vite client over Tailscale HTTPS, not only with localhost curl/browser checks.

Manifest expectations:
- version: 1
- one profile per reachable app/API/tool target
- stable profile ids such as app, web, admin, api, docs, storybook, shop, or dashboard
- explicit cwd, command, host, port, healthCheckPath, and envBindings
- envBindings should use launcher templates such as {{host}}, {{port}}, {{publicOrigin}}, {{publicBasePath}}, {{publicBaseUrl}}, {{serverPublicBasePath}}, and {{serverPublicBaseUrl}}
- use {{publicBasePath}} and {{publicBaseUrl}} for the app's own base path and app URL values
- use {{serverPublicBasePath}} and {{serverPublicBaseUrl}} only for callbacks to the T3 Code backend
- healthCheckPath must resolve to a 2xx route after base path rewriting; if / returns 404, use a known route under {{publicBasePath}}
- health checks must bypass auth, locale, proxy, and middleware redirects; for protected browser apps, prefer a static public asset such as {{publicBasePath}}t3code-health.txt
- monorepos should expose all launched apps in the same T3 Code launch stack with easy per-app HTTPS links.

Failure handling:
- If the first configure/launch attempt fails, capture profile id, command, port, health check path, local URL, public Tailscale URL if known, error/log excerpt, current manifest, and whether the failure is setup, launch, health check, DNS, base path, asset loading, or app runtime.
- Fix the setup and reattempt through the remote T3 Code Vite client over Tailscale HTTPS.
- If the failure reveals a generally useful instruction, update T3 Code's default setup prompt so future repos benefit.

After editing, run the repo's appropriate checks and summarize the files changed.`;

const DEV_LAUNCH_FAILURE_PROMPT = `Use the dev-env-url-wiring and monorepo-dev-launch-profiles skills.

This is a retry/fix prompt for a T3 Code dev-launch setup that did not work.
Do not switch to a terminal-only workaround. Fix the project setup so the remote T3 Code UI can configure, launch, and view it repeatably.

Project: {{projectName}}
Project root: {{projectRoot}}
Workspace root: {{workspaceRoot}}
Branch: {{branch}}
Remote T3 Code client: {{remoteClientUrl}}

Failed profile evidence:
- profile id: {{profileId}}
- profile name: {{profileName}}
- command: {{profileCommand}}
- cwd: {{profileCwd}}
- host: {{profileHost}}
- port: {{profilePort}}
- healthCheckPath: {{profileHealthCheckPath}}
- expected local URL: http://{{profileHost}}:{{profilePort}}
- failure kind: {{failureKind}}
- launch error/log excerpt: {{errorMessage}}

Active launches that should remain usable:
{{activeLaunches}}

Current manifest summary:
{{manifestSummary}}

Fix requirements:
- First classify the failure as setup, launch command, health check, DNS/MagicDNS, Tailscale Serve path, base path, asset path, or app runtime error.
- Inspect the current manifest, package scripts, framework config, env files, and gitignore rules before editing.
- Preserve successful app launches and their ports unless they are directly wrong.
- Keep Tailscale ownership in T3 Code only; do not install Tailscale packages or call the tailscale CLI from the target repo.
- Make the smallest repo change that makes this profile launch and load over the T3 Code Tailscale HTTPS URL.
- If the failure reveals a broadly useful setup instruction, also update T3 Code's default buildDevLaunchSetupPrompt so future projects benefit.
- Reattempt through the remote T3 Code Vite client over Tailscale HTTPS after editing.`;

const DEV_LAUNCH_COLLISION_PROMPT = `Use the dev-launch-collision-avoidance skill.
Project: {{projectName}}
{{reason}}
Blocking app: {{blockingProfileName}} ({{blockingProfileId}})
Blocking public URL: {{blockingPublicUrl}}
Create or select another worktree for this task.
Choose a non-conflicting host port.
Update the relevant .env file bindings safely.
Preserve the public URL convention /<project>/<worktree>/<app>/.`;

export const PROMPT_DEFINITIONS = [
  {
    id: PROMPT_IDS.codexPlanDeveloperInstructions,
    category: "system",
    title: "Codex plan mode",
    description: "Developer instructions sent when a Codex thread enters plan mode.",
    defaultContent: CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS,
  },
  {
    id: PROMPT_IDS.codexDefaultDeveloperInstructions,
    category: "system",
    title: "Codex default mode",
    description: "Developer instructions sent when a Codex thread returns to default mode.",
    defaultContent: CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
  },
  {
    id: PROMPT_IDS.textGenerationCommitMessage,
    category: "text-generation",
    title: "Commit message",
    description: "Prompt used to generate commit messages from staged changes.",
    defaultContent: TEXT_GENERATION_COMMIT_MESSAGE_PROMPT,
    placeholders: [
      { name: "branchOutputKey", description: "Adds the branch key when requested." },
      { name: "branchRule", description: "Adds the branch naming rule when requested." },
      { name: "policyInstructions", description: "Optional project policy instructions." },
      { name: "branch", description: "Current branch or detached marker." },
      { name: "stagedSummary", description: "Limited staged file summary." },
      { name: "stagedPatch", description: "Limited staged patch." },
    ],
  },
  {
    id: PROMPT_IDS.textGenerationPullRequest,
    category: "text-generation",
    title: "Pull request content",
    description: "Prompt used to generate pull request title and body.",
    defaultContent: TEXT_GENERATION_PULL_REQUEST_PROMPT,
    placeholders: [
      { name: "policyInstructions", description: "Optional project policy instructions." },
      { name: "baseBranch", description: "Pull request base branch." },
      { name: "headBranch", description: "Pull request head branch." },
      { name: "commitSummary", description: "Limited commit summary." },
      { name: "diffSummary", description: "Limited diff stat." },
      { name: "diffPatch", description: "Limited diff patch." },
    ],
  },
  {
    id: PROMPT_IDS.textGenerationBranchName,
    category: "text-generation",
    title: "Branch name",
    description: "Prompt used to generate semantic branch names from the first user message.",
    defaultContent: TEXT_GENERATION_BRANCH_NAME_PROMPT,
    placeholders: [
      { name: "instruction", description: "Default role instruction." },
      { name: "responseShape", description: "Expected JSON response shape." },
      { name: "rules", description: "Default branch naming rules." },
      { name: "message", description: "Limited user message." },
      { name: "policyInstructions", description: "Optional project policy instructions." },
      { name: "attachmentSection", description: "Optional attachment metadata section." },
    ],
  },
  {
    id: PROMPT_IDS.textGenerationThreadTitle,
    category: "text-generation",
    title: "Thread title",
    description: "Prompt used to generate thread titles from the first user message.",
    defaultContent: TEXT_GENERATION_THREAD_TITLE_PROMPT,
    placeholders: [
      { name: "instruction", description: "Default role instruction." },
      { name: "responseShape", description: "Expected JSON response shape." },
      { name: "rules", description: "Default title writing rules." },
      { name: "message", description: "Limited user message." },
      { name: "policyInstructions", description: "Optional project policy instructions." },
      { name: "attachmentSection", description: "Optional attachment metadata section." },
    ],
  },
  {
    id: PROMPT_IDS.devLaunchSetup,
    category: "dev-launch",
    title: "Dev launch setup",
    description: "Prompt used to ask an agent to configure local dev launch for a project.",
    defaultContent: DEV_LAUNCH_SETUP_PROMPT,
    placeholders: [
      { name: "projectName", description: "Project display name." },
      { name: "projectRoot", description: "Project root path." },
      { name: "workspaceRoot", description: "Worktree path or project root." },
      { name: "branch", description: "Current branch or unknown." },
      { name: "manifestRelativePath", description: "Dev launch manifest path." },
    ],
  },
  {
    id: PROMPT_IDS.devLaunchFailure,
    category: "dev-launch",
    title: "Dev launch failure",
    description: "Prompt used to ask an agent to repair a failed dev launch setup.",
    defaultContent: DEV_LAUNCH_FAILURE_PROMPT,
    placeholders: [
      { name: "projectName", description: "Project display name." },
      { name: "projectRoot", description: "Project root path." },
      { name: "workspaceRoot", description: "Worktree path or project root." },
      { name: "branch", description: "Current branch or unknown." },
      { name: "remoteClientUrl", description: "Remote client URL or unavailable marker." },
      { name: "profileId", description: "Failed profile id." },
      { name: "profileName", description: "Failed profile name." },
      { name: "profileCommand", description: "Failed launch command." },
      { name: "profileCwd", description: "Failed profile cwd." },
      { name: "profileHost", description: "Failed profile host." },
      { name: "profilePort", description: "Failed profile port." },
      { name: "profileHealthCheckPath", description: "Failed health check path." },
      { name: "failureKind", description: "Failure classification." },
      { name: "errorMessage", description: "Launch error or log excerpt." },
      { name: "activeLaunches", description: "Currently active launches." },
      { name: "manifestSummary", description: "Current manifest summary." },
    ],
  },
  {
    id: PROMPT_IDS.devLaunchCollision,
    category: "dev-launch",
    title: "Dev launch collision",
    description: "Prompt used when a launch conflicts with an active worktree or port.",
    defaultContent: DEV_LAUNCH_COLLISION_PROMPT,
    placeholders: [
      { name: "projectName", description: "Project display name." },
      { name: "reason", description: "Collision reason." },
      { name: "blockingProfileName", description: "Blocking profile name." },
      { name: "blockingProfileId", description: "Blocking profile id." },
      { name: "blockingPublicUrl", description: "Blocking public URL." },
    ],
  },
  {
    id: PROMPT_IDS.composerFixBug,
    category: "composer",
    title: "Fix a bug",
    description: "Slash menu template for bug-fix requests.",
    defaultContent: "Please diagnose and fix this bug: ",
  },
  {
    id: PROMPT_IDS.composerWriteTests,
    category: "composer",
    title: "Write tests",
    description: "Slash menu template for focused test coverage requests.",
    defaultContent: "Please add focused tests for this behavior: ",
  },
  {
    id: PROMPT_IDS.composerExplainCode,
    category: "composer",
    title: "Explain code",
    description: "Slash menu template for code explanation requests.",
    defaultContent: "Please explain how this code works: ",
  },
  {
    id: PROMPT_IDS.composerReview,
    category: "composer",
    title: "Review changes",
    description: "Slash menu template for code review requests.",
    defaultContent: "Please review these changes for bugs, regressions, and missing tests.",
  },
  {
    id: PROMPT_IDS.planImplementation,
    category: "plan-follow-up",
    title: "Implement proposed plan",
    description: "Prompt used when accepting a proposed plan with no follow-up text.",
    defaultContent: "PLEASE IMPLEMENT THIS PLAN:\n{{planMarkdown}}",
    placeholders: [{ name: "planMarkdown", description: "Trimmed proposed plan markdown." }],
  },
] as const satisfies ReadonlyArray<PromptDefinition>;

const PROMPT_DEFINITION_BY_ID = new Map(
  PROMPT_DEFINITIONS.map((definition) => [definition.id, definition]),
);

function getPromptDefinitionOrThrow(id: PromptId): PromptDefinition {
  const definition = PROMPT_DEFINITION_BY_ID.get(id);
  if (!definition) {
    throw new Error(`Unknown prompt definition '${id}'.`);
  }
  return definition;
}

export function getPromptDefinition(id: PromptId): PromptDefinition;
export function getPromptDefinition(id: string): PromptDefinition | undefined;
export function getPromptDefinition(id: string): PromptDefinition | undefined {
  return PROMPT_DEFINITION_BY_ID.get(id as PromptId);
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function promptDefaultHash(content: string): string {
  return `fnv1a32:${fnv1a32(content)}`;
}

export function getPromptDefaultHash(id: PromptId): string {
  return promptDefaultHash(getPromptDefinitionOrThrow(id).defaultContent);
}

export function resolvePromptContent(
  id: PromptId,
  promptOverrides?: PromptOverrides | undefined,
): string {
  return promptOverrides?.[id]?.content ?? getPromptDefinitionOrThrow(id).defaultContent;
}

export function renderPromptTemplate(
  id: PromptId,
  variables: PromptRenderVariables = {},
  promptOverrides?: PromptOverrides | undefined,
): string {
  return resolvePromptContent(id, promptOverrides).replace(
    /\{\{([A-Za-z0-9_]+)\}\}/g,
    (match, name: string) => {
      if (!Object.hasOwn(variables, name)) {
        return match;
      }
      const value = variables[name];
      return value === null ? "" : String(value);
    },
  );
}
