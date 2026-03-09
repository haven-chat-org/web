/**
 * Deep link handler for haven:// URLs.
 *
 * Parses and validates incoming deep link URLs against an allowlist,
 * then navigates to the matching route using react-router. Supports
 * both cold-start (app launched by URL) and warm-start (app already running).
 *
 * No-op on web (non-Tauri) builds. All @tauri-apps imports are dynamic
 * to avoid bundling in the web frontend.
 */
import { isTauri } from "./tauriEnv";

/** Allowlist of route patterns accepted from deep links. */
const ALLOWED_ROUTES: RegExp[] = [
  /^\/invite\/[A-Za-z0-9]+$/,
];

let initialized = false;

/**
 * Parse a haven:// URL and validate it against the allowlist.
 * Returns the path (e.g. "/invite/ABC123") if valid, null otherwise.
 *
 * Note: `new URL("haven://invite/CODE")` parses as host="invite", pathname="/CODE",
 * so we reconstruct the path as `/${host}${pathname}`.
 */
export function parseDeepLinkUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "haven:") return null;

    const path = `/${parsed.host}${parsed.pathname}`.replace(/\/+$/, "");

    for (const pattern of ALLOWED_ROUTES) {
      if (pattern.test(path)) return path;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Initialize deep link handling. Call once during app mount.
 *
 * - Cold start: checks getCurrent() for a URL that launched the app
 * - Warm start: registers onOpenUrl listener for URLs received while running
 *
 * @param navigate - react-router navigate function
 */
export async function initDeepLinks(
  navigate: (path: string, opts?: { replace?: boolean }) => void,
): Promise<void> {
  if (!isTauri() || initialized) return;
  initialized = true;

  const { onOpenUrl, getCurrent } = await import(
    "@tauri-apps/plugin-deep-link"
  );

  // Cold start: URL that launched the app
  try {
    const urls = await getCurrent();
    if (urls) {
      for (const url of urls) {
        const path = parseDeepLinkUrl(url);
        if (path) {
          navigate(path, { replace: true });
          break;
        }
      }
    }
  } catch {
    // getCurrent() may fail if no URL launched the app -- safe to ignore
  }

  // Warm start: URLs received while app is running
  await onOpenUrl((urls: string[]) => {
    for (const url of urls) {
      const path = parseDeepLinkUrl(url);
      if (path) {
        navigate(path);
        break;
      }
    }
  });
}
