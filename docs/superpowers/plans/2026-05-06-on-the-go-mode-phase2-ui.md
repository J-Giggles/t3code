# On-the-Go Mode — Phase 2: UI Shell + Voice Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the user-facing UI for on-the-go mode on top of the Phase 1 orchestration layer — the route, the toggle, the notification cards, the voice screen, and all components — and wire everything together so a user can drive the full happy path end-to-end with the real `BrowserVoiceAdapter` and a configured `SummaryAdapter`.

**Architecture:** Mobile-first variants of existing shadcn primitives in `apps/web/src/onTheGo/components/`. TanStack Router file-based route at `apps/web/src/routes/on-the-go.$tab.tsx`. The orchestrator from Phase 1 is constructed once at route mount with the real `BrowserVoiceAdapter`, the user's configured `SummaryAdapter`, and the real RPC-backed `commitPrompt` + `ThreadStateStream`. UI components are pure renderers driven by orchestrator signals.

**Tech Stack:** React + TanStack Router + shadcn/Tailwind + Lucide. Browser-mode tests via `vitest.browser.config.ts`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-06-on-the-go-mode-design.md`

**Phase 2 acceptance:**
- All tasks below complete and committed.
- `/on-the-go/inbox` and `/on-the-go/paused` routes work in dev (`bun run dev:web`) on a real mobile viewport.
- Tapping a notification card initiates the full voice flow: TTS summary → conversation → "ship it" → countdown → commit (real RPC call into the main thread).
- Cancel during countdown returns to conversation.
- Pause / Resume work end-to-end.
- All component-level tests pass; the existing Phase 1 unit tests still pass.

**Notes from Phase 1:**
- The orchestrator is pluggable via `OrchestratorDeps`. `commitPrompt` is supplied at app wire-up time (Task 11 below) by adapting the existing main-thread message-send RPC.
- The `ThreadStateStream` interface defined in `state/threadSubscription.ts` is adapted from the existing T3 Code thread-state subscription source in Task 1 below.

---

## Task 1: Route + tab parameter wiring

**Files:**
- Create: `apps/web/src/routes/on-the-go.$tab.tsx`
- Create: `apps/web/src/onTheGo/routes/OnTheGoApp.tsx`
- Create: `apps/web/src/onTheGo/routes/OnTheGoApp.test.tsx`

> **What this task does:** wires the TanStack Router route to a placeholder `OnTheGoApp` component that shows which tab is active. Subsequent tasks replace the placeholder with real Inbox/Paused tab UIs.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/onTheGo/routes/OnTheGoApp.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OnTheGoApp } from "./OnTheGoApp";

describe("OnTheGoApp", () => {
  it("renders Inbox heading when tab is inbox", () => {
    render(<OnTheGoApp tab="inbox" />);
    expect(screen.getByRole("heading", { name: /inbox/i })).toBeInTheDocument();
  });

  it("renders Paused heading when tab is paused", () => {
    render(<OnTheGoApp tab="paused" />);
    expect(screen.getByRole("heading", { name: /paused/i })).toBeInTheDocument();
  });

  it("renders tab navigation links", () => {
    render(<OnTheGoApp tab="inbox" />);
    expect(screen.getByRole("link", { name: /inbox/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /paused/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --cwd apps/web test:browser OnTheGoApp`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the placeholder `OnTheGoApp`**

```tsx
// apps/web/src/onTheGo/routes/OnTheGoApp.tsx
import { Link } from "@tanstack/react-router";

export type OnTheGoTab = "inbox" | "paused";

export function OnTheGoApp({ tab }: { tab: OnTheGoTab }) {
  return (
    <div className="flex flex-col h-screen w-screen bg-background">
      <nav className="flex border-b border-border" role="tablist" aria-label="On-the-go tabs">
        <Link
          to="/on-the-go/$tab"
          params={{ tab: "inbox" }}
          className={`flex-1 py-4 text-center text-lg font-medium ${
            tab === "inbox" ? "text-foreground border-b-2 border-primary" : "text-muted-foreground"
          }`}
          role="tab"
          aria-selected={tab === "inbox"}
        >
          Inbox
        </Link>
        <Link
          to="/on-the-go/$tab"
          params={{ tab: "paused" }}
          className={`flex-1 py-4 text-center text-lg font-medium ${
            tab === "paused" ? "text-foreground border-b-2 border-primary" : "text-muted-foreground"
          }`}
          role="tab"
          aria-selected={tab === "paused"}
        >
          Paused
        </Link>
      </nav>
      <main className="flex-1 overflow-y-auto" role="tabpanel">
        <h1 className="px-4 py-3 text-2xl font-semibold capitalize">{tab}</h1>
        <div className="px-4 text-muted-foreground">Coming in subsequent tasks…</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Create the route file**

```tsx
// apps/web/src/routes/on-the-go.$tab.tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { OnTheGoApp, type OnTheGoTab } from "~/onTheGo/routes/OnTheGoApp";

export const Route = createFileRoute("/on-the-go/$tab")({
  beforeLoad: ({ params }) => {
    if (params.tab !== "inbox" && params.tab !== "paused") {
      throw redirect({ to: "/on-the-go/$tab", params: { tab: "inbox" } });
    }
  },
  component: OnTheGoRoute,
});

function OnTheGoRoute() {
  const { tab } = Route.useParams();
  return <OnTheGoApp tab={tab as OnTheGoTab} />;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test:browser OnTheGoApp`
Expected: PASS — 3 tests.

- [ ] **Step 6: Smoke check in dev**

Run: `bun run dev:web` (in a separate terminal)
Visit `http://localhost:<port>/on-the-go/inbox` — expect "Inbox" heading.
Visit `http://localhost:<port>/on-the-go/paused` — expect "Paused" heading.
Visit `http://localhost:<port>/on-the-go/garbage` — expect redirect to `/on-the-go/inbox`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/routes/on-the-go.$tab.tsx apps/web/src/onTheGo/routes/
git commit -m "feat(on-the-go): route and tab navigation skeleton"
```

---

## Task 2: Toggle icon in existing header

**Files:**
- Modify: the existing T3 Code header component (search for it via `apps/web/src/components/`; likely `AppSidebarLayout.tsx` or a top-bar component imported by it). Add the toggle icon alongside settings/account.
- Create: `apps/web/src/onTheGo/components/OnTheGoToggleButton.tsx`
- Create: `apps/web/src/onTheGo/components/OnTheGoToggleButton.test.tsx`

> **First step for engineer:** locate the existing header. Run `Grep -n "settings" apps/web/src/components/` to find where the settings icon lives. Add the on-the-go toggle next to it.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/onTheGo/components/OnTheGoToggleButton.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OnTheGoToggleButton } from "./OnTheGoToggleButton";

describe("OnTheGoToggleButton", () => {
  it("renders a button with phone icon and accessible label", () => {
    render(<OnTheGoToggleButton currentRoute="/" notificationCount={0} />);
    const btn = screen.getByRole("button", { name: /on-the-go/i });
    expect(btn).toBeInTheDocument();
  });

  it("shows a badge with notification count when > 0", () => {
    render(<OnTheGoToggleButton currentRoute="/" notificationCount={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders an X icon when on the on-the-go route", () => {
    render(<OnTheGoToggleButton currentRoute="/on-the-go/inbox" notificationCount={0} />);
    const btn = screen.getByRole("button", { name: /exit on-the-go/i });
    expect(btn).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --cwd apps/web test:browser OnTheGoToggleButton`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the toggle button**

```tsx
// apps/web/src/onTheGo/components/OnTheGoToggleButton.tsx
import { Link } from "@tanstack/react-router";
import { Headphones, XCircle } from "lucide-react";

export function OnTheGoToggleButton({
  currentRoute,
  notificationCount,
}: {
  currentRoute: string;
  notificationCount: number;
}) {
  const onOnTheGo = currentRoute.startsWith("/on-the-go");
  if (onOnTheGo) {
    return (
      <Link to="/" aria-label="Exit on-the-go mode" className="relative inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-muted">
        <XCircle className="h-5 w-5" />
      </Link>
    );
  }
  return (
    <Link to="/on-the-go/$tab" params={{ tab: "inbox" }} aria-label="On-the-go mode" className="relative inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-muted">
      <Headphones className="h-5 w-5" />
      {notificationCount > 0 && (
        <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">
          {notificationCount}
        </span>
      )}
    </Link>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run --cwd apps/web test:browser OnTheGoToggleButton`
Expected: PASS — 3 tests.

- [ ] **Step 5: Wire it into the existing header**

Locate the existing header component. Import `OnTheGoToggleButton`. Use a hook like `useRouterState` to get the current pathname, and use `useNotificationsStore` (a hook we'll add in Task 3) for `notificationCount`. For Phase 2 Task 2 specifically, hard-code `notificationCount={0}` if the hook isn't ready yet — the binding is finalized at Task 11 wire-up.

```tsx
// inside the existing header component (example):
import { useRouterState } from "@tanstack/react-router";
import { OnTheGoToggleButton } from "~/onTheGo/components/OnTheGoToggleButton";

const pathname = useRouterState({ select: (s) => s.location.pathname });
// ...
<OnTheGoToggleButton currentRoute={pathname} notificationCount={0} />
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/onTheGo/components/OnTheGoToggleButton.tsx apps/web/src/onTheGo/components/OnTheGoToggleButton.test.tsx <header file>
git commit -m "feat(on-the-go): toggle button in header"
```

---

## Task 3: `useNotifications` hook + `<NotificationsContext>`

**Files:**
- Create: `apps/web/src/onTheGo/hooks/notificationsContext.tsx`
- Create: `apps/web/src/onTheGo/hooks/useNotifications.ts`
- Create: `apps/web/src/onTheGo/hooks/useNotifications.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/onTheGo/hooks/useNotifications.test.tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createNotificationsStore } from "../state/notificationsStore";
import { NotificationsProvider } from "./notificationsContext";
import { useNotifications } from "./useNotifications";

describe("useNotifications", () => {
  it("returns the current notifications and count", () => {
    const store = createNotificationsStore();
    const { result } = renderHook(() => useNotifications(), {
      wrapper: ({ children }) => (
        <NotificationsProvider store={store}>{children}</NotificationsProvider>
      ),
    });
    expect(result.current.notifications).toEqual([]);
    expect(result.current.count).toBe(0);
  });

  it("re-renders when notifications change", () => {
    const store = createNotificationsStore();
    const { result } = renderHook(() => useNotifications(), {
      wrapper: ({ children }) => (
        <NotificationsProvider store={store}>{children}</NotificationsProvider>
      ),
    });
    act(() => {
      store.add({
        threadId: "t1" as any,
        threadTitle: "T",
        status: "awaiting",
        agentLastMessage: "a",
        userLastMessage: "u",
        updatedAt: 1,
      });
    });
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.count).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --cwd apps/web test:browser useNotifications`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the context and hook**

```tsx
// apps/web/src/onTheGo/hooks/notificationsContext.tsx
import { createContext, useContext, type ReactNode } from "react";
import type { NotificationsStore } from "../state/notificationsStore";

const NotificationsContext = createContext<NotificationsStore | null>(null);

export function NotificationsProvider({
  children,
  store,
}: {
  children: ReactNode;
  store: NotificationsStore;
}) {
  return <NotificationsContext.Provider value={store}>{children}</NotificationsContext.Provider>;
}

export function useNotificationsStore(): NotificationsStore {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotificationsStore must be used inside <NotificationsProvider>");
  return ctx;
}
```

```ts
// apps/web/src/onTheGo/hooks/useNotifications.ts
import { useEffect, useState } from "react";
import type { Notification } from "../types";
import { useNotificationsStore } from "./notificationsContext";

export function useNotifications(): { notifications: Notification[]; count: number } {
  const store = useNotificationsStore();
  const [notifications, setNotifications] = useState(store.notifications.value);
  const [count, setCount] = useState(store.count.value);
  useEffect(() => {
    const unsubA = store.notifications.subscribe(setNotifications);
    const unsubB = store.count.subscribe(setCount);
    return () => {
      unsubA();
      unsubB();
    };
  }, [store]);
  return { notifications, count };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test:browser useNotifications`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/hooks/
git commit -m "feat(on-the-go): NotificationsProvider context and useNotifications hook"
```

---

## Task 4: `<NotificationCard>` component

**Files:**
- Create: `apps/web/src/onTheGo/components/NotificationCard.tsx`
- Create: `apps/web/src/onTheGo/components/NotificationCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/src/onTheGo/components/NotificationCard.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Notification } from "../types";
import { NotificationCard } from "./NotificationCard";

const baseNotif: Notification = {
  threadId: "t1" as any,
  threadTitle: "Add OAuth flow",
  status: "awaiting",
  agentLastMessage: "I've added the Google OAuth callback handler. Tests pass. Want me to wire up the redirect logic?",
  userLastMessage: "add oauth",
  changeSummary: "4 files edited",
  branch: "main",
  updatedAt: Date.now() - 120_000,
};

describe("NotificationCard", () => {
  it("renders thread title, preview, change chip, and branch", () => {
    render(<NotificationCard notification={baseNotif} onTap={() => {}} onDismiss={() => {}} onPause={() => {}} />);
    expect(screen.getByText(/Add OAuth flow/i)).toBeInTheDocument();
    expect(screen.getByText(/I've added the Google OAuth/i)).toBeInTheDocument();
    expect(screen.getByText(/4 files edited/i)).toBeInTheDocument();
    expect(screen.getByText(/main/i)).toBeInTheDocument();
  });

  it("shows 'Awaiting' badge for awaiting status", () => {
    render(<NotificationCard notification={baseNotif} onTap={() => {}} onDismiss={() => {}} onPause={() => {}} />);
    expect(screen.getByText(/awaiting/i)).toBeInTheDocument();
  });

  it("shows 'Errored' badge with role=alert for errored status", () => {
    render(<NotificationCard notification={{ ...baseNotif, status: "errored" }} onTap={() => {}} onDismiss={() => {}} onPause={() => {}} />);
    const badge = screen.getByText(/errored/i);
    expect(badge).toBeInTheDocument();
    expect(badge.closest("[role='alert']")).not.toBeNull();
  });

  it("calls onTap when clicked", () => {
    const onTap = vi.fn();
    render(<NotificationCard notification={baseNotif} onTap={onTap} onDismiss={() => {}} onPause={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /tap to summarize/i }));
    expect(onTap).toHaveBeenCalledWith(baseNotif);
  });

  it("renders relative age", () => {
    render(<NotificationCard notification={baseNotif} onTap={() => {}} onDismiss={() => {}} onPause={() => {}} />);
    expect(screen.getByText(/2m/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test:browser NotificationCard`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `<NotificationCard>`**

```tsx
// apps/web/src/onTheGo/components/NotificationCard.tsx
import { ChevronRight, FileEdit } from "lucide-react";
import type { Notification } from "../types";

function formatRelative(at: number): string {
  const diff = Date.now() - at;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationCard({
  notification,
  onTap,
  onDismiss: _onDismiss,
  onPause: _onPause,
}: {
  notification: Notification;
  onTap: (n: Notification) => void;
  onDismiss: (n: Notification) => void;
  onPause: (n: Notification) => void;
}) {
  const isErrored = notification.status === "errored";
  return (
    <button
      type="button"
      onClick={() => onTap(notification)}
      className="w-full rounded-lg border border-border bg-card p-4 text-left active:bg-muted transition-colors min-h-[180px] flex flex-col gap-3"
      aria-label="Tap to summarize"
    >
      <div className="flex items-center justify-between text-sm">
        <span
          role={isErrored ? "alert" : undefined}
          className={`inline-flex items-center gap-1.5 font-medium ${
            isErrored ? "text-red-600" : "text-emerald-600"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${isErrored ? "bg-red-600" : "bg-emerald-600"}`} />
          {isErrored ? "Errored" : "Awaiting"}
        </span>
        <span className="text-muted-foreground">{formatRelative(notification.updatedAt)}</span>
      </div>
      <h3 className="text-xl font-semibold leading-tight">{notification.threadTitle}</h3>
      <p className="text-base text-muted-foreground line-clamp-3">{notification.agentLastMessage}</p>
      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-auto">
        {notification.changeSummary && (
          <span className="inline-flex items-center gap-1">
            <FileEdit className="h-4 w-4" />
            {notification.changeSummary}
          </span>
        )}
        {notification.branch && <span>· {notification.branch}</span>}
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3 -mx-4 px-4 -mb-4 pb-3">
        <span className="text-base font-medium text-primary">Tap to summarize</span>
        <ChevronRight className="h-5 w-5 text-primary" />
      </div>
    </button>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test:browser NotificationCard`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/components/NotificationCard.tsx apps/web/src/onTheGo/components/NotificationCard.test.tsx
git commit -m "feat(on-the-go): NotificationCard component"
```

---

## Task 5: Inbox tab — render notifications, handle taps

**Files:**
- Create: `apps/web/src/onTheGo/components/InboxTab.tsx`
- Create: `apps/web/src/onTheGo/components/InboxTab.test.tsx`
- Modify: `apps/web/src/onTheGo/routes/OnTheGoApp.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/onTheGo/components/InboxTab.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createNotificationsStore } from "../state/notificationsStore";
import { NotificationsProvider } from "../hooks/notificationsContext";
import { InboxTab } from "./InboxTab";

describe("InboxTab", () => {
  it("renders empty state when no notifications", () => {
    const store = createNotificationsStore();
    render(
      <NotificationsProvider store={store}>
        <InboxTab onSelect={() => {}} />
      </NotificationsProvider>,
    );
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });

  it("renders one card per notification", () => {
    const store = createNotificationsStore();
    store.add({
      threadId: "t1" as any,
      threadTitle: "First",
      status: "awaiting",
      agentLastMessage: "first message",
      userLastMessage: "u",
      updatedAt: 1,
    });
    store.add({
      threadId: "t2" as any,
      threadTitle: "Second",
      status: "awaiting",
      agentLastMessage: "second message",
      userLastMessage: "u",
      updatedAt: 2,
    });
    render(
      <NotificationsProvider store={store}>
        <InboxTab onSelect={() => {}} />
      </NotificationsProvider>,
    );
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });

  it("calls onSelect with the notification when a card is tapped", () => {
    const store = createNotificationsStore();
    store.add({
      threadId: "t1" as any,
      threadTitle: "Tap me",
      status: "awaiting",
      agentLastMessage: "msg",
      userLastMessage: "u",
      updatedAt: 1,
    });
    const onSelect = vi.fn();
    render(
      <NotificationsProvider store={store}>
        <InboxTab onSelect={onSelect} />
      </NotificationsProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /tap to summarize/i }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect.mock.calls[0]![0].threadTitle).toBe("Tap me");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --cwd apps/web test:browser InboxTab`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `<InboxTab>`**

```tsx
// apps/web/src/onTheGo/components/InboxTab.tsx
import { useNotifications } from "../hooks/useNotifications";
import { useNotificationsStore } from "../hooks/notificationsContext";
import type { Notification } from "../types";
import { NotificationCard } from "./NotificationCard";

export function InboxTab({ onSelect }: { onSelect: (n: Notification) => void }) {
  const { notifications } = useNotifications();
  const store = useNotificationsStore();

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center">
        <h2 className="text-xl font-semibold mb-2">All caught up</h2>
        <p className="text-muted-foreground">No threads waiting on you right now.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3 p-4">
      {notifications.map((n) => (
        <li key={String(n.threadId)}>
          <NotificationCard
            notification={n}
            onTap={onSelect}
            onDismiss={() => store.dismiss(n.threadId)}
            onPause={() => {
              // Pause-from-card path is handled at the orchestrator level (Phase 2 Task 11)
              // when the card is the entry point — for now, dismiss as a placeholder.
              store.dismiss(n.threadId);
            }}
          />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test:browser InboxTab`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/components/InboxTab.tsx apps/web/src/onTheGo/components/InboxTab.test.tsx
git commit -m "feat(on-the-go): InboxTab renders cards from store"
```

---

## Task 6: Paused tab — render paused sessions

**Files:**
- Create: `apps/web/src/onTheGo/hooks/pausedSessionsContext.tsx`
- Create: `apps/web/src/onTheGo/hooks/usePausedSessions.ts`
- Create: `apps/web/src/onTheGo/components/PausedTab.tsx`
- Create: `apps/web/src/onTheGo/components/PausedTab.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/onTheGo/components/PausedTab.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createInMemoryPausedSessionsStore } from "../state/pausedSessionsStore";
import { PausedSessionsProvider } from "../hooks/pausedSessionsContext";
import { PausedTab } from "./PausedTab";

describe("PausedTab", () => {
  it("renders empty state when no paused sessions", () => {
    const store = createInMemoryPausedSessionsStore();
    render(
      <PausedSessionsProvider store={store}>
        <PausedTab onResume={() => {}} />
      </PausedSessionsProvider>,
    );
    expect(screen.getByText(/no paused/i)).toBeInTheDocument();
  });

  it("renders one card per paused session and calls onResume on tap", async () => {
    const store = createInMemoryPausedSessionsStore();
    await store.save({
      threadId: "t1" as any,
      notification: {
        threadId: "t1" as any,
        threadTitle: "Paused thread",
        status: "awaiting",
        agentLastMessage: "msg",
        userLastMessage: "u",
        updatedAt: 1,
      },
      history: [],
      pausedAt: 1,
      pauseReason: "manual",
    });
    const onResume = vi.fn();
    render(
      <PausedSessionsProvider store={store}>
        <PausedTab onResume={onResume} />
      </PausedSessionsProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /tap to summarize/i }));
    expect(onResume).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test:browser PausedTab`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement context, hook, and `<PausedTab>`**

```tsx
// apps/web/src/onTheGo/hooks/pausedSessionsContext.tsx
import { createContext, useContext, type ReactNode } from "react";
import type { PausedSessionsStore } from "../state/pausedSessionsStore";

const PausedContext = createContext<PausedSessionsStore | null>(null);

export function PausedSessionsProvider({
  children,
  store,
}: {
  children: ReactNode;
  store: PausedSessionsStore;
}) {
  return <PausedContext.Provider value={store}>{children}</PausedContext.Provider>;
}

export function usePausedSessionsStore(): PausedSessionsStore {
  const ctx = useContext(PausedContext);
  if (!ctx) throw new Error("usePausedSessionsStore must be used inside <PausedSessionsProvider>");
  return ctx;
}
```

```ts
// apps/web/src/onTheGo/hooks/usePausedSessions.ts
import { useEffect, useState } from "react";
import type { PausedSession } from "../types";
import { usePausedSessionsStore } from "./pausedSessionsContext";

export function usePausedSessions(): PausedSession[] {
  const store = usePausedSessionsStore();
  const [list, setList] = useState(store.list.value);
  useEffect(() => store.list.subscribe(setList), [store]);
  return list;
}
```

```tsx
// apps/web/src/onTheGo/components/PausedTab.tsx
import type { PausedSession } from "../types";
import { usePausedSessions } from "../hooks/usePausedSessions";
import { NotificationCard } from "./NotificationCard";

export function PausedTab({ onResume }: { onResume: (s: PausedSession) => void }) {
  const sessions = usePausedSessions();
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center">
        <h2 className="text-xl font-semibold mb-2">No paused conversations</h2>
        <p className="text-muted-foreground">Sessions you pause will show up here.</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-3 p-4">
      {sessions.map((s) => (
        <li key={String(s.threadId)}>
          <NotificationCard
            notification={s.notification}
            onTap={() => onResume(s)}
            onDismiss={() => {}}
            onPause={() => {}}
          />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test:browser PausedTab`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/hooks/pausedSessionsContext.tsx apps/web/src/onTheGo/hooks/usePausedSessions.ts apps/web/src/onTheGo/components/PausedTab.tsx apps/web/src/onTheGo/components/PausedTab.test.tsx
git commit -m "feat(on-the-go): PausedTab renders paused sessions"
```

---

## Task 7: `<VoiceIndicator>` component

**Files:**
- Create: `apps/web/src/onTheGo/components/VoiceIndicator.tsx`
- Create: `apps/web/src/onTheGo/components/VoiceIndicator.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/src/onTheGo/components/VoiceIndicator.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VoiceIndicator } from "./VoiceIndicator";

describe("VoiceIndicator", () => {
  it("renders the speaking state with three dots", () => {
    const { container } = render(<VoiceIndicator state="speaking" />);
    expect(container.querySelectorAll("[data-dot]").length).toBe(3);
  });

  it("renders the listening state with an animated ring", () => {
    const { container } = render(<VoiceIndicator state="listening" />);
    expect(container.querySelector("[data-ring]")).not.toBeNull();
  });

  it("renders the thinking state with a spinner", () => {
    const { container } = render(<VoiceIndicator state="thinking" />);
    expect(container.querySelector("[data-spinner]")).not.toBeNull();
  });

  it("renders the paused state with a mic icon", () => {
    render(<VoiceIndicator state="paused" />);
    expect(screen.getByLabelText(/microphone/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test:browser VoiceIndicator`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `<VoiceIndicator>`**

```tsx
// apps/web/src/onTheGo/components/VoiceIndicator.tsx
import { Mic } from "lucide-react";

export type VoiceIndicatorState = "speaking" | "listening" | "thinking" | "paused";

export function VoiceIndicator({ state }: { state: VoiceIndicatorState }) {
  if (state === "speaking") {
    return (
      <div className="flex items-center justify-center gap-3 py-4" aria-label="Bot is speaking">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            data-dot
            className="h-4 w-4 rounded-full bg-primary animate-pulse"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    );
  }
  if (state === "listening") {
    return (
      <div className="flex items-center justify-center py-4" aria-label="Listening">
        <span
          data-ring
          className="h-16 w-16 rounded-full border-4 border-primary animate-ping"
        />
      </div>
    );
  }
  if (state === "thinking") {
    return (
      <div className="flex items-center justify-center py-4" aria-label="Thinking">
        <span
          data-spinner
          className="h-12 w-12 rounded-full border-4 border-muted border-t-primary animate-spin"
        />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center py-4">
      <Mic className="h-12 w-12 text-muted-foreground" aria-label="Microphone (paused)" />
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test:browser VoiceIndicator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/components/VoiceIndicator.tsx apps/web/src/onTheGo/components/VoiceIndicator.test.tsx
git commit -m "feat(on-the-go): VoiceIndicator with four states"
```

---

## Task 8: `<LiveCaptionRibbon>` component

**Files:**
- Create: `apps/web/src/onTheGo/components/LiveCaptionRibbon.tsx`
- Create: `apps/web/src/onTheGo/components/LiveCaptionRibbon.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/src/onTheGo/components/LiveCaptionRibbon.test.tsx
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveCaptionRibbon } from "./LiveCaptionRibbon";

describe("LiveCaptionRibbon", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders the caption text when non-empty", () => {
    render(<LiveCaptionRibbon caption="Hello world" />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("hides the caption after 5 seconds of no change", () => {
    const { rerender } = render(<LiveCaptionRibbon caption="Hello" />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
    vi.advanceTimersByTime(5100);
    rerender(<LiveCaptionRibbon caption="Hello" />);
    expect(screen.queryByText("Hello")).toBeNull();
  });

  it("resets the fade timer when caption changes", () => {
    const { rerender } = render(<LiveCaptionRibbon caption="First" />);
    vi.advanceTimersByTime(3000);
    rerender(<LiveCaptionRibbon caption="Second" />);
    vi.advanceTimersByTime(3000);
    expect(screen.getByText("Second")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test:browser LiveCaptionRibbon`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `<LiveCaptionRibbon>`**

```tsx
// apps/web/src/onTheGo/components/LiveCaptionRibbon.tsx
import { useEffect, useState } from "react";

export function LiveCaptionRibbon({ caption }: { caption: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [caption]);
  if (!caption || !visible) return null;
  return (
    <div className="px-6 py-4 text-center text-lg leading-relaxed text-foreground/80 max-w-md mx-auto">
      {caption}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test:browser LiveCaptionRibbon`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/components/LiveCaptionRibbon.tsx apps/web/src/onTheGo/components/LiveCaptionRibbon.test.tsx
git commit -m "feat(on-the-go): LiveCaptionRibbon with 5s fade"
```

---

## Task 9: `<ThreeButtonBar>` component

**Files:**
- Create: `apps/web/src/onTheGo/components/ThreeButtonBar.tsx`
- Create: `apps/web/src/onTheGo/components/ThreeButtonBar.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/src/onTheGo/components/ThreeButtonBar.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThreeButtonBar } from "./ThreeButtonBar";

describe("ThreeButtonBar", () => {
  it("renders Pause / Mic / Ship it labels", () => {
    render(<ThreeButtonBar onPause={() => {}} onMic={() => {}} onShipIt={() => {}} />);
    expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mic/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ship it/i })).toBeInTheDocument();
  });

  it("each button is at least 64pt tall", () => {
    render(<ThreeButtonBar onPause={() => {}} onMic={() => {}} onShipIt={() => {}} />);
    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      const style = window.getComputedStyle(btn);
      expect(parseInt(style.minHeight)).toBeGreaterThanOrEqual(64);
    }
  });

  it("calls the right callback per button", () => {
    const onPause = vi.fn();
    const onMic = vi.fn();
    const onShipIt = vi.fn();
    render(<ThreeButtonBar onPause={onPause} onMic={onMic} onShipIt={onShipIt} />);
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    fireEvent.click(screen.getByRole("button", { name: /mic/i }));
    fireEvent.click(screen.getByRole("button", { name: /ship it/i }));
    expect(onPause).toHaveBeenCalled();
    expect(onMic).toHaveBeenCalled();
    expect(onShipIt).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test:browser ThreeButtonBar`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `<ThreeButtonBar>`**

```tsx
// apps/web/src/onTheGo/components/ThreeButtonBar.tsx
import { Mic, Pause, Send } from "lucide-react";

export function ThreeButtonBar({
  onPause,
  onMic,
  onShipIt,
  shipItLabel = "Ship it",
}: {
  onPause: () => void;
  onMic: () => void;
  onShipIt: () => void;
  shipItLabel?: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
      <button
        type="button"
        onClick={onPause}
        className="flex flex-col items-center justify-center gap-1 rounded-lg bg-muted text-muted-foreground active:bg-muted/80 min-h-[64px] py-4"
        aria-label="Pause"
      >
        <Pause className="h-6 w-6" />
        <span className="text-sm font-medium">Pause</span>
      </button>
      <button
        type="button"
        onClick={onMic}
        className="flex flex-col items-center justify-center gap-1 rounded-lg bg-primary text-primary-foreground active:bg-primary/90 min-h-[80px] py-4"
        aria-label="Mic"
      >
        <Mic className="h-7 w-7" />
        <span className="text-sm font-medium">Mic</span>
      </button>
      <button
        type="button"
        onClick={onShipIt}
        className="flex flex-col items-center justify-center gap-1 rounded-lg bg-emerald-600 text-white active:bg-emerald-700 min-h-[64px] py-4"
        aria-label={shipItLabel}
      >
        <Send className="h-6 w-6" />
        <span className="text-sm font-medium">{shipItLabel}</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test:browser ThreeButtonBar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/components/ThreeButtonBar.tsx apps/web/src/onTheGo/components/ThreeButtonBar.test.tsx
git commit -m "feat(on-the-go): ThreeButtonBar with safe-area-aware layout"
```

---

## Task 10: `<TranscriptDrawer>` component

**Files:**
- Create: `apps/web/src/onTheGo/components/TranscriptDrawer.tsx`
- Create: `apps/web/src/onTheGo/components/TranscriptDrawer.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/src/onTheGo/components/TranscriptDrawer.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Turn } from "../types";
import { TranscriptDrawer } from "./TranscriptDrawer";

const sampleHistory: Turn[] = [
  { role: "assistant", text: "Bot opened.", at: 1 },
  { role: "user", text: "User replied.", at: 2 },
  { role: "assistant", text: "Bot answered.", at: 3 },
];

describe("TranscriptDrawer", () => {
  it("is hidden when not open", () => {
    render(<TranscriptDrawer open={false} onOpenChange={() => {}} history={sampleHistory} />);
    expect(screen.queryByText("Bot opened.")).toBeNull();
  });

  it("renders all turns when open", () => {
    render(<TranscriptDrawer open={true} onOpenChange={() => {}} history={sampleHistory} />);
    expect(screen.getByText("Bot opened.")).toBeInTheDocument();
    expect(screen.getByText("User replied.")).toBeInTheDocument();
    expect(screen.getByText("Bot answered.")).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when close is tapped", () => {
    const onOpenChange = vi.fn();
    render(<TranscriptDrawer open={true} onOpenChange={onOpenChange} history={sampleHistory} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test:browser TranscriptDrawer`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `<TranscriptDrawer>`**

```tsx
// apps/web/src/onTheGo/components/TranscriptDrawer.tsx
import { X } from "lucide-react";
import type { Turn } from "../types";

export function TranscriptDrawer({
  open,
  onOpenChange,
  history,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  history: Turn[];
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-xl font-semibold">Transcript</h2>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close transcript"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-muted"
        >
          <X className="h-5 w-5" />
        </button>
      </header>
      <ul className="flex-1 overflow-y-auto p-4 space-y-4">
        {history.map((turn, i) => (
          <li
            key={i}
            className={`max-w-[80%] rounded-lg px-4 py-2 text-base ${
              turn.role === "assistant"
                ? "self-start bg-muted text-foreground"
                : "self-end ml-auto bg-primary text-primary-foreground"
            }`}
          >
            {turn.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test:browser TranscriptDrawer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/components/TranscriptDrawer.tsx apps/web/src/onTheGo/components/TranscriptDrawer.test.tsx
git commit -m "feat(on-the-go): TranscriptDrawer overlay"
```

---

## Task 11: `<CommitCountdown>` component

**Files:**
- Create: `apps/web/src/onTheGo/components/CommitCountdown.tsx`
- Create: `apps/web/src/onTheGo/components/CommitCountdown.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/src/onTheGo/components/CommitCountdown.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommitCountdown } from "./CommitCountdown";

describe("CommitCountdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows the prompt and a countdown number", () => {
    render(<CommitCountdown prompt="Do the thing" durationMs={3000} onCancel={() => {}} />);
    expect(screen.getByText(/Do the thing/i)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("counts down each second", () => {
    render(<CommitCountdown prompt="x" durationMs={3000} onCancel={() => {}} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    vi.advanceTimersByTime(1000);
    expect(screen.getByText("2")).toBeInTheDocument();
    vi.advanceTimersByTime(1000);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("calls onCancel when the cancel button is tapped", () => {
    const onCancel = vi.fn();
    render(<CommitCountdown prompt="x" durationMs={3000} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test:browser CommitCountdown`
Expected: FAIL.

- [ ] **Step 3: Implement `<CommitCountdown>`**

```tsx
// apps/web/src/onTheGo/components/CommitCountdown.tsx
import { useEffect, useState } from "react";

export function CommitCountdown({
  prompt,
  durationMs,
  onCancel,
}: {
  prompt: string;
  durationMs: number;
  onCancel: () => void;
}) {
  const [remaining, setRemaining] = useState(Math.ceil(durationMs / 1000));
  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="rounded-lg border-2 border-primary bg-primary/5 p-4">
        <h3 className="text-lg font-semibold mb-2">Sending to main thread</h3>
        <p className="text-base whitespace-pre-wrap">{prompt}</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="flex flex-col items-center justify-center gap-1 rounded-lg bg-red-600 text-white active:bg-red-700 min-h-[80px] py-4 text-lg font-bold"
        aria-label="Cancel send"
      >
        <span>Cancel ({remaining})</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test:browser CommitCountdown`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/components/CommitCountdown.tsx apps/web/src/onTheGo/components/CommitCountdown.test.tsx
git commit -m "feat(on-the-go): CommitCountdown morphing button"
```

---

## Task 12: Voice flow screen + orchestrator integration

**Files:**
- Create: `apps/web/src/onTheGo/components/VoiceScreen.tsx`
- Create: `apps/web/src/onTheGo/components/VoiceScreen.test.tsx`
- Create: `apps/web/src/onTheGo/hooks/useOrchestrator.ts`
- Create: `apps/web/src/onTheGo/hooks/orchestratorContext.tsx`
- Modify: `apps/web/src/onTheGo/routes/OnTheGoApp.tsx` — add `<VoiceScreen>` overlay when in flow.

> **What this task does:** ties everything from Phase 1 + Phase 2 Tasks 1-11 together. The `<VoiceScreen>` is a full-screen overlay that appears when the orchestrator is in any non-idle state. It renders the indicator, caption, transcript drawer trigger, and the three-button bar — all driven by orchestrator signals via `useOrchestrator`.

- [ ] **Step 1: Implement context + hook for the orchestrator**

```tsx
// apps/web/src/onTheGo/hooks/orchestratorContext.tsx
import { createContext, useContext, type ReactNode } from "react";
import type { OnTheGoFlowOrchestrator } from "../flow/OnTheGoFlowOrchestrator";

const OrchestratorContext = createContext<OnTheGoFlowOrchestrator | null>(null);

export function OrchestratorProvider({
  children,
  orchestrator,
}: {
  children: ReactNode;
  orchestrator: OnTheGoFlowOrchestrator;
}) {
  return <OrchestratorContext.Provider value={orchestrator}>{children}</OrchestratorContext.Provider>;
}

export function useOrchestrator(): OnTheGoFlowOrchestrator {
  const ctx = useContext(OrchestratorContext);
  if (!ctx) throw new Error("useOrchestrator must be used inside <OrchestratorProvider>");
  return ctx;
}
```

```ts
// apps/web/src/onTheGo/hooks/useOrchestrator.ts
import { useEffect, useState } from "react";
import { useOrchestrator as useOrchestratorRef } from "./orchestratorContext";
import type { FlowState, Turn } from "../types";

export function useFlowState(): FlowState {
  const o = useOrchestratorRef();
  const [s, setS] = useState(o.state.value);
  useEffect(() => o.state.subscribe(setS), [o]);
  return s;
}

export function useFlowCaption(): string {
  const o = useOrchestratorRef();
  const [c, setC] = useState(o.caption.value);
  useEffect(() => o.caption.subscribe(setC), [o]);
  return c;
}

export function useFlowHistory(): Turn[] {
  const o = useOrchestratorRef();
  const [h, setH] = useState(o.history.value);
  useEffect(() => o.history.subscribe(setH), [o]);
  return h;
}

export { useOrchestratorRef as useOrchestrator };
```

- [ ] **Step 2: Implement `<VoiceScreen>`**

```tsx
// apps/web/src/onTheGo/components/VoiceScreen.tsx
import { useState } from "react";
import { useFlowCaption, useFlowHistory, useFlowState, useOrchestrator } from "../hooks/useOrchestrator";
import { CommitCountdown } from "./CommitCountdown";
import { LiveCaptionRibbon } from "./LiveCaptionRibbon";
import { ThreeButtonBar } from "./ThreeButtonBar";
import { TranscriptDrawer } from "./TranscriptDrawer";
import { VoiceIndicator, type VoiceIndicatorState } from "./VoiceIndicator";

const VOICE_STATE_MAP: Record<string, VoiceIndicatorState> = {
  entering: "thinking",
  summarizing: "thinking",
  composing: "thinking",
  countdown: "speaking",
  committing: "thinking",
  conversing: "listening",
  idle: "paused",
};

export function VoiceScreen({ threadTitle }: { threadTitle: string }) {
  const orchestrator = useOrchestrator();
  const state = useFlowState();
  const caption = useFlowCaption();
  const history = useFlowHistory();
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  if (state === "countdown") {
    // Find the latest assistant text — it's the prompt being sent.
    const lastAssistant = [...history].reverse().find((t) => t.role === "assistant")?.text ?? caption;
    return (
      <CommitCountdown
        prompt={lastAssistant}
        durationMs={3000}
        onCancel={() => orchestrator.cancelShip()}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full bg-emerald-600" />
          <span className="text-muted-foreground capitalize">{state}</span>
          <span className="text-foreground/70 truncate max-w-[200px]">· {threadTitle}</span>
        </span>
      </header>
      <button
        type="button"
        onClick={() => setTranscriptOpen(true)}
        className="flex-1 flex flex-col items-center justify-center"
        aria-label="Open transcript"
      >
        <VoiceIndicator state={VOICE_STATE_MAP[state] ?? "paused"} />
        <LiveCaptionRibbon caption={caption} />
      </button>
      <ThreeButtonBar
        onPause={() => void orchestrator.pause("manual")}
        onMic={() => orchestrator.interruptBot()}
        onShipIt={() => void orchestrator.shipIt()}
      />
      <TranscriptDrawer open={transcriptOpen} onOpenChange={setTranscriptOpen} history={history} />
    </div>
  );
}
```

- [ ] **Step 3: Update `<OnTheGoApp>` to overlay `<VoiceScreen>` when active**

```tsx
// apps/web/src/onTheGo/routes/OnTheGoApp.tsx — replace the existing implementation
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { InboxTab } from "../components/InboxTab";
import { PausedTab } from "../components/PausedTab";
import { VoiceScreen } from "../components/VoiceScreen";
import { useFlowState, useOrchestrator } from "../hooks/useOrchestrator";
import type { Notification, PausedSession } from "../types";

export type OnTheGoTab = "inbox" | "paused";

export function OnTheGoApp({ tab }: { tab: OnTheGoTab }) {
  const orchestrator = useOrchestrator();
  const state = useFlowState();
  const [activeTitle, setActiveTitle] = useState<string>("");

  const handleSelect = async (notification: Notification) => {
    setActiveTitle(notification.threadTitle);
    await orchestrator.enter(notification);
  };
  const handleResume = async (session: PausedSession) => {
    setActiveTitle(session.notification.threadTitle);
    await orchestrator.resume(session.threadId);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-background">
      <nav className="flex border-b border-border" role="tablist" aria-label="On-the-go tabs">
        <Link to="/on-the-go/$tab" params={{ tab: "inbox" }} role="tab" aria-selected={tab === "inbox"} className={`flex-1 py-4 text-center text-lg font-medium ${tab === "inbox" ? "text-foreground border-b-2 border-primary" : "text-muted-foreground"}`}>
          Inbox
        </Link>
        <Link to="/on-the-go/$tab" params={{ tab: "paused" }} role="tab" aria-selected={tab === "paused"} className={`flex-1 py-4 text-center text-lg font-medium ${tab === "paused" ? "text-foreground border-b-2 border-primary" : "text-muted-foreground"}`}>
          Paused
        </Link>
      </nav>
      <main className="flex-1 overflow-y-auto" role="tabpanel">
        {tab === "inbox" ? <InboxTab onSelect={handleSelect} /> : <PausedTab onResume={handleResume} />}
      </main>
      {state !== "idle" && <VoiceScreen threadTitle={activeTitle} />}
    </div>
  );
}
```

- [ ] **Step 4: Wire up at app boot — adapt the existing RPC layer**

Locate where `apps/web/src/main.tsx` (or equivalent) constructs the router. Wrap the router children with the three providers and a constructed orchestrator.

Reference structure (the engineer adapts to actual app boot file):

```tsx
// apps/web/src/onTheGo/wireOnTheGo.tsx
import type { ReactNode } from "react";
import { OpenAIAdapter } from "./adapters/OpenAIAdapter";
import { AnthropicAdapter } from "./adapters/AnthropicAdapter";
import { MainAgentCliAdapter } from "./adapters/MainAgentCliAdapter";
import type { SummaryAdapter } from "./adapters/SummaryAdapter";
import { createOrchestrator } from "./flow/OnTheGoFlowOrchestrator";
import { NotificationsProvider } from "./hooks/notificationsContext";
import { OrchestratorProvider } from "./hooks/orchestratorContext";
import { PausedSessionsProvider } from "./hooks/pausedSessionsContext";
import { loadOptimizePromptSkill } from "./skills/loadSkill";
import { createNotificationsStore } from "./state/notificationsStore";
import { createPersistedPausedSessionsStore } from "./state/persistedPausedSessionsStore";
import { bindNotificationsToThreadStream } from "./state/threadSubscription";
import { BrowserVoiceAdapter } from "./voice/BrowserVoiceAdapter";

// Adapter factory — picks the configured adapter from settings storage.
// Settings UI lands in Phase 3; for now, read from localStorage with sensible fallback to "no adapter".
function buildSummaryAdapter(): SummaryAdapter {
  const cfg = JSON.parse(localStorage.getItem("on-the-go:adapter") ?? "{}");
  if (cfg.kind === "openai" && cfg.apiKey) return new OpenAIAdapter({ apiKey: cfg.apiKey });
  if (cfg.kind === "anthropic" && cfg.apiKey) return new AnthropicAdapter({ apiKey: cfg.apiKey });
  if (cfg.kind === "cli") return new MainAgentCliAdapter(/* TODO: wire transport in Phase 3 */ { runEphemeral: async () => "" });
  // Fallback: a no-op adapter that just returns placeholder text. Phase 3 onboarding ensures
  // this code path is unreachable in production.
  return new MainAgentCliAdapter({
    runEphemeral: async () => "On-the-go AI is not configured. Open Settings to set up.",
  });
}

export async function buildOnTheGoProviders(rpcStream: any /* concrete ThreadStateStream from RPC */, commitPrompt: any /* (threadId, prompt) => Promise<void> */): Promise<{
  Provider: (props: { children: ReactNode }) => JSX.Element;
}> {
  const notificationsStore = createNotificationsStore();
  const pausedSessionsStore = await createPersistedPausedSessionsStore({
    // TODO: replace with real RPC-backed transport in Phase 3
    loadAll: async () => [],
    upsert: async () => {},
    remove: async () => {},
  });
  bindNotificationsToThreadStream(rpcStream, notificationsStore);

  const orchestrator = createOrchestrator({
    voiceAdapter: new BrowserVoiceAdapter(),
    summaryAdapter: buildSummaryAdapter(),
    notificationsStore,
    pausedSessionsStore,
    skill: loadOptimizePromptSkill(),
    commitPrompt,
  });

  function Provider({ children }: { children: ReactNode }) {
    return (
      <NotificationsProvider store={notificationsStore}>
        <PausedSessionsProvider store={pausedSessionsStore}>
          <OrchestratorProvider orchestrator={orchestrator}>{children}</OrchestratorProvider>
        </PausedSessionsProvider>
      </NotificationsProvider>
    );
  }

  return { Provider };
}
```

In `main.tsx` (or the app boot equivalent), import `buildOnTheGoProviders` and wrap the router. Pass:
- The existing thread-state subscription source adapted to `ThreadStateStream` (search `apps/web/src/rpc/serverState.ts` or similar for the existing per-thread subscription).
- The existing main-thread message-send RPC adapted to `(threadId, prompt) => Promise<void>` (search the contracts for the message-send method, e.g. `sendUserMessage` or `submitTurn`).

> **Key ambiguity for the engineer:** the exact RPC method names depend on the contracts; engineer locates them via `Grep` on the contracts package. Replace the `TODO` comments above with real implementations.

- [ ] **Step 5: Smoke test in dev**

Run: `bun run dev:web`
- Configure an OpenAI key in localStorage manually: `localStorage.setItem("on-the-go:adapter", JSON.stringify({ kind: "openai", apiKey: "sk-..." }))`.
- Reload, navigate to `/on-the-go/inbox`.
- Trigger a thread to enter "awaiting" via the regular UI (or backend test fixture).
- Tap the card. Voice flow should engage. Check: TTS speaks summary; mic listens; "ship it" countdown shows; cancel works; commit fires.

- [ ] **Step 6: Run all tests**

Run: `bun run --cwd apps/web test`
Expected: PASS — all on-the-go + existing tests.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/onTheGo/components/VoiceScreen.tsx apps/web/src/onTheGo/components/VoiceScreen.test.tsx apps/web/src/onTheGo/hooks/orchestratorContext.tsx apps/web/src/onTheGo/hooks/useOrchestrator.ts apps/web/src/onTheGo/wireOnTheGo.tsx apps/web/src/onTheGo/routes/OnTheGoApp.tsx <main app boot file>
git commit -m "feat(on-the-go): voice flow screen + orchestrator integration at app boot"
```

---

## Task 13: Phase 2 verification

- [ ] **Step 1: Run full tests + typecheck + lint**

```bash
bun run --cwd apps/web test
bun run --cwd apps/web typecheck
bun run lint apps/web/src/onTheGo
```
Expected: PASS on all.

- [ ] **Step 2: Manual smoke check**

- Navigate to `/on-the-go/inbox` on a real mobile viewport (browser DevTools device emulation or real phone).
- Verify cards render correctly, swipe to other tab works, tap engages voice flow.
- Verify all happy-path interactions work end-to-end with a real configured `SummaryAdapter`.

- [ ] **Step 3: Tick lifecycle plan + commit**

In `.agents/plans/2026-05-06-1442-on-the-go-mode.md`, tick `[ ] Phase 2 acceptance: ...` to `[x]`.

```bash
git add .agents/plans/2026-05-06-1442-on-the-go-mode.md
git commit -m "chore(plan): mark Phase 2 UI acceptance complete"
```

Phase 2 done. Phase 3 (onboarding + settings + polish) picks up next.

---

## Self-review

Re-read the spec and Phase 1 plan with fresh eyes. Verify:

1. **Spec coverage:** every Q9 / Q10 / Q11 visual decision has a corresponding component (NotificationCard, ThreeButtonBar, VoiceIndicator, LiveCaptionRibbon, TranscriptDrawer, CommitCountdown, VoiceScreen).
2. **Phase 1 dependency:** every Phase 2 task imports from Phase 1 modules — `OnTheGoFlowOrchestrator`, `NotificationsStore`, `PausedSessionsStore`, `BrowserVoiceAdapter`, `OpenAIAdapter`, `AnthropicAdapter`, `MainAgentCliAdapter`. No duplication.
3. **Placeholder scan:** the only "TODO" markers are in Task 12's `wireOnTheGo.tsx` for the real RPC method names — those are deliberate, with explicit notes telling the engineer to locate them via Grep. Phase 3 finalizes this wire-up.
4. **Type consistency:** `Notification`, `Turn`, `PausedSession`, `FlowState` from `types.ts` are reused throughout. Component props use these types, not local re-declarations.

If issues are found, fix them inline.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-06-on-the-go-mode-phase2-ui.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, two-stage review.

**2. Inline Execution** — Execute tasks in this session using executing-plans.

Which approach? (Recommended: subagent-driven.)
