import type { MessageResponse } from "@haven-chat-org/core";
import type { AttachmentMeta, DecryptedMessage } from "../store/chat.js";
import { useAuthStore } from "../store/auth.js";
import { decryptIncoming } from "./crypto.js";
import { getCachedMessage } from "./message-cache.js";

export type AttachmentFilter = "all" | "images" | "videos" | "audio" | "files";

export interface ScanProgress {
  phase: "scanning" | "complete" | "failed";
  messagesScanned: number;
  attachmentsFound: number;
  error?: string;
}

export interface ScannedAttachment {
  attachment: AttachmentMeta;
  messageId: string;
  senderId: string;
  timestamp: string;
}

/** Match attachment mime_type to a filter category. */
export function matchesFilter(mime: string, filter: AttachmentFilter): boolean {
  switch (filter) {
    case "all": return true;
    case "images": return mime.startsWith("image/");
    case "videos": return mime.startsWith("video/");
    case "audio": return mime.startsWith("audio/");
    case "files": return !mime.startsWith("image/") && !mime.startsWith("video/") && !mime.startsWith("audio/");
  }
}

/** Format a byte count as a human-readable size string. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Paginate through ALL messages in a channel, decrypt each one,
 * and extract attachments. Returns the full list of ScannedAttachment items.
 */
export async function scanChannelAttachments(
  channelId: string,
  onProgress: (progress: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<ScannedAttachment[]> {
  const { api } = useAuthStore.getState();
  const PAGE_SIZE = 100;
  const allAttachments: ScannedAttachment[] = [];
  let totalMessages = 0;
  let beforeCursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const rawMessages: MessageResponse[] = await api.getMessages(channelId, {
      before: beforeCursor,
      limit: PAGE_SIZE,
    });

    if (rawMessages.length === 0) {
      hasMore = false;
      break;
    }

    // Update cursor (messages come newest-first)
    beforeCursor = rawMessages[rawMessages.length - 1].timestamp;
    if (rawMessages.length < PAGE_SIZE) hasMore = false;

    // Process oldest-first for correct E2EE session ordering
    const chronological = [...rawMessages].reverse();
    for (const raw of chronological) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      totalMessages++;

      if (raw.message_type === "system") continue;
      if (!raw.has_attachments) continue;

      let msg: DecryptedMessage | null = null;
      try {
        msg = await decryptIncoming(raw);
      } catch {
        msg = getCachedMessage(raw.id, raw.channel_id, raw.timestamp, !!raw.edited, raw);
      }

      if (msg?.attachments) {
        for (const att of msg.attachments) {
          allAttachments.push({
            attachment: att,
            messageId: msg.id,
            senderId: msg.senderId,
            timestamp: msg.timestamp,
          });
        }
      }
    }

    onProgress({
      phase: "scanning",
      messagesScanned: totalMessages,
      attachmentsFound: allAttachments.length,
    });
  }

  onProgress({
    phase: "complete",
    messagesScanned: totalMessages,
    attachmentsFound: allAttachments.length,
  });

  return allAttachments;
}
