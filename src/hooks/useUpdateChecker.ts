import { useEffect } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { isTauri } from "../lib/tauriEnv.js";
import { useUiStore } from "../store/ui.js";

const CHECK_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours

/** Module-level ref for the pending Update object (non-serializable, not stored in Zustand). */
let pendingUpdate: Update | null = null;

/**
 * Checks for updates on launch and every 4 hours.
 * Must be called unconditionally inside a component (hooks rules); guards internally with isTauri().
 */
export function useUpdateChecker(): void {
  useEffect(() => {
    if (!isTauri()) return;

    async function checkForUpdate() {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (update) {
          pendingUpdate = update;
          useUiStore.getState().setUpdateAvailable(update.version);
        }
      } catch (e) {
        console.error("Update check failed:", e);
      }
    }

    checkForUpdate();
    const id = setInterval(checkForUpdate, CHECK_INTERVAL);
    return () => clearInterval(id);
  }, []);
}

/** Download and install the pending update. */
export async function startUpdateDownload(): Promise<void> {
  if (!pendingUpdate) return;
  useUiStore.getState().setUpdateDownloading();
  await pendingUpdate.downloadAndInstall();
  // On Windows NSIS the process may be killed before this line executes, which is fine.
  useUiStore.getState().setUpdateReady();
}

/** Relaunch the app after an update has been installed. */
export async function restartForUpdate(): Promise<void> {
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
