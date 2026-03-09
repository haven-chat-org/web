import { isTauri } from "./tauriEnv.js";

/**
 * Forward console.warn and console.error to tauri-plugin-log so JS warnings
 * and errors appear in the unified log file alongside Rust logs.
 *
 * Only active in Tauri builds; no-op on the web.
 */
export async function initLogging(): Promise<void> {
  if (!isTauri()) return;

  const { warn, error } = await import("@tauri-apps/plugin-log");

  const origWarn = console.warn;
  const origError = console.error;

  console.warn = (...args: unknown[]) => {
    origWarn.apply(console, args);
    warn(args.map(String).join(" "));
  };

  console.error = (...args: unknown[]) => {
    origError.apply(console, args);
    error(args.map(String).join(" "));
  };
}
