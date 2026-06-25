import type { ServerLifecycleStreamEvent } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

type LifecycleEventInput = Omit<ServerLifecycleStreamEvent, "sequence">;

interface SnapshotState {
  readonly sequence: number;
  readonly events: ReadonlyArray<ServerLifecycleStreamEvent>;
}

export class ServerLifecycleEvents extends Context.Service<
  ServerLifecycleEvents,
  {
    readonly publish: (event: LifecycleEventInput) => Effect.Effect<ServerLifecycleStreamEvent>;
    readonly snapshot: Effect.Effect<SnapshotState>;
    readonly stream: Stream.Stream<ServerLifecycleStreamEvent>;
  }
>()("t3/serverLifecycleEvents") {}

const make = Effect.gen(function* () {
  const pubsub = yield* PubSub.unbounded<ServerLifecycleStreamEvent>();
  const state = yield* Ref.make<SnapshotState>({
    sequence: 0,
    events: [],
  });

  return ServerLifecycleEvents.of({
    publish: (event) =>
      Ref.modify(state, (current) => {
        const nextSequence = current.sequence + 1;
        const nextEvent = {
          ...event,
          sequence: nextSequence,
        } as ServerLifecycleStreamEvent;
        const nextEvents = [
          nextEvent,
          ...current.events.filter((entry) => entry.type !== nextEvent.type),
        ] satisfies ReadonlyArray<ServerLifecycleStreamEvent>;
        return [nextEvent, { sequence: nextSequence, events: nextEvents }] as const;
      }).pipe(Effect.tap((event) => PubSub.publish(pubsub, event))),
    snapshot: Ref.get(state),
    get stream() {
      return Stream.fromPubSub(pubsub);
    },
  });
});

export const layer = Layer.effect(ServerLifecycleEvents, make);
export const ServerLifecycleEventsLive = layer;

export type ServerLifecycleEventsShape = ServerLifecycleEvents["Service"];
