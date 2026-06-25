import { EnvironmentId, type ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { RefreshCwIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import { applyProvidersUpdated } from "../../rpc/serverState";
import { readEnvironmentConnection } from "../../environments/runtime";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";

function formatCheckedAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatReset(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function ProviderUsagePopover(props: {
  environmentId: EnvironmentId;
  provider: ServerProvider | null;
  selectedInstanceId: ProviderInstanceId;
}) {
  const { environmentId, provider, selectedInstanceId } = props;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const usage = provider?.usage;
  const checkedAt = formatCheckedAt(usage?.checkedAt);
  const limitCount = usage?.limits.length ?? 0;
  const hasSummary = Boolean(usage?.summary.lifetimeTokens || usage?.summary.peakDailyTokens);
  const providerName = provider?.displayName?.trim() || provider?.driver || "Provider";
  const ariaLabel = `${providerName} usage`;

  const refreshUsage = useCallback(() => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    const connection = readEnvironmentConnection(environmentId);
    if (!connection) return Promise.resolve();
    const promise = connection.client.server
      .refreshProviders({ instanceId: selectedInstanceId })
      .then((payload) => {
        applyProvidersUpdated(payload);
      })
      .catch(() => undefined)
      .finally(() => {
        refreshPromiseRef.current = null;
        setIsRefreshing(false);
      });
    refreshPromiseRef.current = promise;
    setIsRefreshing(true);
    return promise;
  }, [environmentId, selectedInstanceId]);

  const iconColorClass = useMemo(() => {
    const remaining = usage?.limits
      .flatMap((limit) => limit.windows)
      .map((window) => window.remainingPercent);
    if (!remaining || remaining.length === 0) return "text-muted-foreground";
    const lowest = Math.min(...remaining);
    if (lowest <= 15) return "text-red-500";
    if (lowest <= 35) return "text-amber-500";
    return "text-emerald-500";
  }, [usage]);

  if (!provider) return null;

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
        render={
          <button
            type="button"
            className={cn(
              "inline-flex size-6 cursor-pointer items-center justify-center rounded-full border border-transparent outline-none transition-colors",
              "hover:bg-accent data-[pressed]:bg-accent",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              iconColorClass,
            )}
            aria-label={ariaLabel}
            onPointerEnter={() => void refreshUsage()}
            onFocus={() => void refreshUsage()}
          >
            {isRefreshing ? (
              <RefreshCwIcon className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <ProviderInstanceIcon
                driverKind={provider.driver}
                displayName={providerName}
                accentColor={provider.accentColor}
                showBadge={false}
                className="size-4"
                iconClassName="size-4"
                indicatorBackground="var(--input)"
              />
            )}
          </button>
        }
      />
      <PopoverPopup tooltipStyle side="top" align="end" className="w-72 max-w-none p-0">
        <div className="flex flex-col gap-3 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {provider ? (
                <ProviderInstanceIcon
                  driverKind={provider.driver}
                  displayName={providerName}
                  accentColor={provider.accentColor}
                  showBadge={false}
                  className="size-4"
                  iconClassName="size-4"
                />
              ) : null}
              <div className="truncate font-medium text-muted-foreground text-xs">
                {providerName} Usage
              </div>
            </div>
            {checkedAt ? (
              <div className="text-[11px] tabular-nums text-muted-foreground/70">
                Updated {checkedAt}
              </div>
            ) : null}
          </div>
          {limitCount > 0 ? (
            <div className="flex flex-col gap-3">
              {usage?.limits.map((limit) => (
                <div key={limit.id} className="flex flex-col gap-2">
                  <div className="text-[11px] font-medium text-muted-foreground/80">
                    {limit.label}
                  </div>
                  {limit.windows.map((window) => {
                    const reset = formatReset(window.resetsAt);
                    return (
                      <div key={`${limit.id}:${window.label}`} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-3 text-[11px]">
                          <span className="text-muted-foreground/65">{window.label}</span>
                          <span className="font-medium tabular-nums text-muted-foreground/85">
                            {window.remainingPercent}% left
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                          <div
                            className={cn(
                              "h-full rounded-full transition-[width] duration-500",
                              window.remainingPercent <= 15
                                ? "bg-red-500"
                                : window.remainingPercent <= 35
                                  ? "bg-amber-500"
                                  : "bg-emerald-500",
                            )}
                            style={{ width: `${window.remainingPercent}%` }}
                          />
                        </div>
                        {reset ? (
                          <div className="text-[10px] text-muted-foreground/55">Resets {reset}</div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : hasSummary ? (
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {usage?.summary.lifetimeTokens ? (
                <div>
                  <div className="text-muted-foreground/60">Lifetime tokens</div>
                  <div className="font-medium tabular-nums">
                    {formatCompactNumber(usage.summary.lifetimeTokens)}
                  </div>
                </div>
              ) : null}
              {usage?.summary.peakDailyTokens ? (
                <div>
                  <div className="text-muted-foreground/60">Peak daily</div>
                  <div className="font-medium tabular-nums">
                    {formatCompactNumber(usage.summary.peakDailyTokens)}
                  </div>
                </div>
              ) : null}
            </div>
          ) : isRefreshing ? (
            <div className="text-[11px] leading-4 text-muted-foreground/70">
              Fetching usage details...
            </div>
          ) : (
            <div className="text-[11px] leading-4 text-muted-foreground/70">
              Usage details are not available for this provider.
            </div>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
