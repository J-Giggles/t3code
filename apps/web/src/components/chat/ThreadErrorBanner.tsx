import { memo, useState } from "react";
import { Alert, AlertAction, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { CheckIcon, CircleAlertIcon, CopyIcon, EyeIcon, EyeOffIcon, XIcon } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";

export const ThreadErrorBanner = memo(function ThreadErrorBanner({
  error,
  onDismiss,
}: {
  error: string | null;
  onDismiss?: () => void;
}) {
  const [showRawError, setShowRawError] = useState(false);
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  if (!error) return null;
  return (
    <div className="pt-3 mx-auto max-w-3xl">
      <Alert variant="error">
        <CircleAlertIcon />
        <div className="min-w-0 flex-1">
          <Tooltip>
            <TooltipTrigger render={<AlertDescription className="line-clamp-3" />}>
              {error}
            </TooltipTrigger>
            <TooltipPopup side="top" className="max-w-96 whitespace-pre-wrap">
              {error}
            </TooltipPopup>
          </Tooltip>
          {showRawError ? (
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-destructive/20 bg-destructive/5 p-2 font-mono text-[11px] leading-relaxed text-destructive select-text">
              {error}
            </pre>
          ) : null}
        </div>
        <AlertAction>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={showRawError ? "Hide error details" : "Show error details"}
                  onClick={() => setShowRawError((value) => !value)}
                  size="icon-xs"
                  variant="ghost"
                />
              }
            >
              {showRawError ? (
                <EyeOffIcon className="text-destructive" />
              ) : (
                <EyeIcon className="text-destructive" />
              )}
            </TooltipTrigger>
            <TooltipPopup side="top">
              {showRawError ? "Hide error details" : "Show error details"}
            </TooltipPopup>
          </Tooltip>
        </AlertAction>
        <AlertAction>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={isCopied ? "Copied raw error" : "Copy raw error"}
                  onClick={() => copyToClipboard(error)}
                  size="icon-xs"
                  variant="ghost"
                />
              }
            >
              {isCopied ? (
                <CheckIcon className="text-destructive" />
              ) : (
                <CopyIcon className="text-destructive" />
              )}
            </TooltipTrigger>
            <TooltipPopup side="top">
              {isCopied ? "Copied raw error" : "Copy raw error"}
            </TooltipPopup>
          </Tooltip>
        </AlertAction>
        {onDismiss && (
          <AlertAction>
            <Button variant="ghost" size="icon-xs" aria-label="Dismiss error" onClick={onDismiss}>
              <XIcon className="text-destructive" />
            </Button>
          </AlertAction>
        )}
      </Alert>
    </div>
  );
});
