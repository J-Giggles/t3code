import type { ProviderSessionRecoverySummary, ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { ProviderSessionDirectoryPersistenceError } from "../Errors.ts";

export interface ProviderSessionStartupRecoveryShape {
  readonly recoverActiveSessions: Effect.Effect<
    ProviderSessionRecoverySummary,
    ProviderSessionDirectoryPersistenceError
  >;
  readonly recoverThreadSession: (
    threadId: ThreadId,
  ) => Effect.Effect<void, ProviderSessionDirectoryPersistenceError>;
}

export class ProviderSessionStartupRecovery extends Context.Service<
  ProviderSessionStartupRecovery,
  ProviderSessionStartupRecoveryShape
>()("t3/provider/Services/ProviderSessionStartupRecovery") {}
