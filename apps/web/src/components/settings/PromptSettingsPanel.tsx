import { useCallback, useEffect, useMemo, useState } from "react";
import type { PromptOverride, PromptOverrides } from "@t3tools/contracts";
import {
  PROMPT_CATEGORY_LABELS,
  PROMPT_DEFINITIONS,
  getPromptDefaultHash,
  type PromptCategory,
  type PromptDefinition,
} from "@t3tools/shared/prompts";

import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

const PROMPT_CATEGORY_ORDER = [
  "system",
  "text-generation",
  "dev-launch",
  "composer",
  "plan-follow-up",
] as const satisfies ReadonlyArray<PromptCategory>;

function withoutPromptOverride(
  promptOverrides: PromptOverrides,
  promptId: PromptDefinition["id"],
): PromptOverrides {
  const next = { ...promptOverrides };
  delete next[promptId];
  return next;
}

function withPromptOverride(
  promptOverrides: PromptOverrides,
  promptId: PromptDefinition["id"],
  override: PromptOverride,
): PromptOverrides {
  return {
    ...promptOverrides,
    [promptId]: override,
  };
}

function PromptStatusBadge(props: {
  readonly isCustomized: boolean;
  readonly hasDefaultChanged: boolean;
}) {
  if (props.hasDefaultChanged) {
    return (
      <Badge variant="warning" size="sm">
        Default changed
      </Badge>
    );
  }
  if (props.isCustomized) {
    return (
      <Badge variant="info" size="sm">
        Customized
      </Badge>
    );
  }
  return (
    <Badge variant="outline" size="sm">
      Default
    </Badge>
  );
}

function PromptSettingsRow(props: {
  readonly definition: PromptDefinition;
  readonly promptOverrides: PromptOverrides;
  readonly onSave: (definition: PromptDefinition, content: string) => void;
  readonly onReset: (definition: PromptDefinition) => void;
}) {
  const override = props.promptOverrides[props.definition.id];
  const currentDefaultHash = getPromptDefaultHash(props.definition.id);
  const effectiveContent = override?.content ?? props.definition.defaultContent;
  const [draft, setDraft] = useState(effectiveContent);

  useEffect(() => {
    setDraft(effectiveContent);
  }, [effectiveContent]);

  const isCustomized = override !== undefined;
  const isDirty = draft !== effectiveContent;
  const hasDefaultChanged =
    override?.defaultHash !== undefined && override.defaultHash !== currentDefaultHash;
  const placeholderNames =
    props.definition.placeholders?.map((placeholder) => placeholder.name) ?? [];

  return (
    <SettingsRow
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{props.definition.title}</span>
          <PromptStatusBadge isCustomized={isCustomized} hasDefaultChanged={hasDefaultChanged} />
        </span>
      }
      description={props.definition.description}
      control={
        <>
          <Button
            size="xs"
            variant="outline"
            aria-label={`Reset ${props.definition.title} prompt`}
            disabled={!isCustomized && draft === props.definition.defaultContent}
            onClick={() => props.onReset(props.definition)}
          >
            Reset
          </Button>
          <Button
            size="xs"
            aria-label={`Save ${props.definition.title} prompt`}
            disabled={!isDirty && !hasDefaultChanged}
            onClick={() => props.onSave(props.definition, draft)}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="mt-3 space-y-2 pb-4">
        {placeholderNames.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {placeholderNames.map((placeholder) => (
              <code
                key={placeholder}
                className="rounded-sm border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
              >
                {`{{${placeholder}}}`}
              </code>
            ))}
          </div>
        ) : null}
        <Textarea
          aria-label={`${props.definition.title} prompt`}
          className={cn(
            "font-mono text-xs leading-5",
            "has-[textarea]:min-h-34 has-[textarea]:max-h-[420px] has-[textarea]:overflow-auto",
          )}
          spellCheck={false}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
      </div>
    </SettingsRow>
  );
}

export function PromptSettingsPanel() {
  const promptOverrides = useSettings((settings) => settings.promptOverrides);
  const updateSettings = useUpdateSettings();

  const definitionsByCategory = useMemo(() => {
    const grouped = new Map<PromptCategory, PromptDefinition[]>();
    for (const category of PROMPT_CATEGORY_ORDER) {
      grouped.set(category, []);
    }
    for (const definition of PROMPT_DEFINITIONS) {
      grouped.get(definition.category)?.push(definition);
    }
    return grouped;
  }, []);

  const handleSave = useCallback(
    (definition: PromptDefinition, content: string) => {
      const nextPromptOverrides =
        content === definition.defaultContent
          ? withoutPromptOverride(promptOverrides, definition.id)
          : withPromptOverride(promptOverrides, definition.id, {
              content,
              defaultHash: getPromptDefaultHash(definition.id),
            });
      updateSettings({ promptOverrides: nextPromptOverrides });
    },
    [promptOverrides, updateSettings],
  );

  const handleReset = useCallback(
    (definition: PromptDefinition) => {
      updateSettings({ promptOverrides: withoutPromptOverride(promptOverrides, definition.id) });
    },
    [promptOverrides, updateSettings],
  );

  return (
    <SettingsPageContainer className="max-w-5xl">
      {PROMPT_CATEGORY_ORDER.map((category) => {
        const definitions = definitionsByCategory.get(category) ?? [];
        if (definitions.length === 0) {
          return null;
        }
        return (
          <SettingsSection key={category} title={PROMPT_CATEGORY_LABELS[category]}>
            {definitions.map((definition) => (
              <PromptSettingsRow
                key={definition.id}
                definition={definition}
                promptOverrides={promptOverrides}
                onSave={handleSave}
                onReset={handleReset}
              />
            ))}
          </SettingsSection>
        );
      })}
    </SettingsPageContainer>
  );
}
