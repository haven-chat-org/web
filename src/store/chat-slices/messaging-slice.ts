import type { StateCreator } from "zustand";
import type { MessageResponse } from "@haven-chat-org/core";
import { useAuthStore } from "../auth.js";
import { encryptOutgoing } from "../../lib/crypto.js";
import { cacheMessage, uncacheMessage } from "../../lib/message-cache.js";
import { unicodeAtob } from "../../lib/base64.js";
import type { ChatState, MessagingSlice, DecryptedMessage, AttachmentMeta, ForwardedContent } from "./types.js";
import { appendMessage, fetchLinkPreviews } from "./helpers.js";

// ─── Optimistic Send State ──────────────────────────────
// Queue of temporary IDs awaiting a MessageAck from the server
export const pendingAcks: string[] = [];
// Real message IDs we've sent — used to skip our own NewMessage broadcast
export const ownMessageIds = new Set<string>();
// Message IDs we've edited — skip re-decryption on our own MessageEdited broadcast
export const ownEditIds = new Set<string>();

export const createMessagingSlice: StateCreator<ChatState, [], [], MessagingSlice> = (set, get) => ({
  messages: {},
  editingMessageId: null,
  replyingToId: null,
  forwardingMessage: null,
  reactions: {},
  pinnedMessageIds: {},

  async sendMessage(text, attachments, formatting, expiresAt) {
    const { currentChannelId, ws, replyingToId } = get();
    if (!currentChannelId || !ws) return;

    // Reconnect if WS dropped
    if (!ws.isConnected) {
      console.warn("[WS] Not connected, attempting reconnect...");
      ws.connect();
      // Wait briefly for connection
      await new Promise((r) => setTimeout(r, 1000));
      if (!ws.isConnected) {
        console.error("[WS] Reconnect failed — cannot send message");
        return;
      }
    }

    const { user } = useAuthStore.getState();
    if (!user) return;

    try {
      // Check if the channel has encryption enabled
      const channel = get().channels.find((c) => c.id === currentChannelId);
      const channelEncrypted = channel?.encrypted ?? true;

      // Detect URLs and fetch link previews (non-blocking, with timeout)
      const linkPreviews = await fetchLinkPreviews(text);

      const { senderToken, encryptedBody } = await encryptOutgoing(
        user.id,
        currentChannelId,
        text,
        attachments,
        formatting,
        linkPreviews.length > 0 ? linkPreviews : undefined,
        channelEncrypted,
      );

      // Compute effective expiresAt: explicit override > channel default > none
      const effectiveExpiresAt = expiresAt
        ?? (channel?.message_ttl
          ? new Date(Date.now() + channel.message_ttl * 1000).toISOString()
          : undefined);

      // Optimistic insert: show our own message immediately (plaintext)
      const tempId = `temp-${crypto.randomUUID()}`;
      pendingAcks.push(tempId);

      const optimistic: DecryptedMessage = {
        id: tempId,
        channelId: currentChannelId,
        senderId: user.id,
        text,
        attachments,
        linkPreviews: linkPreviews.length > 0 ? linkPreviews : undefined,
        contentType: formatting?.contentType,
        formatting: formatting?.data,
        timestamp: new Date().toISOString(),
        replyToId: replyingToId,
        expiresAt: effectiveExpiresAt ?? null,
        raw: {} as MessageResponse, // placeholder — replaced on ack
      };
      set((state) => appendMessage(state, currentChannelId, optimistic));

      const attachmentIds = attachments?.map((a) => a.id);
      ws.sendMessage(currentChannelId, senderToken, encryptedBody, effectiveExpiresAt, attachmentIds, replyingToId ?? undefined);

      // Clear reply state after send
      set({ replyingToId: null });
    } catch (err) {
      console.error("[sendMessage] Failed to send:", err);
    }
  },

  startEditing(messageId: string) {
    set({ editingMessageId: messageId });
  },

  cancelEditing() {
    set({ editingMessageId: null });
  },

  startReply(messageId: string) {
    set({ replyingToId: messageId, editingMessageId: null });
  },

  cancelReply() {
    set({ replyingToId: null });
  },

  startForward(messageId: string) {
    const { currentChannelId, messages } = get();
    if (!currentChannelId) return;
    const channelMsgs = messages[currentChannelId] ?? [];
    const msg = channelMsgs.find((m) => m.id === messageId);
    if (msg) set({ forwardingMessage: msg });
  },

  cancelForward() {
    set({ forwardingMessage: null });
  },

  async forwardMessage(targetChannelId: string) {
    const { ws, forwardingMessage } = get();
    if (!ws || !forwardingMessage) return;

    if (!ws.isConnected) {
      ws.connect();
      await new Promise((r) => setTimeout(r, 1000));
      if (!ws.isConnected) return;
    }

    const { user } = useAuthStore.getState();
    if (!user) return;

    // If forwarding an already-forwarded message, carry the original forward content
    const forwarded: ForwardedContent = forwardingMessage.forwarded
      ? forwardingMessage.forwarded
      : (() => {
          // Derive source channel display name
          const srcChannel = get().channels.find((c) => c.id === forwardingMessage.channelId);
          let channelName: string | undefined;
          if (srcChannel) {
            try {
              const meta = JSON.parse(unicodeAtob(srcChannel.encrypted_meta));
              if (meta.type === "dm" && meta.names) {
                const otherName = Object.entries(meta.names).find(([id]) => id !== user.id)?.[1] as string | undefined;
                channelName = otherName ?? "DM";
              } else if (meta.type === "group") {
                const names = Object.entries(meta.names as Record<string, string> ?? {})
                  .filter(([id]) => id !== user.id)
                  .map(([, n]) => n);
                channelName = names.length > 0 ? names.join(", ") : "Group";
              } else {
                channelName = meta.name || undefined;
              }
            } catch { /* non-fatal */ }
          }
          return {
            sender_name: forwardingMessage.senderId === user.id
              ? (user.username ?? "You")
              : (get().userNames[forwardingMessage.senderId] ?? forwardingMessage.senderId.slice(0, 8)),
            text: forwardingMessage.text,
            timestamp: forwardingMessage.timestamp,
            ...(channelName ? { channel_name: channelName } : {}),
            ...(forwardingMessage.contentType ? { content_type: forwardingMessage.contentType } : {}),
            ...(forwardingMessage.formatting ? { formatting: forwardingMessage.formatting } : {}),
          };
        })();

    try {
      const channel = get().channels.find((c) => c.id === targetChannelId);
      const channelEncrypted = channel?.encrypted ?? true;

      const { senderToken, encryptedBody } = await encryptOutgoing(
        user.id,
        targetChannelId,
        "",
        undefined,
        undefined,
        undefined,
        channelEncrypted,
        forwarded,
      );

      const tempId = `temp-${crypto.randomUUID()}`;
      pendingAcks.push(tempId);

      const optimistic: DecryptedMessage = {
        id: tempId,
        channelId: targetChannelId,
        senderId: user.id,
        text: "",
        forwarded,
        timestamp: new Date().toISOString(),
        raw: {} as MessageResponse,
      };
      set((state) => appendMessage(state, targetChannelId, optimistic));

      ws.sendMessage(targetChannelId, senderToken, encryptedBody);
      set({ forwardingMessage: null });
    } catch (err) {
      console.error("[forwardMessage] Failed to forward:", err);
      throw err;
    }
  },

  async loadPins(channelId: string) {
    const { api } = useAuthStore.getState();
    try {
      const ids = await api.getPinnedMessageIds(channelId);
      set((state) => ({
        pinnedMessageIds: { ...state.pinnedMessageIds, [channelId]: ids },
      }));
    } catch { /* non-fatal */ }
  },

  pinMessage(messageId: string) {
    const { ws, currentChannelId } = get();
    if (!ws || !currentChannelId) return;
    ws.pinMessage(currentChannelId, messageId);
  },

  unpinMessage(messageId: string) {
    const { ws, currentChannelId } = get();
    if (!ws || !currentChannelId) return;
    ws.unpinMessage(currentChannelId, messageId);
  },

  async submitEdit(messageId, text, formatting) {
    const { currentChannelId, ws } = get();
    if (!currentChannelId || !ws) return;

    const { user } = useAuthStore.getState();
    if (!user) return;

    const { encryptedBody } = await encryptOutgoing(
      user.id,
      currentChannelId,
      text,
      undefined,
      formatting,
    );

    ws.editMessage(messageId, encryptedBody);

    // Optimistic update: apply the edit locally for the sender immediately
    ownEditIds.add(messageId);
    set((state) => {
      const channelMsgs = state.messages[currentChannelId];
      if (!channelMsgs) return { editingMessageId: null };
      return {
        editingMessageId: null,
        messages: {
          ...state.messages,
          [currentChannelId]: channelMsgs.map((m) =>
            m.id === messageId
              ? { ...m, text, edited: true, contentType: formatting?.contentType, formatting: formatting?.data }
              : m,
          ),
        },
      };
    });
  },

  deleteMessage(messageId: string) {
    const { ws, currentChannelId } = get();
    if (!ws) return;
    ws.deleteMessage(messageId);
    // Optimistic removal — remove from local state immediately
    if (currentChannelId) {
      set((state) => {
        const channelMsgs = state.messages[currentChannelId];
        if (!channelMsgs) return state;
        return {
          messages: {
            ...state.messages,
            [currentChannelId]: channelMsgs.filter((m) => m.id !== messageId),
          },
        };
      });
    }
  },

  addReaction(messageId: string, emoji: string) {
    const { ws } = get();
    if (!ws) return;
    // Optimistic update with our real user_id
    const myId = useAuthStore.getState().user?.id;
    if (myId) {
      set((state) => {
        const groups = [...(state.reactions[messageId] ?? [])];
        const existing = groups.find((g) => g.emoji === emoji);
        if (existing) {
          if (!existing.userIds.includes(myId)) {
            existing.userIds = [...existing.userIds, myId];
          }
        } else {
          groups.push({ emoji, userIds: [myId] });
        }
        return { reactions: { ...state.reactions, [messageId]: groups } };
      });
    }
    ws.addReaction(messageId, emoji);
  },

  removeReaction(messageId: string, emoji: string) {
    const { ws } = get();
    if (!ws) return;
    // Optimistic update — remove our own user_id
    const myId = useAuthStore.getState().user?.id;
    if (myId) {
      set((state) => {
        const groups = (state.reactions[messageId] ?? [])
          .map((g) => {
            if (g.emoji !== emoji) return g;
            return { ...g, userIds: g.userIds.filter((id) => id !== myId) };
          })
          .filter((g) => g.userIds.length > 0);
        return { reactions: { ...state.reactions, [messageId]: groups } };
      });
    }
    ws.removeReaction(messageId, emoji);
  },

  toggleReaction(messageId: string, emoji: string) {
    const myId = useAuthStore.getState().user?.id;
    if (!myId) return;
    const groups = get().reactions[messageId] ?? [];
    const existing = groups.find((g) => g.emoji === emoji);
    if (existing && existing.userIds.includes(myId)) {
      get().removeReaction(messageId, emoji);
    } else {
      get().addReaction(messageId, emoji);
    }
  },

  async sendMessageToChannel(channelId, text, formatting) {
    const { ws } = get();
    if (!ws) return;

    if (!ws.isConnected) {
      ws.connect();
      await new Promise((r) => setTimeout(r, 1000));
      if (!ws.isConnected) return;
    }

    const { user } = useAuthStore.getState();
    if (!user) return;

    try {
      const { senderToken, encryptedBody } = await encryptOutgoing(
        user.id,
        channelId,
        text,
        undefined,
        formatting,
      );

      const tempId = `temp-${crypto.randomUUID()}`;
      pendingAcks.push(tempId);

      const optimistic: DecryptedMessage = {
        id: tempId,
        channelId,
        senderId: user.id,
        text,
        contentType: formatting?.contentType,
        formatting: formatting?.data,
        timestamp: new Date().toISOString(),
        raw: {} as MessageResponse,
      };
      set((state) => appendMessage(state, channelId, optimistic));

      ws.sendMessage(channelId, senderToken, encryptedBody);
    } catch (err) {
      console.error("[sendMessageToChannel] Failed to send:", err);
    }
  },

  removeExpiredMessage(channelId, messageId) {
    uncacheMessage(messageId);
    set((state) => {
      const existing = state.messages[channelId];
      if (!existing) return state;
      return {
        messages: {
          ...state.messages,
          [channelId]: existing.filter((m) => m.id !== messageId),
        },
      };
    });
  },
});
