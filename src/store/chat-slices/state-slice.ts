import type { StateCreator } from "zustand";
import type {
  ChannelResponse,
  CategoryResponse,
  RoleResponse,
  CustomEmojiResponse,
} from "@haven-chat-org/core";
import { getServerUrl } from "../../lib/serverUrl.js";
import { useAuthStore } from "../auth.js";
import { usePresenceStore } from "../presence.js";
import { useUiStore } from "../ui.js";
import { decryptIncoming, fetchSenderKeys, mapChannelToPeer } from "../../lib/crypto.js";
import { cacheMessage, getCachedMessage } from "../../lib/message-cache.js";
import { unicodeBtoa, unicodeAtob } from "../../lib/base64.js";
import type { ChatState, StateSlice, DecryptedMessage } from "./types.js";

/** Parse a DM channel's meta and register the channel->peer mapping for E2EE routing. */
function mapDmChannelPeer(channel: ChannelResponse, myUserId: string): void {
  if (channel.channel_type !== "dm") return;
  try {
    const meta = JSON.parse(unicodeAtob(channel.encrypted_meta));
    if (meta.type !== "dm" || !Array.isArray(meta.participants)) return;
    const peerId = meta.participants.find((id: string) => id !== myUserId);
    if (peerId) mapChannelToPeer(channel.id, peerId);
  } catch { /* non-fatal */ }
}

export const createStateSlice: StateCreator<ChatState, [], [], StateSlice> = (set, get) => ({
  servers: [],
  channels: [],
  categories: {},
  roles: {},
  currentChannelId: null,
  userNames: {},
  userAvatars: {},
  blockedUserIds: [],
  unreadCounts: {},
  mentionCounts: {},
  myPermissions: {},
  myRoleIds: {},
  userRoleColors: {},
  customEmojis: {},
  memberTimeouts: {},
  memberListVersion: 0,
  newMessageDividers: {},
  dataLoaded: false,
  contentFilters: {},

  async loadChannels() {
    // Prevent concurrent calls (React Strict Mode fires effects twice)
    if ((get() as any)._channelsLoading) return;
    set({ _channelsLoading: true } as any);

    const { api } = useAuthStore.getState();

    // Load servers first (everything else depends on the server list)
    const servers = await api.listServers();

    // Normalize relative icon URLs to absolute (needed for Tauri / custom server URL)
    const base = getServerUrl();
    for (const srv of servers) {
      if (srv.icon_url && srv.icon_url.startsWith("/")) {
        srv.icon_url = base + srv.icon_url;
      }
    }

    // Fire ALL independent requests in parallel — DMs, members, and blocked
    // users no longer wait for server channels/categories/roles to finish
    const [
      serverChannelArrays,
      serverCategoryArrays,
      serverRoleArrays,
      dmChannels,
      memberArrays,
      blockedUsers,
      serverEmojiArrays,
      readStates,
    ] = await Promise.all([
      Promise.all(servers.map((server) => api.listServerChannels(server.id))),
      Promise.all(servers.map((server) => api.listCategories(server.id))),
      Promise.all(servers.map((server) => api.listRoles(server.id))),
      api.listDmChannels(),
      Promise.all(servers.map((server) => api.listServerMembers(server.id))),
      api.getBlockedUsers().catch(() => [] as Array<{ user_id: string; username: string; blocked_at: string }>),
      Promise.all(servers.map((server) => api.listServerEmojis(server.id).catch((err) => {
        console.warn("Failed to fetch emojis for server", server.id, err);
        return [] as CustomEmojiResponse[];
      }))),
      api.getReadStates().catch(() => []),
    ]);

    const allChannels: ChannelResponse[] = serverChannelArrays.flat();

    // Build categories map: serverId -> CategoryResponse[]
    const categories: Record<string, CategoryResponse[]> = {};
    const roles: Record<string, RoleResponse[]> = {};
    const customEmojis: Record<string, CustomEmojiResponse[]> = {};
    servers.forEach((server, i) => {
      categories[server.id] = serverCategoryArrays[i];
      roles[server.id] = serverRoleArrays[i];
      customEmojis[server.id] = serverEmojiArrays[i];
    });

    allChannels.push(...dmChannels);

    // Map DM channels to their peer for E2EE session routing
    const { user } = useAuthStore.getState();
    if (user) {
      for (const ch of dmChannels) {
        mapDmChannelPeer(ch, user.id);
      }
    }

    // Extract names from DM/group channel metadata
    const dmUserNames: Record<string, string> = {};
    for (const ch of dmChannels) {
      try {
        const meta = JSON.parse(unicodeAtob(ch.encrypted_meta));
        if (meta.names) {
          for (const [id, name] of Object.entries(meta.names)) {
            if (!dmUserNames[id]) dmUserNames[id] = name as string;
          }
        }
      } catch { /* non-fatal */ }
    }

    // Build global userId -> displayName and avatar maps from server members
    const userNames: Record<string, string> = {};
    const userAvatars: Record<string, string> = {};
    for (const members of memberArrays) {
      for (const m of members) {
        userNames[m.user_id] = m.nickname || m.display_name || m.username;
        if (m.avatar_url) userAvatars[m.user_id] = m.avatar_url;
      }
    }

    // Build myPermissions map from server responses
    const myPermissions: Record<string, bigint> = {};
    for (const server of servers) {
      if (server.my_permissions) {
        myPermissions[server.id] = BigInt(server.my_permissions);
      }
    }

    // Build userId -> highest-priority role color map
    const userRoleColors: Record<string, string> = {};
    for (let i = 0; i < servers.length; i++) {
      const srvRoles = serverRoleArrays[i];
      const members = memberArrays[i];
      for (const m of members) {
        if (userRoleColors[m.user_id]) continue; // first server wins
        const coloredRoles = srvRoles
          .filter((r) => !r.is_default && r.color && m.role_ids.includes(r.id))
          .sort((a, b) => b.position - a.position);
        if (coloredRoles.length > 0) {
          userRoleColors[m.user_id] = coloredRoles[0].color!;
        }
      }
    }

    // Build myRoleIds map: serverId -> current user's role IDs in that server
    const myRoleIds: Record<string, string[]> = {};
    if (user) {
      for (let i = 0; i < servers.length; i++) {
        const me = memberArrays[i].find((m) => m.user_id === user.id);
        if (me) myRoleIds[servers[i].id] = me.role_ids;
      }
    }

    // Merge DM/group names (server member names take priority)
    const mergedUserNames = { ...dmUserNames, ...userNames };

    // Build server-side unread counts
    const serverUnreads: Record<string, number> = {};
    for (const rs of readStates) {
      if (rs.unread_count > 0) {
        serverUnreads[rs.channel_id] = rs.unread_count;
      }
    }

    set({
      servers,
      channels: allChannels,
      categories,
      roles,
      customEmojis,
      userNames: mergedUserNames,
      userAvatars,
      blockedUserIds: blockedUsers.map((b) => b.user_id),
      myPermissions,
      myRoleIds,
      userRoleColors,
      unreadCounts: serverUnreads,
      dataLoaded: true,
      _channelsLoading: false,
    } as any);

    // Subscribe to all channels via WebSocket
    const { ws } = get();
    if (ws && get().wsState === "connected") {
      for (const ch of allChannels) {
        ws.subscribe(ch.id);
      }
    }

    // Fetch bulk presence for all server members
    const allMemberIds = new Set<string>();
    for (const members of memberArrays) {
      for (const m of members) {
        allMemberIds.add(m.user_id);
      }
    }
    usePresenceStore.getState().fetchPresence([...allMemberIds]);

    // Ensure current user always shows their own status (avoids race with WS connect)
    const { user: currentUser } = useAuthStore.getState();
    if (currentUser) {
      const ps = usePresenceStore.getState();
      ps.setStatus(currentUser.id, ps.ownStatus);
    }
  },

  async selectChannel(channelId) {
    // Snapshot unread count before clearing, for "NEW" divider
    const unreadSnapshot = get().unreadCounts[channelId] ?? 0;

    set((state) => {
      const { [channelId]: _, ...restUnread } = state.unreadCounts;
      const { [channelId]: __, ...restMention } = state.mentionCounts;
      const newDividers = unreadSnapshot > 0
        ? { ...state.newMessageDividers, [channelId]: unreadSnapshot }
        : state.newMessageDividers;
      return { currentChannelId: channelId, unreadCounts: restUnread, mentionCounts: restMention, newMessageDividers: newDividers };
    });

    // Mark channel as read on server (fire-and-forget via WS)
    const wsConn = get().ws;
    if (wsConn) {
      try { wsConn.markRead(channelId); } catch { /* non-fatal */ }
    }

    // Clear the "NEW" divider after a delay so it's visible briefly
    if (unreadSnapshot > 0) {
      setTimeout(() => {
        set((state) => {
          const { [channelId]: _, ...rest } = state.newMessageDividers;
          return { newMessageDividers: rest };
        });
      }, 5000);
    }

    // Fetch any pending sender key distributions for this channel
    try {
      await fetchSenderKeys(channelId);
    } catch {
      // Non-fatal: will retry on next message or WS notification
    }

    // Fetch content filters for the channel's server (if not already cached)
    {
      const ch = get().channels.find((c) => c.id === channelId);
      if (ch?.server_id && !get().contentFilters[ch.server_id]) {
        get().fetchContentFilters(ch.server_id);
      }
    }

    // Load message history if we haven't already
    if (!get().messages[channelId]) {
      const { api } = useAuthStore.getState();
      const rawMessages = await api.getMessages(channelId, { limit: 50 });

      // Reverse to process in chronological order (oldest first).
      // DM initial (X3DH) messages must establish the session before
      // follow-up messages can decrypt, and sender key fetch is also
      // more efficient when processed chronologically.
      rawMessages.reverse();

      const decrypted: DecryptedMessage[] = [];
      for (const raw of rawMessages) {
        // System messages are unencrypted — parse directly
        if (raw.message_type === "system") {
          let sysText: string;
          try { sysText = unicodeAtob(raw.encrypted_body); } catch { sysText = raw.encrypted_body; }
          decrypted.push({
            id: raw.id,
            channelId: raw.channel_id,
            senderId: raw.sender_token,
            text: sysText,
            timestamp: raw.timestamp,
            messageType: "system",
            expiresAt: raw.expires_at ?? null,
            raw,
          });
          continue;
        }
        try {
          const msg = await decryptIncoming(raw);
          msg.edited = raw.edited;
          msg.replyToId = raw.reply_to_id;
          msg.expiresAt = raw.expires_at ?? null;
          // Apply content filter if the channel belongs to a server
          const ch = get().channels.find((c) => c.id === raw.channel_id);
          if (ch?.server_id) {
            const filterResult = get().checkContentFilter(ch.server_id, msg.text);
            if (filterResult) msg.filterAction = filterResult.action;
          }
          cacheMessage(msg);
          decrypted.push(msg);
        } catch (err) {
          // Can't decrypt — try local cache (survives re-login)
          console.warn("[E2EE] Decryption failed for message", raw.id, err);
          const cached = getCachedMessage(raw.id, raw.channel_id, raw.timestamp, raw.edited, raw);
          if (cached) {
            cached.replyToId = raw.reply_to_id;
            decrypted.push(cached);
          } else {
            decrypted.push({
              id: raw.id,
              channelId: raw.channel_id,
              senderId: "unknown",
              text: "[encrypted message]",
              timestamp: raw.timestamp,
              replyToId: raw.reply_to_id,
              raw,
            });
          }
        }
      }

      set((state) => ({
        messages: { ...state.messages, [channelId]: decrypted },
      }));

      // Fetch reactions for these messages
      try {
        const reactionGroups = await api.getChannelReactions(channelId);
        const reactionMap: Record<string, Array<{ emoji: string; userIds: string[] }>> = {};
        for (const g of reactionGroups) {
          if (!reactionMap[g.message_id]) reactionMap[g.message_id] = [];
          reactionMap[g.message_id].push({ emoji: g.emoji, userIds: g.user_ids });
        }
        set((state) => ({
          reactions: { ...state.reactions, ...reactionMap },
        }));
      } catch {
        // Non-fatal
      }
    }

    // Subscribe to this channel
    const { ws } = get();
    if (ws) ws.subscribe(channelId);

    // Load pinned message IDs for this channel
    get().loadPins(channelId);
  },

  async startDm(targetUsername) {
    const { api } = useAuthStore.getState();
    const { user } = useAuthStore.getState();
    if (!user) throw new Error("Not authenticated");

    // Look up the target user by username
    const targetUser = await api.getUserByUsername(targetUsername);
    const targetUserId = targetUser.id;

    // Don't pre-establish E2EE session here. Sessions are created on-demand:
    //  - For sending: encryptOutgoing() fetches key bundle and calls ensureSession()
    //  - For receiving: decryptIncoming() runs X3DH respond on initial messages
    // Pre-creating a session here would conflict with incoming initial messages
    // from the peer, causing decryption failures.

    // Create the DM channel (includes usernames for display)
    const meta = JSON.stringify({
      type: "dm",
      participants: [user.id, targetUserId],
      names: { [user.id]: user.username, [targetUserId]: targetUser.username },
    });
    const metaBase64 = unicodeBtoa(meta);

    const channel = await api.createDm({
      target_user_id: targetUserId,
      encrypted_meta: metaBase64,
    });

    // Map channel -> peer for E2EE session routing
    mapChannelToPeer(channel.id, targetUserId);

    // Subscribe via WebSocket
    const { ws } = get();
    if (ws) ws.subscribe(channel.id);

    // Add channel to state (avoid duplicates if it already exists)
    set((state) => {
      const exists = state.channels.some((ch) => ch.id === channel.id);
      return {
        channels: exists ? state.channels : [...state.channels, channel],
        currentChannelId: channel.id,
        messages: { ...state.messages, [channel.id]: state.messages[channel.id] ?? [] },
      };
    });

    // Switch UI to DM view (hide friends list)
    const ui = useUiStore.getState();
    if (ui.selectedServerId !== null) ui.selectServer(null);
    ui.setShowFriends(false);

    return channel;
  },

  async getOrCreateDmChannel(targetUsername) {
    const { api } = useAuthStore.getState();
    const { user } = useAuthStore.getState();
    if (!user) throw new Error("Not authenticated");

    const targetUser = await api.getUserByUsername(targetUsername);
    const targetUserId = targetUser.id;

    const meta = JSON.stringify({
      type: "dm",
      participants: [user.id, targetUserId],
      names: { [user.id]: user.username, [targetUserId]: targetUser.username },
    });
    const metaBase64 = unicodeBtoa(meta);

    const channel = await api.createDm({
      target_user_id: targetUserId,
      encrypted_meta: metaBase64,
    });

    mapChannelToPeer(channel.id, targetUserId);

    const { ws } = get();
    if (ws) ws.subscribe(channel.id);

    // Add channel to state WITHOUT changing currentChannelId
    set((state) => {
      const exists = state.channels.some((ch) => ch.id === channel.id);
      return {
        channels: exists ? state.channels : [...state.channels, channel],
        messages: { ...state.messages, [channel.id]: state.messages[channel.id] ?? [] },
      };
    });

    return channel;
  },

  async loadBlockedUsers() {
    const { api } = useAuthStore.getState();
    try {
      const blocked = await api.getBlockedUsers();
      set({ blockedUserIds: blocked.map((b) => b.user_id) });
    } catch {
      // Non-fatal
    }
  },

  navigateUnread(direction) {
    const { channels, currentChannelId, unreadCounts } = get();
    const selectedServerId = useUiStore.getState().selectedServerId;

    // Filter to text channels in the current server (or DMs if no server selected)
    const relevantChannels = channels.filter((ch) =>
      selectedServerId
        ? ch.server_id === selectedServerId && ch.channel_type !== "voice"
        : ch.server_id === null,
    );

    if (relevantChannels.length === 0) return;

    const currentIdx = relevantChannels.findIndex((ch) => ch.id === currentChannelId);

    // Find channels with unreads
    const unreadChannels = relevantChannels
      .map((ch, idx) => ({ ch, idx }))
      .filter(({ ch }) => (unreadCounts[ch.id] ?? 0) > 0);

    if (unreadChannels.length === 0) return;

    let target: typeof unreadChannels[0] | undefined;

    if (direction === "down") {
      // Find the next unread channel after current index
      target = unreadChannels.find(({ idx }) => idx > currentIdx);
      // Wrap around
      if (!target) target = unreadChannels[0];
    } else {
      // Find the previous unread channel before current index
      target = [...unreadChannels].reverse().find(({ idx }) => idx < currentIdx);
      // Wrap around
      if (!target) target = unreadChannels[unreadChannels.length - 1];
    }

    if (target) {
      get().selectChannel(target.ch.id);
    }
  },

  async refreshPermissions(serverId) {
    const { api } = useAuthStore.getState();
    try {
      const result = await api.getMyPermissions(serverId);
      set((state) => ({
        myPermissions: {
          ...state.myPermissions,
          [serverId]: BigInt(result.permissions),
        },
      }));
    } catch {
      // Non-fatal
    }
  },

  async fetchContentFilters(serverId) {
    const { api } = useAuthStore.getState();
    try {
      const filters = await api.listContentFilters(serverId);
      set((state) => ({
        contentFilters: { ...state.contentFilters, [serverId]: filters },
      }));
    } catch {
      // Non-fatal — filters just won't be applied
    }
  },

  checkContentFilter(serverId, plaintext) {
    const filters = get().contentFilters[serverId];
    if (!filters || filters.length === 0) return null;

    for (const filter of filters) {
      try {
        let matches = false;
        if (filter.filter_type === "regex") {
          const re = new RegExp(filter.pattern, "i");
          matches = re.test(plaintext);
        } else {
          matches = plaintext.toLowerCase().includes(filter.pattern.toLowerCase());
        }
        if (matches) {
          return { filtered: true, action: filter.action as "hide" | "warn" };
        }
      } catch {
        // Invalid regex — skip
      }
    }
    return null;
  },

  async setChannelTtl(channelId, messageTtl) {
    const { api } = useAuthStore.getState();
    try {
      await api.setChannelTtl(channelId, messageTtl);
      // Optimistically update local state (server also broadcasts ChannelSettingsUpdated)
      set((state) => ({
        channels: state.channels.map((ch) =>
          ch.id === channelId ? { ...ch, message_ttl: messageTtl } : ch,
        ),
      }));
    } catch (err) {
      console.error("[setChannelTtl] Failed:", err);
    }
  },
});
