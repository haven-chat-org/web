/**
 * Tray icon unread indicator and macOS dock badge bridge.
 *
 * Subscribes to the chat store's unreadCounts and:
 * 1. Emits "tray-unread-changed" Tauri event when hasUnread boolean changes (for Rust icon swap)
 * 2. Calls setBadgeCount() when total unread count changes (for macOS dock badge)
 *
 * No-op on web (non-Tauri) builds. All @tauri-apps imports are dynamic
 * to avoid bundling in the web frontend.
 */
import { isTauri } from "./tauriEnv";
import { useChatStore } from "../store/chat";

let prevHasUnread = false;
let prevTotalUnread = 0;

/**
 * Emit unread state to Rust for tray icon swap.
 * Dynamic import avoids bundling @tauri-apps/api in web builds.
 */
async function updateTrayUnread(hasUnread: boolean): Promise<void> {
  const { emit } = await import("@tauri-apps/api/event");
  await emit("tray-unread-changed", hasUnread);
}

/**
 * Set macOS dock badge count. Clears badge when count is 0.
 * No-op on Windows (setBadgeCount is unsupported, call is harmless).
 */
async function updateDockBadge(count: number): Promise<void> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setBadgeCount(count > 0 ? count : undefined);
}

/**
 * Subscribe to the chat store's unreadCounts and drive tray icon + dock badge.
 * Call once during app initialization. Only active in Tauri environment.
 */
export function initTraySubscription(): void {
  if (!isTauri()) return;

  useChatStore.subscribe((state) => {
    const counts = state.unreadCounts;
    const totalUnread = Object.values(counts).reduce((sum, c) => sum + c, 0);
    const hasUnread = totalUnread > 0;

    // Only emit tray icon swap when boolean state changes
    if (hasUnread !== prevHasUnread) {
      prevHasUnread = hasUnread;
      updateTrayUnread(hasUnread);
    }

    // Only update dock badge when count changes
    if (totalUnread !== prevTotalUnread) {
      prevTotalUnread = totalUnread;
      updateDockBadge(totalUnread);
    }
  });
}
