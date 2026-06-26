import React from "react";
import ReactDOM from "react-dom/client";
import { joinPublicPathPrefix } from "@t3tools/shared/publicPath";
import { ClerkProvider } from "@clerk/react";
import { passkeys } from "@clerk/electron/passkeys";
import { ClerkProvider as ElectronClerkProvider } from "@clerk/electron/react";
import { createHashHistory, createBrowserHistory } from "@tanstack/react-router";

import "@fontsource-variable/dm-sans/index.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@xterm/xterm/css/xterm.css";
import "./index.css";

import { isElectron } from "./env";
import { ManagedRelayAuthProvider } from "./cloud/managedAuth";
import { hasCloudPublicConfig } from "./cloud/publicConfig";
import { getRouter } from "./router";
import { syncDocumentWindowControlsOverlayClass } from "./lib/windowControlsOverlay";
import { AppRoot } from "./AppRoot";
import { readBrowserPublicPathPrefix } from "./publicPath";

const INITIAL_HISTORY_KEY = "initial";

function parseHistoryHref(href: string) {
  const url = new URL(href, window.location.origin);
  return {
    href: `${url.pathname}${url.search}${url.hash}`,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    state: window.history.state ?? {
      __TSR_index: 0,
      key: INITIAL_HISTORY_KEY,
      __TSR_key: INITIAL_HISTORY_KEY,
    },
  };
}

function stripBrowserPublicPathPrefix(pathname: string, publicPathPrefix: string): string {
  if (pathname === publicPathPrefix) {
    return "/";
  }
  if (pathname.startsWith(`${publicPathPrefix}/`)) {
    return pathname.slice(publicPathPrefix.length);
  }
  return pathname;
}

function createPublicPathBrowserHistory() {
  const publicPathPrefix = readBrowserPublicPathPrefix();
  if (!publicPathPrefix) {
    return createBrowserHistory();
  }

  return createBrowserHistory({
    parseLocation: () => {
      const pathname = stripBrowserPublicPathPrefix(window.location.pathname, publicPathPrefix);
      return parseHistoryHref(`${pathname}${window.location.search}${window.location.hash}`);
    },
    createHref: (path) => joinPublicPathPrefix(publicPathPrefix, path),
  });
}

// Electron loads the app from a file-backed shell, so hash history avoids path resolution issues.
const history = isElectron ? createHashHistory() : createPublicPathBrowserHistory();

const router = getRouter(history);

if (isElectron) {
  syncDocumentWindowControlsOverlayClass();
}

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

const app = <AppRoot router={router} />;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {clerkPublishableKey && hasCloudPublicConfig() ? (
      isElectron ? (
        <ElectronClerkProvider publishableKey={clerkPublishableKey} passkeys={passkeys}>
          <ManagedRelayAuthProvider>{app}</ManagedRelayAuthProvider>
        </ElectronClerkProvider>
      ) : (
        <ClerkProvider publishableKey={clerkPublishableKey}>
          <ManagedRelayAuthProvider>{app}</ManagedRelayAuthProvider>
        </ClerkProvider>
      )
    ) : (
      app
    )}
  </React.StrictMode>,
);
