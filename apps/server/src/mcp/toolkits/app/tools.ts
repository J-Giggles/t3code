import {
  AppAutomationClickInput,
  AppAutomationError,
  AppAutomationEvaluateInput,
  AppAutomationPressInput,
  AppAutomationScrollInput,
  AppAutomationSnapshot,
  AppAutomationStatus,
  AppAutomationTypeInput,
  AppAutomationWaitForInput,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import * as AppAutomationBroker from "../../AppAutomationBroker.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  AppAutomationBroker.AppAutomationBroker,
];

const appTool = <T extends Tool.Any>(tool: T): T =>
  tool.annotate(Tool.OpenWorld, false).annotate(Tool.Destructive, true) as T;

const safeAppTool = <T extends Tool.Any>(tool: T): T =>
  appTool(tool).annotate(Tool.Destructive, false) as T;

const readonlyAppTool = <T extends Tool.Any>(tool: T): T =>
  safeAppTool(tool).annotate(Tool.Readonly, true).annotate(Tool.Idempotent, true) as T;

export const AppStatusTool = readonlyAppTool(
  Tool.make("app_status", {
    description:
      "Report whether the local T3 Code Electron shell is available for app_* control. Use app_* only for T3 Code's own UI; use preview_* for websites and dev-server previews.",
    success: AppAutomationStatus,
    failure: AppAutomationError,
    dependencies,
  }).annotate(Tool.Title, "Get T3 Code app status"),
);

export const AppShowTool = safeAppTool(
  Tool.make("app_show", {
    description:
      "Reveal and focus the local T3 Code Electron shell. Use this only for T3 Code's own UI; use preview_* for websites and dev-server previews.",
    success: AppAutomationStatus,
    failure: AppAutomationError,
    dependencies,
  }).annotate(Tool.Title, "Show T3 Code app"),
);

export const AppSnapshotTool = readonlyAppTool(
  Tool.make("app_snapshot", {
    description:
      "Inspect the local T3 Code Electron shell. Returns visible text, semantic interactive elements with reusable selectors, diagnostics, action history, and a PNG screenshot. Prefer these locators over coordinates. Use preview_snapshot for previewed websites.",
    success: AppAutomationSnapshot,
    failure: AppAutomationError,
    dependencies,
  }).annotate(Tool.Title, "Inspect T3 Code app"),
);

export const AppClickTool = appTool(
  Tool.make("app_click", {
    description:
      "Click exactly one target in the local T3 Code shell. Prefer locator with a Playwright selector such as role=button[name='Settings']; selector accepts legacy CSS; x and y are viewport CSS pixels.",
    parameters: AppAutomationClickInput,
    success: Schema.Null,
    failure: AppAutomationError,
    dependencies,
  }).annotate(Tool.Title, "Click T3 Code app"),
);

export const AppTypeTool = appTool(
  Tool.make("app_type", {
    description:
      "Insert literal text into an input in the local T3 Code shell. Prefer locator with a Playwright role/text selector. If neither selector nor locator is supplied, types into the currently focused element.",
    parameters: AppAutomationTypeInput,
    success: Schema.Null,
    failure: AppAutomationError,
    dependencies,
  }).annotate(Tool.Title, "Type into T3 Code app"),
);

export const AppPressTool = appTool(
  Tool.make("app_press", {
    description:
      "Press one keyboard key in the local T3 Code shell, for example {key:'Enter'}, {key:'Escape'}, or {key:'k',modifiers:['Meta']}.",
    parameters: AppAutomationPressInput,
    success: Schema.Null,
    failure: AppAutomationError,
    dependencies,
  }).annotate(Tool.Title, "Press key in T3 Code app"),
);

export const AppScrollTool = safeAppTool(
  Tool.make("app_scroll", {
    description:
      "Scroll the local T3 Code shell by CSS pixels. Without locator/selector it scrolls the viewport; otherwise it scrolls that container.",
    parameters: AppAutomationScrollInput,
    success: Schema.Null,
    failure: AppAutomationError,
    dependencies,
  }).annotate(Tool.Title, "Scroll T3 Code app"),
);

export const AppEvaluateTool = appTool(
  Tool.make("app_evaluate", {
    description:
      "Evaluate a JavaScript expression in the local T3 Code shell renderer. Prefer app_snapshot and semantic actions; use evaluate for inspection or unsupported interactions.",
    parameters: AppAutomationEvaluateInput,
    success: Schema.Unknown,
    failure: AppAutomationError,
    dependencies,
  }).annotate(Tool.Title, "Evaluate JavaScript in T3 Code app"),
);

export const AppWaitForTool = readonlyAppTool(
  Tool.make("app_wait_for", {
    description:
      "Wait until all supplied conditions match in the local T3 Code shell: locator, selector, visible text, and/or URL substring.",
    parameters: AppAutomationWaitForInput,
    success: Schema.Null,
    failure: AppAutomationError,
    dependencies,
  }).annotate(Tool.Title, "Wait for T3 Code app condition"),
);

export const AppAutomationToolkit = Toolkit.make(
  AppStatusTool,
  AppShowTool,
  AppSnapshotTool,
  AppClickTool,
  AppTypeTool,
  AppPressTool,
  AppScrollTool,
  AppEvaluateTool,
  AppWaitForTool,
);

export const AppStandardToolkit = Toolkit.make(
  AppStatusTool,
  AppShowTool,
  AppClickTool,
  AppTypeTool,
  AppPressTool,
  AppScrollTool,
  AppEvaluateTool,
  AppWaitForTool,
);

export const AppSnapshotToolkit = Toolkit.make(AppSnapshotTool);
