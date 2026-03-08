import type { DecryptedMessage, LinkPreview } from "./types.js";
import { useAuthStore } from "../auth.js";

// ─── Constants ────────────────────────────────────────────────

export const MAX_MESSAGES_PER_CHANNEL = 200;
export const TYPING_EXPIRY_MS = 3000;
export const TYPING_THROTTLE_MS = 500;

// Link preview constants
export const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
export const MAX_PREVIEWS = 3;
export const PREVIEW_TIMEOUT = 4000;

/** Match URLs pointing directly to an image file */
export const IMAGE_EXT_RE = /\.(?:gif|png|jpe?g|webp|avif|apng|svg)(?:\?[^\s]*)?$/i;

/** Known GIF/image hosting services — treat their pages as direct image embeds */
export const GIF_HOST_RE = /(?:tenor\.com(?:\/view)?|giphy\.com\/gifs|i\.imgur\.com)\//i;

/** Hosts that serve HTML pages (not raw images) even when the URL ends in .gif */
export const GIF_PAGE_HOSTS = /^(?:tenor\.com|giphy\.com)$/i;

// Thumbnail constants
export const THUMB_MAX_SIZE = 200;
export const THUMB_QUALITY = 0.6;

// ─── Pure Helper Functions ────────────────────────────────────

/**
 * Append a message to a channel's message array, deduplicating by ID
 * and trimming to MAX_MESSAGES_PER_CHANNEL.
 *
 * This is a pure function that returns a partial state update.
 */
export function appendMessage(
  state: { messages: Record<string, DecryptedMessage[]> },
  channelId: string,
  msg: DecryptedMessage,
) {
  const channelMsgs = state.messages[channelId] ?? [];
  if (channelMsgs.some((m) => m.id === msg.id)) return state;
  let updated = [...channelMsgs, msg];
  if (updated.length > MAX_MESSAGES_PER_CHANNEL) {
    updated = updated.slice(updated.length - MAX_MESSAGES_PER_CHANNEL);
  }
  return { messages: { ...state.messages, [channelId]: updated } };
}

/** Check if a tiptap formatting object mentions a specific user (by ID, @everyone, or @role). */
export function formattingMentionsUser(formatting: unknown, userId: string, userRoleIds?: string[]): boolean {
  if (!formatting || typeof formatting !== "object") return false;
  const node = formatting as Record<string, unknown>;
  if (node.type === "mention") {
    const attrs = node.attrs as Record<string, unknown> | undefined;
    if (!attrs) return false;
    // @everyone mentions all users
    if (attrs.id === "everyone") return true;
    // @role mentions users who have that role
    if (attrs.mentionType === "role" && userRoleIds && typeof attrs.id === "string") {
      if (userRoleIds.includes(attrs.id)) return true;
    }
    // Direct @user mention
    if (attrs.id === userId) return true;
  }
  const content = node.content;
  if (Array.isArray(content)) {
    return content.some((child) => formattingMentionsUser(child, userId, userRoleIds));
  }
  return false;
}

export function isDirectImageUrl(url: string): boolean {
  try {
    const { pathname, hostname } = new URL(url);
    // Tenor/Giphy pages can end in .gif but return HTML, not image data
    if (GIF_PAGE_HOSTS.test(hostname)) return false;
    return IMAGE_EXT_RE.test(pathname);
  } catch {
    return IMAGE_EXT_RE.test(url);
  }
}

export function isMediaFile(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType.startsWith("video/");
}

export async function fetchLinkPreviews(text: string): Promise<LinkPreview[]> {
  const urls = text.match(URL_RE);
  if (!urls || urls.length === 0) return [];

  const { api } = useAuthStore.getState();
  const unique = [...new Set(urls)].slice(0, MAX_PREVIEWS);

  // Separate direct image URLs from regular URLs
  const imageUrls: string[] = [];
  const regularUrls: string[] = [];
  for (const url of unique) {
    if (isDirectImageUrl(url)) {
      imageUrls.push(url);
    } else {
      regularUrls.push(url);
    }
  }

  // Create inline image embeds (no backend fetch needed)
  const previews: LinkPreview[] = imageUrls.map((url) => ({
    url,
    image: url,
  }));

  // Fetch OG metadata for non-image URLs from backend
  if (regularUrls.length > 0) {
    const results = await Promise.allSettled(
      regularUrls.map((url) =>
        Promise.race([
          api.fetchLinkPreview(url),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), PREVIEW_TIMEOUT),
          ),
        ]),
      ),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value && (r.value.title || r.value.description || r.value.image)) {
        previews.push(r.value);
      }
    }
  }

  return previews;
}

export function generateThumbnail(
  file: File,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      const scale = Math.min(THUMB_MAX_SIZE / img.width, THUMB_MAX_SIZE / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", THUMB_QUALITY);
      URL.revokeObjectURL(objectUrl);
      resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };

    img.src = objectUrl;
  });
}
