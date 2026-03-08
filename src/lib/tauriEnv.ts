/**
 * Detect whether the app is running inside a Tauri desktop shell.
 * Tauri v2 injects `__TAURI_INTERNALS__` onto the window object.
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let cachedPlatform: string | null = null;

/**
 * Return the OS platform the app is running on.
 * Uses @tauri-apps/plugin-os when inside Tauri, otherwise returns "web".
 * The result is cached after the first call.
 */
export async function getPlatform(): Promise<string> {
  if (cachedPlatform) return cachedPlatform;
  if (!isTauri()) return "web";
  const { platform } = await import("@tauri-apps/plugin-os");
  cachedPlatform = platform();
  return cachedPlatform;
}
