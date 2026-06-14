/**
 * Sync noVNC clipboard with the host browser for pod desktop sessions.
 * - Copy in container (Ctrl+C) -> host clipboard
 * - Paste from host (Ctrl+V) -> container via RFB clipboard
 */
import UI from "./ui.js";

function installClipboardBridge() {
  if (!UI.rfb || UI.rfb._podClipboardBridgeInstalled) {
    requestAnimationFrame(installClipboardBridge);
    return;
  }

  UI.rfb._podClipboardBridgeInstalled = true;

  UI.rfb.addEventListener("clipboard", async (event) => {
    const text = event.detail?.text ?? "";
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.warn("[pod-novnc] could not write host clipboard:", error);
    }
  });

  document.addEventListener(
    "keydown",
    async (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "v") {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }

      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          UI.rfb.clipboardPasteFrom(text);
          event.preventDefault();
        }
      } catch (error) {
        console.warn("[pod-novnc] could not read host clipboard:", error);
      }
    },
    true,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installClipboardBridge);
} else {
  installClipboardBridge();
}
