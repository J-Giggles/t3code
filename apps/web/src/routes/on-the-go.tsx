import { createFileRoute, redirect } from "@tanstack/react-router";
import { SmartphoneIcon } from "lucide-react";
import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";

function OnTheGoRoute() {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        <header className="border-b border-border px-3 py-2 sm:px-5">
          <div className="flex min-h-7 items-center gap-2 sm:min-h-6">
            <SidebarTrigger className="size-7 shrink-0 md:hidden" />
            <SmartphoneIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium text-foreground">On-the-Go</span>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex size-11 items-center justify-center rounded-full border border-border bg-muted/40">
            <SmartphoneIcon className="size-5 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="max-w-sm space-y-1">
            <h1 className="text-base font-medium text-foreground">On-the-Go mode</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              The voice and adapter foundation is installed. Inbox, paused sessions, and the full
              hands-free flow are still pending the UI phase.
            </p>
          </div>
        </main>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/on-the-go")({
  beforeLoad: async ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: OnTheGoRoute,
});
