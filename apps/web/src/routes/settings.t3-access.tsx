import { createFileRoute } from "@tanstack/react-router";

import { T3AccessSettingsPanel } from "../components/settings/SettingsPanels";

function SettingsT3AccessRoute() {
  return <T3AccessSettingsPanel />;
}

export const Route = createFileRoute("/settings/t3-access")({
  component: SettingsT3AccessRoute,
});
