/**
 * Sanitize user-provided custom CSS to prevent data exfiltration and code execution.
 *
 * Strips:
 * - @import rules (can load external stylesheets)
 * - @charset rules (encoding attacks)
 * - @font-face rules (external font exfiltration via unicode-range)
 * - @keyframes rules (content property abuse)
 * - url() values (can phone home / exfiltrate via background-image, list-style, etc.)
 * - expression() / -moz-binding (legacy JS execution in CSS)
 * - javascript: URIs
 * - behavior: property (IE HTC execution)
 * - -moz-binding property (XBL execution)
 */
export function sanitizeCss(raw: string): string {
  let css = raw;

  // Remove @import rules (with or without url(), handles multiline)
  css = css.replace(/@import\s+[^;]*;/gi, "/* @import removed */");

  // Remove @charset rules
  css = css.replace(/@charset\s+[^;]*;/gi, "/* @charset removed */");

  // Remove @font-face rules (external font exfiltration via unicode-range)
  css = css.replace(/@font-face\s*\{[^}]*\}/gi, "/* @font-face removed */");

  // Remove @keyframes rules (content property abuse)
  css = css.replace(/@keyframes\s+[^{]*\{[^}]*(?:\{[^}]*\}[^}]*)*\}/gi, "/* @keyframes removed */");

  // Remove url() values — replace with empty string to preserve the property
  // Handles: url("..."), url('...'), url(...), including edge cases
  css = css.replace(/url\s*\([^)]*\)/gi, "none");

  // Remove expression() (IE CSS expressions)
  css = css.replace(/expression\s*\([^)]*\)/gi, "none");

  // Remove -moz-binding (XBL binding, Firefox)
  css = css.replace(/-moz-binding\s*:\s*[^;}"']*/gi, "/* -moz-binding removed */");

  // Remove behavior: (IE HTC)
  css = css.replace(/behavior\s*:\s*[^;}"']*/gi, "/* behavior removed */");

  // Remove javascript: URIs that might sneak through
  css = css.replace(/javascript\s*:/gi, "/* blocked */");

  return css;
}
