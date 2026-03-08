import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "../../store/chat.js";
import { useAuthStore } from "../../store/auth.js";
import { useUiStore } from "../../store/ui.js";
import { usePresenceStore } from "../../store/presence.js";
import { useFriendsStore } from "../../store/friends.js";
import { useRovingTabindex } from "../../hooks/useRovingTabindex.js";
import {
  parseDmPeerId,
  parseDmDisplayName,
  parseGroupName,
  parseGroupMemberCount,
} from "../../lib/channel-utils.js";
import { STATUS_CONFIG } from "../../store/presence.js";
import CreateGroupDm from "../CreateGroupDm.js";
import DmContextMenu from "./DmContextMenu.js";

export default function DmView() {
  const { t } = useTranslation();
  const channels = useChatStore((s) => s.channels);
  const currentChannelId = useChatStore((s) => s.currentChannelId);
  const selectChannel = useChatStore((s) => s.selectChannel);
  const startDm = useChatStore((s) => s.startDm);
  const user = useAuthStore((s) => s.user);
  const presenceStatuses = usePresenceStore((s) => s.statuses);
  const fetchPresence = usePresenceStore((s) => s.fetchPresence);
  const dmRequests = useFriendsStore((s) => s.dmRequests);
  const loadDmRequests = useFriendsStore((s) => s.loadDmRequests);
  const showFriends = useUiStore((s) => s.showFriends);
  const setShowFriends = useUiStore((s) => s.setShowFriends);
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const mentionCounts = useChatStore((s) => s.mentionCounts);
  const typingUsers = useChatStore((s) => s.typingUsers);

  const [showCreateDm, setShowCreateDm] = useState(false);
  const [error, setError] = useState("");
  const [headerSearch, setHeaderSearch] = useState(false);
  const [headerSearchValue, setHeaderSearchValue] = useState("");
  const [dmCtx, setDmCtx] = useState<{ channelId: string; channelType: string; x: number; y: number } | null>(null);

  const dmListRef = useRef<HTMLDivElement>(null);
  const { handleKeyDown: handleDmRovingKeyDown } = useRovingTabindex(dmListRef);

  const allDmChannels = channels.filter(
    (ch) => (ch.channel_type === "dm" || ch.channel_type === "group") && ch.dm_status !== "pending"
  );
  const dmChannels = headerSearchValue
    ? allDmChannels.filter((ch) => {
        const name = ch.channel_type === "group"
          ? parseGroupName(ch.encrypted_meta, user?.id ?? "").toLowerCase()
          : parseDmDisplayName(ch.encrypted_meta, user?.id ?? "").toLowerCase();
        return name.includes(headerSearchValue.toLowerCase());
      })
    : allDmChannels;
  const pendingCount = dmRequests.length;

  // Load DM requests on mount
  useEffect(() => {
    loadDmRequests();
  }, []);

  // Fetch initial presence for DM peers
  useEffect(() => {
    if (!user || allDmChannels.length === 0) return;
    const peerIds = allDmChannels
      .map((ch) => parseDmPeerId(ch.encrypted_meta, user.id))
      .filter((id): id is string => id !== null);
    if (peerIds.length > 0) fetchPresence(peerIds);
  }, [allDmChannels.length, user?.id]);

  async function handleStartDm(username: string) {
    if (!username) return;
    setError("");
    try {
      await startDm(username);
      setHeaderSearch(false);
      setHeaderSearchValue("");
    } catch (err: any) {
      setError(err.message || "Failed");
    }
  }

  return (
    <>
      <div className="channel-sidebar-header">
        {headerSearch ? (
          <input
            className="channel-sidebar-header-input"
            type="text"
            placeholder={t("channelSidebar.dm.findOrStart")}
            aria-label={t("channelSidebar.dm.findOrStart")}
            value={headerSearchValue}
            onChange={(e) => setHeaderSearchValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setHeaderSearch(false);
                setHeaderSearchValue("");
              }
              if (e.key === "Enter" && headerSearchValue.trim()) {
                // If no matching DM, start a new one
                if (dmChannels.length === 0) {
                  handleStartDm(headerSearchValue.trim());
                }
              }
            }}
            onBlur={() => {
              if (!headerSearchValue) {
                setHeaderSearch(false);
              }
            }}
            autoFocus
          />
        ) : (
          <button
            className="channel-sidebar-header-btn"
            onClick={() => setHeaderSearch(true)}
          >
            {t("channelSidebar.dm.findOrStart")}
          </button>
        )}
      </div>
      <div className="channel-sidebar-content" ref={dmListRef} onKeyDown={handleDmRovingKeyDown}>
        {/* Friends Button */}
        <button
          className={`friends-nav-btn ${showFriends ? "active" : ""}`}
          onClick={() => setShowFriends(true)}
          data-roving-item
          tabIndex={showFriends ? 0 : -1}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14 8.01c0 2.21-1.79 4-4 4s-4-1.79-4-4 1.79-4 4-4 4 1.79 4 4zm-4 6c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm9-3v-3h-2v3h-3v2h3v3h2v-3h3v-2h-3z" />
          </svg>
          <span>{t("channelSidebar.dm.friends")}</span>
        </button>

        {/* Message Requests */}
        {pendingCount > 0 && (
          <div className="channel-category-header">
            <span>{t("channelSidebar.dm.messageRequests")}</span>
            <span className="request-badge">{pendingCount}</span>
          </div>
        )}

        {pendingCount > 0 && (
          <ul className="channel-list">
            {dmRequests.map((ch) => (
              <li key={ch.id}>
                <button
                  className={`channel-item dm-item pending ${ch.id === currentChannelId ? "active" : ""}`}
                  onClick={() => { selectChannel(ch.id); setShowFriends(false); }}
                  data-roving-item
                  tabIndex={!showFriends && ch.id === currentChannelId ? 0 : -1}
                >
                  <div className="dm-avatar pending">
                    {parseDmDisplayName(ch.encrypted_meta, user?.id ?? "").charAt(0).toUpperCase()}
                  </div>
                  <span className="dm-item-name">
                    {parseDmDisplayName(ch.encrypted_meta, user?.id ?? "")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="channel-category-header">
          <span>{t("channelSidebar.dm.directMessages")}</span>
          <button
            className="btn-icon"
            onClick={() => setShowCreateDm(true)}
            title={t("channelSidebar.dm.createDmTitle")}
            aria-label={t("channelSidebar.dm.createDmAriaLabel")}
          >
            +
          </button>
        </div>

        <ul className="channel-list">
          {dmChannels.map((ch) => {
            if (ch.channel_type === "group") {
              const gName = parseGroupName(ch.encrypted_meta, user?.id ?? "");
              const memberCount = parseGroupMemberCount(ch.encrypted_meta);
              const unread = unreadCounts[ch.id] ?? 0;
              const grpTyping = (typingUsers[ch.id] ?? []).filter((t) => t.expiry > Date.now());
              const grpIsTyping = grpTyping.length > 0;
              // Use the first typing user's presence color for group typing indicator
              const grpTypingUserId = grpIsTyping ? grpTyping[0].userId : null;
              const grpTypingStatus = grpTypingUserId ? (presenceStatuses[grpTypingUserId] ?? "online") : "online";
              const grpTypingColor = grpIsTyping ? STATUS_CONFIG[grpTypingStatus]?.color ?? "var(--text-muted)" : undefined;
              return (
                <li key={ch.id}>
                  <button
                    className={`channel-item dm-item ${ch.id === currentChannelId ? "active" : ""} ${unread > 0 ? "unread" : ""}`}
                    onClick={() => { selectChannel(ch.id); setShowFriends(false); setHeaderSearch(false); setHeaderSearchValue(""); }}
                    onContextMenu={(e) => { e.preventDefault(); setDmCtx({ channelId: ch.id, channelType: "group", x: e.clientX, y: e.clientY }); }}
                    data-roving-item
                    tabIndex={!showFriends && ch.id === currentChannelId ? 0 : -1}
                  >
                    <div className="dm-avatar group-dm-avatar">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                      </svg>
                      {grpIsTyping && (
                        <span className="dm-avatar-typing" aria-label="Typing" style={{ "--typing-color": grpTypingColor } as React.CSSProperties}>
                          <span /><span /><span />
                        </span>
                      )}
                    </div>
                    <div className="dm-item-text">
                      <span className="dm-item-name">{gName}</span>
                      {memberCount > 0 && (
                        <span className="dm-item-members">{memberCount} {t("channelSidebar.dm.members")}</span>
                      )}
                    </div>
                    {unread > 0 && <span className="unread-badge" aria-label={`${unread} unread messages`}>{unread}</span>}
                  </button>
                </li>
              );
            }
            const peerId = parseDmPeerId(ch.encrypted_meta, user?.id ?? "");
            const peerStatus = peerId ? (presenceStatuses[peerId] ?? "offline") : "offline";
            const isActive = peerStatus !== "offline" && peerStatus !== "invisible";
            const unread = unreadCounts[ch.id] ?? 0;
            const chTyping = (typingUsers[ch.id] ?? []).filter((t) => t.expiry > Date.now());
            const isTyping = chTyping.length > 0;
            const typingColor = isTyping ? STATUS_CONFIG[peerStatus]?.color ?? "var(--text-muted)" : undefined;
            return (
              <li key={ch.id}>
                <button
                  className={`channel-item dm-item ${ch.id === currentChannelId ? "active" : ""} ${unread > 0 ? "unread" : ""}`}
                  onClick={() => { selectChannel(ch.id); setShowFriends(false); setHeaderSearch(false); setHeaderSearchValue(""); }}
                  onContextMenu={(e) => { e.preventDefault(); setDmCtx({ channelId: ch.id, channelType: "dm", x: e.clientX, y: e.clientY }); }}
                  data-roving-item
                  tabIndex={!showFriends && ch.id === currentChannelId ? 0 : -1}
                >
                  <div className="dm-avatar">
                    {parseDmDisplayName(ch.encrypted_meta, user?.id ?? "").charAt(0).toUpperCase()}
                    {isTyping ? (
                      <span className="dm-avatar-typing" aria-label="Typing" style={{ "--typing-color": typingColor } as React.CSSProperties}>
                        <span /><span /><span />
                      </span>
                    ) : (
                      <span className={`dm-avatar-status ${isActive ? "online" : "offline"}`} aria-label={isActive ? "Online" : "Offline"} />
                    )}
                  </div>
                  <span className="dm-item-name">
                    {parseDmDisplayName(ch.encrypted_meta, user?.id ?? "")}
                  </span>
                  {unread > 0 && <span className="unread-badge" aria-label={`${unread} unread messages`}>{unread}</span>}
                </button>
              </li>
            );
          })}
          {headerSearchValue && dmChannels.length === 0 && (
            <li>
              <button
                className="channel-item dm-item start-dm-item"
                onClick={() => handleStartDm(headerSearchValue.trim())}
                data-roving-item
                tabIndex={-1}
              >
                <span className="dm-item-name">{t("channelSidebar.dm.startDmWith")} <strong>{headerSearchValue.trim()}</strong></span>
              </button>
            </li>
          )}
        </ul>
        {error && <div className="error-small" style={{ padding: "0 12px" }}>{error}</div>}
      </div>

      {showCreateDm && (
        <CreateGroupDm onClose={() => setShowCreateDm(false)} />
      )}

      {dmCtx && (
        <DmContextMenu
          channelId={dmCtx.channelId}
          channelType={dmCtx.channelType}
          x={dmCtx.x}
          y={dmCtx.y}
          onClose={() => setDmCtx(null)}
        />
      )}
    </>
  );
}
