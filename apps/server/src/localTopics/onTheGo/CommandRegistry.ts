import type { OnTheGoCommand, OnTheGoFoundationCommand } from "@t3tools/contracts";

export const onTheGoFoundationCommandRegistry = {
  "response.record": "system",
  "response.handle": "owner",
  "response.navigate": "owner",
  "attention.record": "system",
  "attention.resolve": "owner",
  "profile.observe": "owner",
  "profile.undo": "owner",
  "profile.reset": "owner",
  "prompt.prepare": "owner",
  "prompt.revise": "owner",
  "prompt.mark-ready": "owner",
  "prompt.send": "owner",
  "pending.correct-to-steer": "owner",
  "pending.cancel": "owner",
  "pending.reorder": "owner",
  "turn.complete": "system",
  "scheduler.tick": "system",
  "queue.retry": "owner",
  "queue.continue": "owner",
  "data.delete": "owner",
  "theo.context.fetch": "owner",
  "agent.handoff.create": "owner",
  "model.use": "owner",
  "audio.render": "owner",
  "data.export-preview": "owner",
  "data.inspect": "owner",
  "data.diagnostics": "owner",
  "data.reset": "owner",
  "effects.reconcile": "system",
  "effect.abandon": "owner",
} as const satisfies Record<OnTheGoFoundationCommand["type"], "owner" | "system">;

export const isOnTheGoFoundationCommand = (
  command: OnTheGoCommand,
): command is OnTheGoFoundationCommand =>
  Object.hasOwn(onTheGoFoundationCommandRegistry, command.type);
