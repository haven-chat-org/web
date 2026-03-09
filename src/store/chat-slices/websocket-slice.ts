import type { StateCreator } from "zustand";
import {
  HavenWs,
  type MessageResponse,
  type WsServerMessage,
} from "@haven-chat-org/core";
import { getServerUrl } from "../../lib/serverUrl.js";
import { useAuthStore } from "../auth.js";
import { usePresenceStore } from "../presence.js";
import { decryptIncoming, fetchSenderKeys, invalidateSenderKey, mapChannelToPeer } from "../../lib/crypto.js";
import { cacheMessage, getCachedMessage, uncacheMessage } from "../../lib/message-cache.js";
import { initTabSync, isWsOwner, broadcastWsEvent, onRoleChange, onWsSend } from "../../lib/tab-sync.js";
import { unicodeAtob } from "../../lib/base64.js";
import { useUiStore } from "../ui.js";
import { sendNotification } from "../../lib/notifications.js";
import type { ChatState, WebSocketSlice, DecryptedMessage } from "./types.js";
import { appendMessage, formattingMentionsUser, TYPING_EXPIRY_MS } from "./helpers.js";
import { pendingAcks, ownMessageIds, ownEditIds } from "./messaging-slice.js";

// Track recently processed message IDs to deduplicate (DM messages may arrive
// via both channel broadcast and direct delivery to user connections).
const processedMsgIds = new Set<string>();

/** Parse a DM channel's meta and register the channel->peer mapping for E2EE routing. */
function mapDmChannelPeer(channel: { id: string; channel_type?: string; encrypted_meta: string }, myUserId: string): void {
  if (channel.channel_type !== "dm") return;
  try {
    const meta = JSON.parse(unicodeAtob(channel.encrypted_meta));
    if (meta.type !== "dm" || !Array.isArray(meta.participants)) return;
    const peerId = meta.participants.find((id: string) => id !== myUserId);
    if (peerId) mapChannelToPeer(channel.id, peerId);
  } catch { /* non-fatal */ }
}

/** Clear a specific user from the typing indicator for a channel. */
function clearTypingForUser(set: (fn: (state: ChatState) => Partial<ChatState>) => void, channelId: string, userId: string): void {
  set((state) => {
    const channelTyping = state.typingUsers[channelId];
    if (!channelTyping || channelTyping.length === 0) return state;
    const filtered = channelTyping.filter((t) => t.userId !== userId);
    if (filtered.length === channelTyping.length) return state;
    return { typingUsers: { ...state.typingUsers, [channelId]: filtered } };
  });
}

async function handleIncomingMessage(set: (fn: (state: ChatState) => Partial<ChatState> | ChatState) => void, get: () => ChatState, raw: MessageResponse) {
  // Skip our own messages — already displayed via optimistic insert
  if (ownMessageIds.has(raw.id)) {
    ownMessageIds.delete(raw.id);
    return;
  }

  // Deduplicate: DM messages may arrive twice (broadcast + direct delivery)
  if (processedMsgIds.has(raw.id)) return;
  processedMsgIds.add(raw.id);
  if (processedMsgIds.size > 500) {
    const toRemove = [...processedMsgIds].slice(0, 250);
    for (const id of toRemove) processedMsgIds.delete(id);
  }

  // If this message is for an unknown channel, reload channels to discover it
  const knownChannels = get().channels;
  if (!knownChannels.some((ch) => ch.id === raw.channel_id)) {
    await get().loadChannels();

    // Subscribe to the newly discovered channel and map DM peer
    const { ws } = get();
    if (ws) ws.subscribe(raw.channel_id);
    const newChannel = get().channels.find((ch) => ch.id === raw.channel_id);
    if (newChannel) {
      const myId = useAuthStore.getState().user?.id;
      if (myId) mapDmChannelPeer(newChannel, myId);
    }
  }

  // Increment unread count if this message is for a non-active channel
  if (raw.channel_id !== get().currentChannelId) {
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [raw.channel_id]: (state.unreadCounts[raw.channel_id] ?? 0) + 1,
      },
    }));
  }

  // System messages are unencrypted (but base64-encoded as bytea)
  if (raw.message_type === "system") {
    let sysText: string;
    try { sysText = unicodeAtob(raw.encrypted_body); } catch { sysText = raw.encrypted_body; }

    // Update userNames from member_joined events so new users show their name
    // Also bump memberListVersion so MemberSidebar refreshes
    try {
      const data = JSON.parse(sysText);
      if (data.event === "member_joined" && data.user_id && data.username) {
        set((state) => ({
          userNames: { ...state.userNames, [data.user_id]: data.username },
          memberListVersion: state.memberListVersion + 1,
        }));
        // Invalidate sender keys for ALL channels in this server so we
        // re-distribute to the new member on next send
        const thisChannel = get().channels.find((c: { id: string }) => c.id === raw.channel_id);
        if (thisChannel?.server_id) {
          for (const ch of get().channels) {
            if (ch.server_id === thisChannel.server_id) {
              invalidateSenderKey(ch.id);
            }
          }
        }
      }
      if (data.event === "member_left" || data.event === "member_kicked") {
        set((state) => ({
          memberListVersion: state.memberListVersion + 1,
        }));
        // Invalidate sender keys so we stop encrypting for the departed member
        const depChannel = get().channels.find((c: { id: string }) => c.id === raw.channel_id);
        if (depChannel?.server_id) {
          for (const ch of get().channels) {
            if (ch.server_id === depChannel.server_id) {
              invalidateSenderKey(ch.id);
            }
          }
        }
      }
      // Sync export_allowed when the other participant toggles consent
      if (data.event === "export_consent_enabled" || data.event === "export_consent_disabled") {
        const newVal = data.event === "export_consent_enabled";
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === raw.channel_id ? { ...ch, export_allowed: newVal } : ch
          ),
        }));
      }
    } catch { /* not valid JSON, ignore */ }

    const msg: DecryptedMessage = {
      id: raw.id,
      channelId: raw.channel_id,
      senderId: raw.sender_token,
      text: sysText,
      timestamp: raw.timestamp,
      messageType: "system",
      expiresAt: raw.expires_at ?? null,
      raw,
    };
    set((state) => appendMessage(state, raw.channel_id, msg));
    return;
  }

  try {
    const msg = await decryptIncoming(raw);
    msg.edited = raw.edited;
    msg.replyToId = raw.reply_to_id;
    msg.expiresAt = raw.expires_at ?? null;
    // Apply content filter
    {
      const state = get();
      const ch = state.channels.find((c) => c.id === raw.channel_id);
      if (ch?.server_id) {
        const filterResult = state.checkContentFilter(ch.server_id, msg.text);
        if (filterResult) msg.filterAction = filterResult.action;
      }
    }
    cacheMessage(msg);
    // Clear typing indicator for this sender — they just sent a message
    clearTypingForUser(set, raw.channel_id, msg.senderId);

    // Detect @mentions and replies to current user for mention badge
    if (raw.channel_id !== get().currentChannelId) {
      const myId = useAuthStore.getState().user?.id;
      if (myId) {
        // Look up user's role IDs for @role mention detection
        const state = get();
        const channel = state.channels.find((ch) => ch.id === raw.channel_id);
        const roleIds = channel?.server_id ? state.myRoleIds[channel.server_id] ?? [] : [];
        const isMentioned = formattingMentionsUser(msg.formatting, myId, roleIds);
        const isReplyToMe = msg.replyToId
          ? (get().messages[raw.channel_id] ?? []).some(
              (m) => m.id === msg.replyToId && m.senderId === myId,
            )
          : false;
        if (isMentioned || isReplyToMe) {
          set((state) => ({
            mentionCounts: {
              ...state.mentionCounts,
              [raw.channel_id]: (state.mentionCounts[raw.channel_id] ?? 0) + 1,
            },
          }));
        }

        // Notification with server/channel override cascade
        const { channelNotifications, serverNotifications } = useUiStore.getState();
        const channelSetting = channelNotifications[raw.channel_id] ?? "default";
        const serverSetting = channel?.server_id
          ? (serverNotifications[channel.server_id] ?? "default")
          : "default";

        // Cascade: channel > server > inherent default
        // Inherent default: server channels = "mentions", DMs = "all"
        let effective = channelSetting as string;
        if (effective === "default") effective = serverSetting;
        if (effective === "default") effective = channel?.server_id ? "mentions" : "all";

        const shouldNotify =
          effective === "all" ||
          (effective === "mentions" && (isMentioned || isReplyToMe));

        if (shouldNotify) {
          const senderName = get().userNames[msg.senderId] ?? "Someone";
          const body = msg.text?.slice(0, 100) || "sent a message";
          sendNotification("New Message", `${senderName}: ${body}`);
        }

        // Play notification sound (respecting server/channel mute)
        const isMuted = channel?.server_id
          ? useUiStore.getState().isServerMuted(channel.server_id)
          : false;
        const isChMuted = useUiStore.getState().isChannelMuted(raw.channel_id);
        if (!isMuted && !isChMuted && shouldNotify) {
          import("../voice.js").then(({ useVoiceStore }) => {
            if (useVoiceStore.getState().soundMessage) {
              import("../../lib/sounds.js").then(({ playSound }) => playSound("newMessage"));
            }
          });
        }
      }
    }

    // Play subtle sound for messages in the currently-viewed channel
    if (raw.channel_id === get().currentChannelId) {
      import("../voice.js").then(({ useVoiceStore }) => {
        if (useVoiceStore.getState().soundCurrentChannel) {
          import("../../lib/sounds.js").then(({ playSound }) => playSound("messageInCurrentChannel"));
        }
      });
    }

    set((state) => appendMessage(state, raw.channel_id, msg));
  } catch (err) {
    console.warn("[E2EE] WS message decryption failed", raw.id, err);
    // Try local cache first
    const cached = getCachedMessage(raw.id, raw.channel_id, raw.timestamp, raw.edited, raw);
    const fallback: DecryptedMessage = cached ?? {
      id: raw.id,
      channelId: raw.channel_id,
      senderId: "unknown",
      text: "[encrypted message]",
      timestamp: raw.timestamp,
      replyToId: raw.reply_to_id,
      raw,
    };
    set((state) => appendMessage(state, raw.channel_id, fallback));
  }
}

async function handleMessageEdited(set: (fn: (state: ChatState) => Partial<ChatState> | ChatState) => void, get: () => ChatState, payload: { message_id: string; channel_id: string; encrypted_body: string }) {
  const { channel_id, message_id, encrypted_body } = payload;

  // Skip re-decryption for our own edits — already applied optimistically
  if (ownEditIds.has(message_id)) {
    ownEditIds.delete(message_id);
    return;
  }

  set((state) => {
    const channelMsgs = state.messages[channel_id];
    if (!channelMsgs) return state;

    const updated = channelMsgs.map((msg) => {
      if (msg.id !== message_id) return msg;

      // Re-decrypt the edited body
      const updatedRaw: MessageResponse = {
        ...msg.raw,
        encrypted_body,
        edited: true,
      };

      // We decrypt asynchronously, so schedule a re-render
      decryptIncoming(updatedRaw).then((decrypted) => {
        decrypted.edited = true;
        cacheMessage(decrypted);
        set((s) => ({
          messages: {
            ...s.messages,
            [channel_id]: (s.messages[channel_id] ?? []).map((m) =>
              m.id === message_id ? decrypted : m,
            ),
          },
        }));
      }).catch((err) => {
        console.warn("[E2EE] Failed to decrypt edited message", message_id, err);
      });

      // Immediately mark as edited with placeholder
      return { ...msg, edited: true, raw: updatedRaw };
    });

    return { messages: { ...state.messages, [channel_id]: updated } };
  });
}

export const createWebSocketSlice: StateCreator<ChatState, [], [], WebSocketSlice> = (set, get) => ({
  ws: null,
  wsState: "disconnected",

  connect() {
    const { api } = useAuthStore.getState();
    const token = api.currentAccessToken;
    if (!token) return;

    // Initialize multi-tab coordination
    initTabSync();

    // Handle role changes: if we become leader later, connect WS
    onRoleChange((newRole) => {
      const { ws: existingWs } = get();
      if (newRole === "leader" && !existingWs) {
        // Became leader — need to establish WS connection
        get().connect();
      }
    });

    // If this tab is a follower, don't open a WS connection
    if (!isWsOwner()) {
      set({ wsState: "connected" }); // Followers piggyback on leader's connection
      return;
    }

    const ws = new HavenWs({
      baseUrl: getServerUrl(),
      token,
    });

    // When leader receives WS sends from followers, relay them
    onWsSend((data) => {
      if (ws.isConnected) {
        ws.send(data as Parameters<typeof ws.send>[0]);
      }
    });

    // Broadcast all WS events to follower tabs
    ws.on("*" as any, (msg: any) => {
      broadcastWsEvent(msg);
    });

    let hasConnectedBefore = false;

    ws.onConnect(() => {
      const isReconnect = hasConnectedBefore;
      hasConnectedBefore = true;
      set({ wsState: "connected" });

      if (isReconnect) {
        // Re-subscribe all loaded channels on reconnect
        const { channels, currentChannelId } = get();
        const subscribedIds = new Set<string>();
        for (const ch of channels) {
          ws.subscribe(ch.id);
          subscribedIds.add(ch.id);
        }

        // Re-fetch messages for current channel to catch anything missed
        if (currentChannelId) {
          const { api } = useAuthStore.getState();
          api.getMessages(currentChannelId, { limit: 50 }).catch(() => {});
        }
      }
    });

    ws.onDisconnect(() => set({ wsState: "disconnected" }));

    ws.on("NewMessage", (msg: Extract<WsServerMessage, { type: "NewMessage" }>) => {
      handleIncomingMessage(set, get, msg.payload);
    });

    ws.on("MessageEdited", (msg: Extract<WsServerMessage, { type: "MessageEdited" }>) => {
      handleMessageEdited(set, get, msg.payload);
    });

    ws.on("MessageDeleted", (msg: Extract<WsServerMessage, { type: "MessageDeleted" }>) => {
      const { message_id, channel_id } = msg.payload;
      uncacheMessage(message_id);
      set((state) => {
        const channelMsgs = state.messages[channel_id];
        if (!channelMsgs) return state;
        return {
          messages: {
            ...state.messages,
            [channel_id]: channelMsgs.filter((m) => m.id !== message_id),
          },
        };
      });
    });

    ws.on("BulkMessagesDeleted", (msg: Extract<WsServerMessage, { type: "BulkMessagesDeleted" }>) => {
      const { channel_id, message_ids } = msg.payload;
      const idsSet = new Set(message_ids);
      for (const id of message_ids) uncacheMessage(id);
      set((state) => {
        const channelMsgs = state.messages[channel_id];
        if (!channelMsgs) return state;
        return {
          messages: {
            ...state.messages,
            [channel_id]: channelMsgs.filter((m) => !idsSet.has(m.id)),
          },
        };
      });
    });

    ws.on("MemberTimedOut", (msg: Extract<WsServerMessage, { type: "MemberTimedOut" }>) => {
      const { server_id, user_id, timed_out_until } = msg.payload;
      set((state) => ({
        memberTimeouts: {
          ...state.memberTimeouts,
          [`${server_id}:${user_id}`]: timed_out_until,
        },
      }));
    });

    ws.on("ReadStateUpdated", (msg: Extract<WsServerMessage, { type: "ReadStateUpdated" }>) => {
      const { channel_id } = msg.payload;
      // Another device marked this channel as read — clear local unread
      if (channel_id !== get().currentChannelId) {
        set((state) => {
          const { [channel_id]: _, ...restUnread } = state.unreadCounts;
          const { [channel_id]: __, ...restMention } = state.mentionCounts;
          return { unreadCounts: restUnread, mentionCounts: restMention };
        });
      }
    });

    ws.on("ReactionAdded", (msg: Extract<WsServerMessage, { type: "ReactionAdded" }>) => {
      const { message_id, user_id, emoji } = msg.payload;
      set((state) => {
        const groups = [...(state.reactions[message_id] ?? [])];
        const existing = groups.find((g) => g.emoji === emoji);
        if (existing) {
          if (!existing.userIds.includes(user_id)) {
            existing.userIds = [...existing.userIds, user_id];
          }
        } else {
          groups.push({ emoji, userIds: [user_id] });
        }
        return { reactions: { ...state.reactions, [message_id]: groups } };
      });
    });

    ws.on("ReactionRemoved", (msg: Extract<WsServerMessage, { type: "ReactionRemoved" }>) => {
      const { message_id, user_id, emoji } = msg.payload;
      set((state) => {
        const groups = (state.reactions[message_id] ?? [])
          .map((g) => {
            if (g.emoji !== emoji) return g;
            return { ...g, userIds: g.userIds.filter((id) => id !== user_id) };
          })
          .filter((g) => g.userIds.length > 0);
        return { reactions: { ...state.reactions, [message_id]: groups } };
      });
    });

    ws.on("MessageAck", (msg: Extract<WsServerMessage, { type: "MessageAck" }>) => {
      const tempId = pendingAcks.shift();
      if (!tempId) return;
      const realId = msg.payload.message_id;
      ownMessageIds.add(realId);

      // Replace temp ID with real server-assigned ID in the store and cache
      set((state) => {
        const updated: Record<string, DecryptedMessage[]> = {};
        for (const [chId, msgs] of Object.entries(state.messages)) {
          const idx = msgs.findIndex((m) => m.id === tempId);
          if (idx !== -1) {
            const copy = [...msgs];
            copy[idx] = { ...copy[idx], id: realId };
            cacheMessage(copy[idx]);
            updated[chId] = copy;
          }
        }
        if (Object.keys(updated).length === 0) return state;
        return { messages: { ...state.messages, ...updated } };
      });
    });

    ws.on("SenderKeysUpdated", (msg: Extract<WsServerMessage, { type: "SenderKeysUpdated" }>) => {
      fetchSenderKeys(msg.payload.channel_id).catch(() => {});
    });

    ws.on("PresenceUpdate", (msg: Extract<WsServerMessage, { type: "PresenceUpdate" }>) => {
      usePresenceStore.getState().setStatus(msg.payload.user_id, msg.payload.status);
    });

    // Voice state events
    ws.on("VoiceStateUpdate", (msg: Extract<WsServerMessage, { type: "VoiceStateUpdate" }>) => {
      import("../voice.js").then(({ useVoiceStore }) => {
        const { channel_id, user_id, username, joined } = msg.payload;
        useVoiceStore.getState().handleVoiceStateUpdate(
          channel_id, user_id, username, null, null, joined,
        );
      });
    });

    ws.on("VoiceMuteUpdate", (msg: Extract<WsServerMessage, { type: "VoiceMuteUpdate" }>) => {
      import("../voice.js").then(({ useVoiceStore }) => {
        const { channel_id, user_id, server_muted, server_deafened } = msg.payload;
        useVoiceStore.getState().handleVoiceMuteUpdate(
          channel_id, user_id, server_muted, server_deafened,
        );
      });
    });

    // DM/group call events
    ws.on("CallRinging", (msg: Extract<WsServerMessage, { type: "CallRinging" }>) => {
      import("../voice.js").then(({ useVoiceStore }) => {
        const { channel_id, caller_id, caller_name } = msg.payload;
        useVoiceStore.getState().handleCallRinging(channel_id, caller_id, caller_name);
      });
    });

    ws.on("CallAccepted", (msg: Extract<WsServerMessage, { type: "CallAccepted" }>) => {
      import("../voice.js").then(({ useVoiceStore }) => {
        const { channel_id, user_id } = msg.payload;
        useVoiceStore.getState().handleCallAccepted(channel_id, user_id);
      });
    });

    ws.on("CallRejected", (msg: Extract<WsServerMessage, { type: "CallRejected" }>) => {
      import("../voice.js").then(({ useVoiceStore }) => {
        const { channel_id, user_id } = msg.payload;
        useVoiceStore.getState().handleCallRejected(channel_id, user_id);
      });
    });

    ws.on("CallEnded", (msg: Extract<WsServerMessage, { type: "CallEnded" }>) => {
      import("../voice.js").then(({ useVoiceStore }) => {
        const { channel_id, ended_by } = msg.payload;
        useVoiceStore.getState().handleCallEnded(channel_id, ended_by);
      });
    });

    // Custom emoji events
    ws.on("EmojiCreated", (msg: Extract<WsServerMessage, { type: "EmojiCreated" }>) => {
      const { server_id, emoji } = msg.payload;
      set((state) => {
        const existing = state.customEmojis[server_id] ?? [];
        // Deduplicate: broadcast_to_server sends once per channel, so skip if already added
        if (existing.some((e) => e.id === emoji.id)) return state;
        return {
          customEmojis: {
            ...state.customEmojis,
            [server_id]: [...existing, emoji],
          },
        };
      });
    });

    ws.on("EmojiDeleted", (msg: Extract<WsServerMessage, { type: "EmojiDeleted" }>) => {
      const { server_id, emoji_id } = msg.payload;
      set((state) => ({
        customEmojis: {
          ...state.customEmojis,
          [server_id]: (state.customEmojis[server_id] ?? []).filter((e) => e.id !== emoji_id),
        },
      }));
    });

    // Friend events — dynamically import friends store to avoid circular deps
    ws.on("FriendRequestReceived", () => {
      import("../friends.js").then(({ useFriendsStore }) => {
        useFriendsStore.getState().loadFriends();
      });
      sendNotification("Friend Request", "You received a new friend request");
    });
    ws.on("FriendRequestAccepted", () => {
      import("../friends.js").then(({ useFriendsStore }) => {
        useFriendsStore.getState().loadFriends();
      });
    });
    ws.on("FriendRemoved", () => {
      import("../friends.js").then(({ useFriendsStore }) => {
        useFriendsStore.getState().loadFriends();
      });
    });
    ws.on("MessagePinned", (msg: Extract<WsServerMessage, { type: "MessagePinned" }>) => {
      const { channel_id, message_id } = msg.payload;
      set((state) => {
        const existing = state.pinnedMessageIds[channel_id] ?? [];
        if (existing.includes(message_id)) return state;
        return {
          pinnedMessageIds: {
            ...state.pinnedMessageIds,
            [channel_id]: [...existing, message_id],
          },
        };
      });
    });

    ws.on("MessageUnpinned", (msg: Extract<WsServerMessage, { type: "MessageUnpinned" }>) => {
      const { channel_id, message_id } = msg.payload;
      set((state) => {
        const existing = state.pinnedMessageIds[channel_id] ?? [];
        return {
          pinnedMessageIds: {
            ...state.pinnedMessageIds,
            [channel_id]: existing.filter((id) => id !== message_id),
          },
        };
      });
    });

    ws.on("ChannelSettingsUpdated", (msg: Extract<WsServerMessage, { type: "ChannelSettingsUpdated" }>) => {
      const { channel_id, message_ttl } = msg.payload;
      set((state) => ({
        channels: state.channels.map((ch) =>
          ch.id === channel_id ? { ...ch, message_ttl: message_ttl ?? null } : ch,
        ),
      }));
    });

    ws.on("MessagesExpired", (msg: Extract<WsServerMessage, { type: "MessagesExpired" }>) => {
      const { channel_id, message_ids } = msg.payload;
      const idsSet = new Set(message_ids);
      for (const id of message_ids) uncacheMessage(id);
      set((state) => {
        const existing = state.messages[channel_id];
        if (!existing) return state;
        return {
          messages: {
            ...state.messages,
            [channel_id]: existing.filter((m) => !idsSet.has(m.id)),
          },
        };
      });
    });

    ws.on("ServerUpdated", () => {
      // Server structure changed (channels/categories) — reload
      get().loadChannels();
    });

    ws.on("DmRequestReceived", () => {
      import("../friends.js").then(({ useFriendsStore }) => {
        useFriendsStore.getState().loadDmRequests();
      });
      // Also reload channels to show the new pending DM
      get().loadChannels();
    });

    ws.on("UserTyping", (msg: Extract<WsServerMessage, { type: "UserTyping" }>) => {
      const { channel_id, user_id, username } = msg.payload;
      const myId = useAuthStore.getState().user?.id;
      if (user_id === myId) return; // ignore own typing

      const expiry = Date.now() + TYPING_EXPIRY_MS;
      set((state) => {
        const existing = (state.typingUsers[channel_id] ?? []).filter(
          (t) => t.userId !== user_id && t.expiry > Date.now(),
        );
        return {
          typingUsers: {
            ...state.typingUsers,
            [channel_id]: [...existing, { userId: user_id, username, expiry }],
          },
        };
      });

      // Schedule cleanup
      setTimeout(() => {
        set((state) => {
          const filtered = (state.typingUsers[channel_id] ?? []).filter(
            (t) => t.expiry > Date.now(),
          );
          return {
            typingUsers: { ...state.typingUsers, [channel_id]: filtered },
          };
        });
      }, TYPING_EXPIRY_MS + 100);
    });

    ws.connect();
    set({ ws, wsState: "connecting" });

    // Provide WS setStatus to presence store (avoids circular import)
    usePresenceStore.setState({ _wsSendStatus: (status: string) => ws.setStatus(status) });
  },

  disconnect() {
    get().ws?.disconnect();
    set({
      ws: null,
      wsState: "disconnected",
      channels: [],
      messages: {},
      currentChannelId: null,
      servers: [],
      roles: {},
      userNames: {},
      typingUsers: {},
      unreadCounts: {},
      dataLoaded: false,
    });
  },
});
