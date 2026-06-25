/// <reference types="vite-plus/client" />

import type { DesktopBridge, LocalApi } from "@t3tools/contracts";

interface ImportMetaEnv {
  readonly VITE_HTTP_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_HOSTED_APP_URL: string;
  readonly VITE_HOSTED_APP_CHANNEL: string;
  readonly VITE_T3CODE_PUBLIC_ORIGIN: string;
  readonly VITE_T3CODE_PUBLIC_BASE_PATH: string;
  readonly VITE_T3CODE_PUBLIC_BASE_URL: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_CLERK_JWT_TEMPLATE: string;
  readonly VITE_RELAY_OTLP_TRACES_URL: string;
  readonly VITE_RELAY_OTLP_TRACES_DATASET: string;
  readonly VITE_RELAY_OTLP_TRACES_TOKEN: string;
  readonly VITE_T3_WORKTREE_ROLE: string;
  readonly VITE_T3_WORKTREE_PATH: string;
  readonly VITE_T3_GIT_BRANCH: string;
  readonly VITE_T3_GIT_COMMIT: string;
  readonly VITE_T3_DEV_INSTANCE: string;
  readonly VITE_T3_HOME: string;
  readonly APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    nativeApi?: LocalApi;
    desktopBridge?: DesktopBridge;
  }
}
