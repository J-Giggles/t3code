import {
  DEFAULT_ON_THE_GO_SETTINGS,
  type OnTheGoSettings,
  type UnifiedSettings,
} from "@t3tools/contracts";

import { usePrimarySettings, useUpdatePrimarySettings } from "../../hooks/useSettings";
import { DraftInput } from "../../components/ui/draft-input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import {
  SettingResetButton,
  SettingsRow,
  SettingsSection,
} from "../../components/settings/settingsLayout";

export interface OnTheGoSettingsPanelViewProps {
  readonly settings: OnTheGoSettings;
  readonly update: (patch: Partial<UnifiedSettings>) => void;
}

const ModelFields = ({
  label,
  value,
  capability,
  onChange,
}: {
  readonly label: string;
  readonly value: { readonly providerId: string; readonly modelId: string };
  readonly capability: "transcription" | "reasoning" | "speech";
  readonly onChange: (value: { readonly providerId: string; readonly modelId: string }) => void;
}) => (
  <SettingsRow
    title={label}
    description={`Select the provider-neutral ${capability} capability independently.`}
    control={
      <div className="grid w-full grid-cols-2 gap-2 sm:w-[26rem]">
        <DraftInput
          value={value.providerId}
          onCommit={(providerId) => onChange({ ...value, providerId })}
          aria-label={`${label} provider`}
          placeholder="Provider"
        />
        <DraftInput
          value={value.modelId}
          onCommit={(modelId) => onChange({ ...value, modelId })}
          aria-label={`${label} model`}
          placeholder="Model"
        />
      </div>
    }
  />
);

export function OnTheGoSettingsPanelView({ settings, update }: OnTheGoSettingsPanelViewProps) {
  const updateVoice = (patch: Partial<OnTheGoSettings>) =>
    update({ onTheGo: { ...settings, ...patch } });
  return (
    <SettingsSection title="On-the-Go Mode" data-testid="on-the-go-settings">
      <SettingsRow
        title="Voice control"
        description="Keep the durable response inbox active and make this device available for voice sessions."
        resetAction={
          settings.enabled !== DEFAULT_ON_THE_GO_SETTINGS.enabled ? (
            <SettingResetButton
              label="On-the-Go Mode"
              onClick={() => updateVoice({ enabled: DEFAULT_ON_THE_GO_SETTINGS.enabled })}
            />
          ) : null
        }
        control={
          <Switch
            checked={settings.enabled}
            onCheckedChange={(checked) => updateVoice({ enabled: Boolean(checked) })}
            aria-label="Enable On-the-Go Mode"
          />
        }
      />
      <SettingsRow
        title="Barge-In"
        description="Allow detected speech to interrupt Theo. Stop remains available when this is off."
        control={
          <Switch
            checked={settings.bargeInEnabled}
            onCheckedChange={(checked) => updateVoice({ bargeInEnabled: Boolean(checked) })}
            aria-label="Enable On-the-Go Barge-In"
          />
        }
      />
      <SettingsRow
        title="Spoken output"
        description="Public output speaks redacted summaries; private output may speak more detail but never secrets."
        control={
          <Select
            value={settings.outputPrivacy}
            onValueChange={(value) =>
              updateVoice({ outputPrivacy: value === "private" ? "private" : "public" })
            }
          >
            <SelectTrigger className="w-full sm:w-40" aria-label="On-the-Go output privacy">
              <SelectValue>
                {settings.outputPrivacy === "private" ? "Private" : "Public"}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="public">Public summaries</SelectItem>
              <SelectItem value="private">Private detail</SelectItem>
            </SelectPopup>
          </Select>
        }
      />
      <SettingsRow
        title="Wake phrases"
        description="The first phrase opens commands and the second opens Theo. Separate phrases with commas."
        control={
          <DraftInput
            className="w-full sm:w-[26rem]"
            value={settings.wakePhrases.join(", ")}
            onCommit={(value) => {
              const wakePhrases = value
                .split(",")
                .map((part) => part.trim())
                .filter(Boolean);
              if (wakePhrases.length >= 2) updateVoice({ wakePhrases });
            }}
            aria-label="On-the-Go wake phrases"
          />
        }
      />
      <ModelFields
        label="Transcription model"
        capability="transcription"
        value={settings.transcriptionModel}
        onChange={(transcriptionModel) =>
          updateVoice({
            transcriptionModel: { ...settings.transcriptionModel, ...transcriptionModel },
          })
        }
      />
      <ModelFields
        label="Theo model"
        capability="reasoning"
        value={settings.theoModel}
        onChange={(theoModel) =>
          updateVoice({ theoModel: { ...settings.theoModel, ...theoModel } })
        }
      />
      <ModelFields
        label="Speech model"
        capability="speech"
        value={settings.speechModel}
        onChange={(speechModel) =>
          updateVoice({ speechModel: { ...settings.speechModel, ...speechModel } })
        }
      />
    </SettingsSection>
  );
}

export function OnTheGoSettingsPanel() {
  const settings = usePrimarySettings();
  const update = useUpdatePrimarySettings();
  return <OnTheGoSettingsPanelView settings={settings.onTheGo} update={update} />;
}
