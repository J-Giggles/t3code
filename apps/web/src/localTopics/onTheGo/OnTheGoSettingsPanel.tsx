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

export const ON_THE_GO_TRANSCRIPTION_OPTIONS = [
  { providerId: "system", modelId: "default-transcription", label: "System default" },
  {
    providerId: "system",
    modelId: "on-device-transcription",
    label: "On-device (native mobile)",
  },
] as const;

export const ON_THE_GO_SPEECH_OPTIONS = [
  { providerId: "system", modelId: "default-speech", label: "System voice" },
] as const;

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

const LocalVoiceModelField = ({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: { readonly providerId: string; readonly modelId: string };
  readonly options: ReadonlyArray<{
    readonly providerId: string;
    readonly modelId: string;
    readonly label: string;
  }>;
  readonly onChange: (value: { readonly providerId: string; readonly modelId: string }) => void;
}) => {
  const selected = `${value.providerId}/${value.modelId}`;
  const available = options.some((option) => `${option.providerId}/${option.modelId}` === selected);
  return (
    <SettingsRow
      title={label}
      description="Only models implemented by the current device are selectable; unsupported saved values fail closed."
      control={
        <Select
          value={available ? selected : "unsupported"}
          onValueChange={(next) => {
            const option = options.find(
              (candidate) => `${candidate.providerId}/${candidate.modelId}` === next,
            );
            if (option) onChange(option);
          }}
        >
          <SelectTrigger className="w-full sm:w-[26rem]" aria-label={`${label} selection`}>
            <SelectValue>
              {available
                ? options.find((option) => `${option.providerId}/${option.modelId}` === selected)
                    ?.label
                : `Unavailable: ${selected}`}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {!available ? (
              <SelectItem value="unsupported">Unavailable saved value</SelectItem>
            ) : null}
            {options.map((option) => (
              <SelectItem
                key={`${option.providerId}/${option.modelId}`}
                value={`${option.providerId}/${option.modelId}`}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
};

const FallbackModelsField = ({
  label,
  capability,
  value,
  onChange,
}: {
  readonly label: string;
  readonly capability: "transcription" | "reasoning" | "speech";
  readonly value: ReadonlyArray<{ readonly providerId: string; readonly modelId: string }>;
  readonly onChange: (
    value: ReadonlyArray<{
      readonly providerId: string;
      readonly modelId: string;
    }>,
  ) => void;
}) => (
  <SettingsRow
    title={label}
    description={`Optional ${capability} provider/model pairs, tried in this exact order. Unsupported or unapproved values fail closed.`}
    control={
      <DraftInput
        className="w-full sm:w-[26rem]"
        value={value.map((selection) => `${selection.providerId}/${selection.modelId}`).join(", ")}
        onCommit={(input) => {
          const parsed = input
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
            .flatMap((entry) => {
              const separator = entry.indexOf("/");
              if (separator <= 0 || separator === entry.length - 1) return [];
              return [
                {
                  providerId: entry.slice(0, separator),
                  modelId: entry.slice(separator + 1),
                },
              ];
            });
          onChange(parsed);
        }}
        aria-label={label}
        placeholder="provider/model, provider/model"
      />
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
      <LocalVoiceModelField
        label="Transcription model"
        value={settings.transcriptionModel}
        options={ON_THE_GO_TRANSCRIPTION_OPTIONS}
        onChange={(transcriptionModel) =>
          updateVoice({
            transcriptionModel: { ...settings.transcriptionModel, ...transcriptionModel },
          })
        }
      />
      <FallbackModelsField
        label="Approved transcription fallback models"
        capability="transcription"
        value={settings.fallbackModels.transcription}
        onChange={(transcription) =>
          updateVoice({
            fallbackModels: {
              ...settings.fallbackModels,
              transcription: transcription.map((selection) => ({
                ...selection,
                capability: "transcription" as const,
              })),
            },
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
      <FallbackModelsField
        label="Approved Theo fallback models"
        capability="reasoning"
        value={settings.fallbackModels.reasoning}
        onChange={(reasoning) =>
          updateVoice({
            fallbackModels: {
              ...settings.fallbackModels,
              reasoning: reasoning.map((selection) => ({
                ...selection,
                capability: "reasoning" as const,
              })),
            },
          })
        }
      />
      <SettingsRow
        title="Remote Theo call budget"
        description="Warn at the first limit and stop paid Theo calls at the hard limit; Stop remains local."
        control={
          <div className="grid w-full grid-cols-2 gap-2 sm:w-[26rem]">
            <DraftInput
              value={String(settings.remoteCallBudget.warningAt)}
              onCommit={(value) => {
                const warningAt = Number.parseInt(value, 10);
                if (warningAt > 0 && warningAt <= settings.remoteCallBudget.hardLimit) {
                  updateVoice({
                    remoteCallBudget: { ...settings.remoteCallBudget, warningAt },
                  });
                }
              }}
              aria-label="Theo budget warning calls"
            />
            <DraftInput
              value={String(settings.remoteCallBudget.hardLimit)}
              onCommit={(value) => {
                const hardLimit = Number.parseInt(value, 10);
                if (hardLimit >= settings.remoteCallBudget.warningAt) {
                  updateVoice({
                    remoteCallBudget: { ...settings.remoteCallBudget, hardLimit },
                  });
                }
              }}
              aria-label="Theo budget hard limit calls"
            />
          </div>
        }
      />
      <LocalVoiceModelField
        label="Speech model"
        value={settings.speechModel}
        options={ON_THE_GO_SPEECH_OPTIONS}
        onChange={(speechModel) =>
          updateVoice({ speechModel: { ...settings.speechModel, ...speechModel } })
        }
      />
      <FallbackModelsField
        label="Approved speech fallback models"
        capability="speech"
        value={settings.fallbackModels.speech}
        onChange={(speech) =>
          updateVoice({
            fallbackModels: {
              ...settings.fallbackModels,
              speech: speech.map((selection) => ({
                ...selection,
                capability: "speech" as const,
              })),
            },
          })
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
