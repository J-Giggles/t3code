import { createFileRoute } from "@tanstack/react-router";

import { PromptSettingsPanel } from "../components/settings/PromptSettingsPanel";

function SettingsPromptsRoute() {
  return <PromptSettingsPanel />;
}

export const Route = createFileRoute("/settings/prompts")({
  component: SettingsPromptsRoute,
});
