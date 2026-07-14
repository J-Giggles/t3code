// @effect-diagnostics nodeBuiltinImport:off - The runtime persistence port is synchronous so crash-safe intent writes complete before adapters run.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import {
  OnTheGoCommandDisposition,
  OnTheGoDeviceId,
  OnTheGoSnapshot,
  type OnTheGoCommandDisposition as OnTheGoCommandDispositionType,
  type OnTheGoCommandId,
  type OnTheGoSnapshot as OnTheGoSnapshotType,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as ServerConfig from "../../config.ts";
import type { OnTheGoPersistence, OnTheGoPersistedSnapshot } from "./Ports.ts";
import { makeOnTheGoServerService, type OnTheGoServerService } from "./ProductionService.ts";

interface PersistedEnvelope {
  readonly version: 1;
  readonly snapshot: OnTheGoPersistedSnapshot | null;
  readonly dispositions: Readonly<Record<string, OnTheGoCommandDispositionType>>;
  readonly deviceBindings: Readonly<Record<string, string>>;
}

const PersistedSnapshotSchema = Schema.Struct({
  ...OnTheGoSnapshot.fields,
  foundation: Schema.optional(OnTheGoSnapshot.fields.foundation),
  eventLog: Schema.optional(OnTheGoSnapshot.fields.eventLog),
});

const PersistedEnvelopeSchema = Schema.Struct({
  version: Schema.Literal(1),
  snapshot: Schema.NullOr(PersistedSnapshotSchema),
  dispositions: Schema.Record(Schema.String, OnTheGoCommandDisposition),
  deviceBindings: Schema.Record(Schema.String, Schema.String).pipe(
    Schema.withDecodingDefault(Effect.succeed({})),
  ),
});
const decodePersistedEnvelope = Schema.decodeUnknownSync(PersistedEnvelopeSchema);
const decodePersistedSnapshot = Schema.decodeUnknownSync(PersistedSnapshotSchema);
const DISPOSITION_LIMIT = 4_096;

export const boundOnTheGoDispositions = (
  dispositions: Readonly<Record<string, OnTheGoCommandDispositionType>>,
) => Object.fromEntries(Object.entries(dispositions).slice(-DISPOSITION_LIMIT));

const readEnvelope = (statePath: string): PersistedEnvelope => {
  try {
    const parsed = JSON.parse(NodeFS.readFileSync(statePath, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null) throw new Error("invalid state");
    if ("snapshot" in parsed) return decodePersistedEnvelope(parsed) as PersistedEnvelope;
    return {
      version: 1,
      snapshot: decodePersistedSnapshot(parsed) as OnTheGoPersistedSnapshot,
      dispositions: {},
      deviceBindings: {},
    };
  } catch {
    if (NodeFS.existsSync(statePath)) {
      NodeFS.renameSync(statePath, `${statePath}.invalid-${process.pid}`);
    }
    return { version: 1, snapshot: null, dispositions: {}, deviceBindings: {} };
  }
};

export const makeFileOnTheGoPersistence = (statePath: string): OnTheGoPersistence => {
  let envelope = readEnvelope(statePath);
  const persist = () => {
    NodeFS.mkdirSync(NodePath.dirname(statePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${statePath}.${process.pid}.tmp`;
    NodeFS.writeFileSync(temporaryPath, `${JSON.stringify(envelope)}\n`, { mode: 0o600 });
    NodeFS.renameSync(temporaryPath, statePath);
  };
  return {
    load: () => envelope.snapshot,
    save: (snapshot: OnTheGoSnapshotType) => {
      envelope = { ...envelope, snapshot };
      persist();
    },
    loadDisposition: (commandId: OnTheGoCommandId) => envelope.dispositions[commandId] ?? null,
    saveDisposition: (commandId: OnTheGoCommandId, disposition) => {
      envelope = {
        ...envelope,
        dispositions: boundOnTheGoDispositions({
          ...envelope.dispositions,
          [commandId]: disposition,
        }),
      };
      persist();
    },
    loadDeviceBinding: (deviceId: OnTheGoDeviceId) => envelope.deviceBindings[deviceId] ?? null,
    saveDeviceBinding: (deviceId: OnTheGoDeviceId, authenticatedSessionId: string) => {
      envelope = {
        ...envelope,
        deviceBindings: { ...envelope.deviceBindings, [deviceId]: authenticatedSessionId },
      };
      persist();
    },
  };
};

export class OnTheGoProductionService extends Context.Service<
  OnTheGoProductionService,
  OnTheGoServerService
>()("t3/localTopics/onTheGo/ProductionLayer/OnTheGoProductionService") {}

export const layer = Layer.effect(
  OnTheGoProductionService,
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const persistence = makeFileOnTheGoPersistence(
      NodePath.join(config.baseDir, "on-the-go", "state.json"),
    );
    const service = makeOnTheGoServerService({
      persistence,
      now: () => DateTime.formatIso(DateTime.nowUnsafe()),
    });
    yield* Effect.addFinalizer(() => Effect.sync(service.dispose));
    return service;
  }),
);
