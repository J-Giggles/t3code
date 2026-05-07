import { memo, type PointerEventHandler } from "react";
import { MicIcon } from "lucide-react";
import { cn } from "~/lib/utils";

export type ComposerDictateButtonState =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "stopping"
  | "error"
  | "unavailable-secure-context";

export interface ComposerDictateButtonProps {
  state: ComposerDictateButtonState;
  preserveComposerFocusOnPointerDown?: boolean;
  unavailableTooltip?: string | null;
  onClick: () => void;
}

const preventPointerFocus: PointerEventHandler<HTMLElement> = (event) => {
  event.preventDefault();
};

export const ComposerDictateButton = memo(function ComposerDictateButton({
  state,
  preserveComposerFocusOnPointerDown = true,
  unavailableTooltip,
  onClick,
}: ComposerDictateButtonProps) {
  const pointerProps = preserveComposerFocusOnPointerDown
    ? { onPointerDown: preventPointerFocus }
    : undefined;
  const isRecording = state === "recording";
  const isBusy = state === "requesting-permission" || state === "stopping";
  const isUnavailable = state === "unavailable-secure-context";
  const isError = state === "error";
  return (
    <button
      type="button"
      data-state={state}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full transition-colors sm:h-8 sm:w-8",
        isRecording && "bg-rose-500/90 text-white animate-pulse",
        !isRecording && !isError && "bg-muted text-muted-foreground hover:bg-muted/80",
        isError && "bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25",
        isUnavailable && "opacity-40 cursor-not-allowed",
      )}
      onClick={onClick}
      disabled={isBusy || isUnavailable}
      aria-label={
        isRecording
          ? "Stop dictation"
          : isBusy
            ? "Dictation busy"
            : isUnavailable
              ? (unavailableTooltip ?? "Dictation unavailable")
              : isError
                ? "Retry dictation"
                : "Start dictation"
      }
      title={isUnavailable ? (unavailableTooltip ?? undefined) : undefined}
      {...pointerProps}
    >
      <MicIcon className="size-4" aria-hidden="true" />
    </button>
  );
});
