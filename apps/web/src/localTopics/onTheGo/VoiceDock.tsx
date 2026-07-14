import type { OnTheGoController, OnTheGoControllerState } from "@t3tools/client-runtime/onTheGo";
import { AlertTriangle, Bell, ChevronDown, MessageCircle, Mic, Send, Square } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "../../components/ui/button";

export interface VoiceDockViewProps {
  readonly expanded: boolean;
  readonly state: OnTheGoControllerState;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly onToggle: (enabled: boolean) => void;
  readonly onPhrase: (phrase: string, source?: "voice" | "composer") => void;
}

const modeLabel = (mode: OnTheGoControllerState["mode"]) => {
  switch (mode) {
    case "theo-conversation":
      return "Theo Conversation";
    case "dictation":
      return "Dictation State";
    case "command":
      return "Command State";
    case "sleep":
      return "Sleep";
    case "degraded":
      return "Degraded";
    case "off":
      return "Off";
  }
};

function NumberBadge({
  count,
  kind,
}: {
  readonly count: number;
  readonly kind: "response" | "attention";
}) {
  if (count === 0) return null;
  const label = `${count} ${kind} notification${count === 1 ? "" : "s"}`;
  return (
    <span
      aria-label={label}
      className={
        kind === "attention"
          ? "inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-black"
          : "inline-flex min-w-5 items-center justify-center rounded-full bg-sky-500 px-1.5 text-[11px] font-semibold text-white"
      }
    >
      {count}
    </span>
  );
}

export function VoiceDockView({
  expanded,
  state,
  onExpandedChange,
  onToggle,
  onPhrase,
}: VoiceDockViewProps) {
  const [manualPhrase, setManualPhrase] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const phrase = manualPhrase.trim();
    if (!phrase) return;
    onPhrase(phrase, "composer");
    setManualPhrase("");
  };

  if (!expanded) {
    return (
      <div
        className="fixed right-4 bottom-4 z-70"
        data-testid="on-the-go-voice-dock"
        data-queued-work={state.queuedWork}
      >
        <Button
          type="button"
          size="icon-lg"
          aria-label="Open On-the-Go Voice Dock"
          className="relative size-13 rounded-full border border-sky-400/30 bg-slate-950 text-sky-100 shadow-2xl shadow-sky-950/50 hover:bg-slate-900"
          onClick={() => onExpandedChange(true)}
        >
          <Mic className={state.enabled ? "size-5 text-sky-300" : "size-5 text-slate-400"} />
          {state.responseBadge + state.attentionBadge > 0 ? (
            <span className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-bold text-white">
              {state.responseBadge + state.attentionBadge}
            </span>
          ) : null}
        </Button>
      </div>
    );
  }

  return (
    <section
      data-testid="on-the-go-voice-dock"
      data-queued-work={state.queuedWork}
      aria-label="On-the-Go Voice Dock"
      className="fixed right-4 bottom-4 z-70 flex w-[min(25rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/96 text-slate-100 shadow-2xl shadow-black/50 backdrop-blur-xl"
    >
      <header className="flex items-center gap-3 border-b border-white/8 px-4 py-3">
        <div
          className={`grid size-9 place-items-center rounded-xl ${state.enabled ? "bg-sky-400/15 text-sky-300" : "bg-white/5 text-slate-400"}`}
        >
          <Mic className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight">On-the-Go</h2>
          <p className="truncate text-xs text-slate-400">{modeLabel(state.mode)}</p>
        </div>
        <NumberBadge count={state.responseBadge} kind="response" />
        <NumberBadge count={state.attentionBadge} kind="attention" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Collapse Voice Dock"
          onClick={() => onExpandedChange(false)}
        >
          <ChevronDown className="size-4" />
        </Button>
      </header>

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/3 p-3">
          <div>
            <p className="text-sm font-medium">Voice control</p>
            <p className="text-xs text-slate-400">
              {state.available
                ? state.backgroundAvailable
                  ? "Available while minimized"
                  : "Foreground only"
                : (state.availabilityReason ??
                  "Speech input unavailable; typed controls remain available")}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant={state.enabled ? "default" : "outline"}
            aria-pressed={state.enabled}
            onClick={() => onToggle(!state.enabled)}
          >
            {state.enabled ? "Turn off" : "Turn on"}
          </Button>
        </div>

        <div className="rounded-xl bg-sky-400/8 px-3 py-2.5 ring-1 ring-inset ring-sky-300/10">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-sky-300 uppercase">
            Theo caption
          </p>
          <p aria-live="polite" className="mt-1 text-sm leading-5 text-slate-100">
            {state.caption}
          </p>
          {state.transcript ? (
            <p className="mt-2 border-t border-white/8 pt-2 text-xs text-slate-400">
              You: {state.transcript}
            </p>
          ) : null}
        </div>

        {state.theoMessages.length > 0 ? (
          <div className="max-h-36 space-y-2 overflow-y-auto rounded-xl border border-white/8 p-2.5">
            {state.theoMessages.slice(-4).map((message) => (
              <div
                key={`${message.role}:${message.text}`}
                className={
                  message.role === "theo"
                    ? "rounded-lg bg-violet-400/10 px-2.5 py-2 text-xs text-violet-100"
                    : "rounded-lg bg-white/5 px-2.5 py-2 text-xs text-slate-300"
                }
              >
                <span className="mr-1 font-semibold">
                  {message.role === "theo" ? "Theo" : "You"}:
                </span>
                {message.text}
              </div>
            ))}
          </div>
        ) : null}

        {state.preparedPrompt ? (
          <div
            className="rounded-xl border border-emerald-400/25 bg-emerald-400/8 p-3"
            aria-label="Prepared Prompt"
          >
            <p className="text-[10px] font-semibold tracking-[0.14em] text-emerald-300 uppercase">
              Prepared Prompt · {state.preparedPrompt.intent}
            </p>
            <p className="mt-1 text-xs text-emerald-100">
              Target: {state.preparedPrompt.targetAgentId} · Revision:{" "}
              {state.preparedPrompt.revisionId}
            </p>
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs text-slate-100">
              {state.preparedPrompt.content}
            </pre>
            <p className="mt-2 text-[11px] text-emerald-200">
              Review this exact revision, then say “Send it”.
            </p>
          </div>
        ) : null}

        {state.theoPreferences.length > 0 ? (
          <div className="rounded-xl border border-white/8 p-2.5">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
              Theo profile
            </p>
            <ul className="mt-1.5 space-y-1 text-xs text-slate-300">
              {state.theoPreferences.map((preference) => (
                <li key={preference}>{preference}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {state.vocabulary.length > 0 ? (
          <div className="rounded-xl border border-white/8 p-2.5">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
              Command vocabulary
            </p>
            <ul className="mt-1.5 space-y-1 text-xs text-slate-300">
              {state.vocabulary.map((entry) => (
                <li key={entry.phrase}>
                  “{entry.phrase}” → {entry.action}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {state.followTimeline.length > 0 ? (
          <div className="max-h-28 overflow-y-auto rounded-xl border border-white/8 p-2.5">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
              Follow timeline
            </p>
            {state.followTimeline.slice(-3).map((item) => (
              <p key={item.timelineId} className="mt-1.5 text-xs text-slate-300">
                {item.summary} <span className="text-slate-500">{item.evidence.join(", ")}</span>
              </p>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPhrase("T3 what was the last announcement", "composer")}
          >
            <Bell className="size-3.5" /> Last announcement
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPhrase("Hey Theo", "composer")}
          >
            <MessageCircle className="size-3.5" /> Talk to Theo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPhrase("Stop", "composer")}
          >
            <Square className="size-3.5" /> Stop
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPhrase("Send it", "composer")}
          >
            <Send className="size-3.5" /> Send it
          </Button>
        </div>

        <form className="flex gap-2" onSubmit={submit}>
          <label className="sr-only" htmlFor="on-the-go-command-input">
            Type or speak a command
          </label>
          <input
            id="on-the-go-command-input"
            value={manualPhrase}
            onChange={(event) => setManualPhrase(event.currentTarget.value)}
            placeholder="Type or speak a command…"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-sky-400/50"
          />
          <Button type="submit" size="icon-sm" aria-label="Run voice-equivalent command">
            <Send className="size-4" />
          </Button>
        </form>

        {state.queuedWork > 0 ? (
          <div className="flex items-center gap-2 text-xs text-amber-200">
            <AlertTriangle className="size-3.5" />
            {state.queuedWork} queued work item{state.queuedWork === 1 ? "" : "s"}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function VoiceDock({
  controller,
  enabledSetting,
  onEnabledSettingChange,
}: {
  readonly controller: OnTheGoController;
  readonly enabledSetting?: boolean;
  readonly onEnabledSettingChange?: (enabled: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState(controller.state);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    let active = true;
    void controller.start().then(() => {
      if (active) setStarted(true);
    });
    return () => {
      active = false;
      unsubscribe();
      controller.stop();
    };
  }, [controller]);

  useEffect(() => {
    if (!started || enabledSetting === undefined) return;
    void controller.toggle(enabledSetting).catch(() => undefined);
  }, [controller, enabledSetting, started]);

  return (
    <VoiceDockView
      expanded={expanded}
      state={state}
      onExpandedChange={setExpanded}
      onToggle={(enabled) => {
        void controller
          .toggle(enabled)
          .then(() => {
            if (controller.state().enabled === enabled) onEnabledSettingChange?.(enabled);
          })
          .catch(() => undefined);
      }}
      onPhrase={(phrase, source) => {
        void controller.acceptTranscript(phrase, source).catch(() => undefined);
      }}
    />
  );
}
