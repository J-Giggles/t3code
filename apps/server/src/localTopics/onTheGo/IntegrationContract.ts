import { WS_METHODS } from "@t3tools/contracts";

export interface OnTheGoIntegrationContract {
  readonly version: 1;
  readonly seams: Readonly<Record<string, string>>;
}

export const ON_THE_GO_INTEGRATION_CONTRACT: OnTheGoIntegrationContract = {
  version: 1,
  seams: {
    "rpc.dispatch": WS_METHODS.onTheGoDispatch,
    "rpc.snapshot": WS_METHODS.onTheGoSnapshot,
    "rpc.events": WS_METHODS.subscribeOnTheGoEvents,
    "rpc.theo": WS_METHODS.onTheGoTheo,
    "settings.path": "serverSettings.onTheGo",
    "provider.events": "orchestration.streamDomainEvents",
    "desktop.audio-permission": "configureOnTheGoDesktopVoice",
    "desktop.background": "setOnTheGoBackgroundEnabled",
  },
};

const REQUIRED_ON_THE_GO_SEAMS = ON_THE_GO_INTEGRATION_CONTRACT.seams;

export const validateOnTheGoIntegrationContract = (observed: OnTheGoIntegrationContract) => {
  const violations = new Array<string>();
  if (observed.version !== 1) violations.push(`version:${observed.version}`);
  for (const [seam, expected] of Object.entries(REQUIRED_ON_THE_GO_SEAMS)) {
    if (observed.seams[seam] !== expected) {
      violations.push(`${seam}:${observed.seams[seam] ?? "missing"}`);
    }
  }
  return { valid: violations.length === 0, violations };
};

export const assertOnTheGoIntegrationContract = (observed: OnTheGoIntegrationContract) => {
  const result = validateOnTheGoIntegrationContract(observed);
  if (!result.valid) {
    throw new Error(`On-the-Go integration contract mismatch: ${result.violations.join(", ")}`);
  }
};
