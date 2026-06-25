import type { EnvironmentId } from "@t3tools/contracts";

import { readEnvironmentRpcClient } from "../environmentApi";
import { readPreparedConnection } from "../state/session";

export function readEnvironmentConnection(environmentId: EnvironmentId) {
  const prepared = readPreparedConnection(environmentId);
  const client = readEnvironmentRpcClient(environmentId);
  if (!prepared || !client) return null;
  return { ...prepared, client };
}
