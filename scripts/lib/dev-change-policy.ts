export const DEV_CHANGE_POLICY_ENV = "T3CODE_DEV_CHANGE_POLICY";
export const DESKTOP_DISABLE_RESTART_ON_CHANGE_ENV = "T3CODE_DESKTOP_DISABLE_RESTART_ON_CHANGE";
export const RESTART_CONTROL_TOKEN_ENV = "T3CODE_RESTART_CONTROL_TOKEN";

export type DevChangePolicy = "manual" | "auto";

export interface ResolveDevChangePolicyOptions {
  readonly defaultPolicy?: DevChangePolicy;
}

export function parseBooleanEnvFlag(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

export function parseDevChangePolicy(value: string | undefined): DevChangePolicy | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === "manual" || normalized === "auto" ? normalized : undefined;
}

export function resolveDevChangePolicy(
  env: Partial<
    Record<typeof DEV_CHANGE_POLICY_ENV | typeof DESKTOP_DISABLE_RESTART_ON_CHANGE_ENV, string>
  >,
  options: ResolveDevChangePolicyOptions = {},
): DevChangePolicy {
  const configuredPolicy = parseDevChangePolicy(env[DEV_CHANGE_POLICY_ENV]);
  if (configuredPolicy) {
    return configuredPolicy;
  }

  if (parseBooleanEnvFlag(env[DESKTOP_DISABLE_RESTART_ON_CHANGE_ENV])) {
    return "manual";
  }

  return options.defaultPolicy ?? "auto";
}

export function readNonEmptyEnvValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}
