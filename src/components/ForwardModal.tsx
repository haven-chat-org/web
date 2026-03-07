import { useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useChatStore } from "../store/chat.js";
import { useAuthStore } from "../store/auth.js";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { parseChannelName, parseDmDisplayName, parseGroupName, parseServerName } from "../lib/channel-utils.js";
import Avatar from "./Avatar.js";

interface ForwardModalProps {
  onClose: () => void;
}

export default function ForwardModal({ onClose }: ForwardModalProps) {
  const { t } = useTranslation();
  const channels = useChatStore((s) => s.channels);
  const servers = useChatStore((s) => s.servers);
  const currentChannelId = useChatStore((s) => s.currentChannelId);
  const forwardMessage = useChatStore((s) => s.forwardMessage);
  const user = useAuthStore((s) => s.user);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);

  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);

  const myId = user?.id ?? "";

  // Group channels: DMs first, then server channels grouped by server
  const { dmChannels, serverGroups } = useMemo(() => {
    const dms = channels.filter(
      (ch) =>
        (ch.channel_type === "dm" || ch.channel_type === "group") &&
        ch.id !== currentChannelId,
    );
    const serverChans = channels.filter(
      (ch) =>
        ch.server_id &&
        ch.channel_type === "text" &&
        ch.id !== currentChannelId,
    );

    // Group server channels by server
    const groups = new Map<string, { name: string; channels: typeof serverChans }>();
    for (const ch of serverChans) {
      const sid = ch.server_id!;
      if (!groups.has(sid)) {
        const server = servers.find((s) => s.id === sid);
        const name = server?.encrypted_meta
          ? parseServerName(server.encrypted_meta)
          : "Server";
        groups.set(sid, { name, channels: [] });
      }
      groups.get(sid)!.channels.push(ch);
    }

    return { dmChannels: dms, serverGroups: groups };
  }, [channels, servers, currentChannelId]);

  // Filter by search
  const lowerSearch = search.toLowerCase();

  const filteredDms = useMemo(() => {
    if (!lowerSearch) return dmChannels;
    return dmChannels.filter((ch) => {
      const name = ch.channel_type === "group"
        ? parseGroupName(ch.encrypted_meta, myId)
        : parseDmDisplayName(ch.encrypted_meta, myId);
      return name.toLowerCase().includes(lowerSearch);
    });
  }, [dmChannels, lowerSearch, myId]);

  const filteredServerGroups = useMemo(() => {
    const result: Array<{ serverId: string; serverName: string; channels: typeof dmChannels }> = [];
    for (const [serverId, group] of serverGroups) {
      const filtered = lowerSearch
        ? group.channels.filter((ch) => {
            const name = parseChannelName(ch.encrypted_meta);
            return name.toLowerCase().includes(lowerSearch) || group.name.toLowerCase().includes(lowerSearch);
          })
        : group.channels;
      if (filtered.length > 0) {
        result.push({ serverId, serverName: group.name, channels: filtered });
      }
    }
    return result;
  }, [serverGroups, lowerSearch]);

  const hasResults = filteredDms.length > 0 || filteredServerGroups.length > 0;

  async function handleSelect(channelId: string) {
    if (sending || sent) return;
    setSending(true);
    setError(false);
    try {
      await forwardMessage(channelId);
      setSent(true);
      setTimeout(onClose, 1000);
    } catch {
      setError(true);
      setSending(false);
    }
  }

  function getChannelDisplayName(ch: typeof channels[0]): string {
    if (ch.channel_type === "group") return parseGroupName(ch.encrypted_meta, myId);
    if (ch.channel_type === "dm") return parseDmDisplayName(ch.encrypted_meta, myId);
    return parseChannelName(ch.encrypted_meta);
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-dialog forward-modal"
        onClick={(e) => e.stopPropagation()}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="forward-modal-title"
      >
        <h3 id="forward-modal-title" className="modal-title">{t("forwardModal.title")}</h3>

        {sent ? (
          <div className="forward-sent-badge">{t("forwardModal.sent")}</div>
        ) : (
          <>
            <input
              type="text"
              className="forward-search"
              placeholder={t("forwardModal.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {error && <p className="forward-error">{t("forwardModal.failed")}</p>}
            <div className="forward-channel-list">
              {filteredDms.length > 0 && (
                <div className="forward-section">
                  <div className="forward-section-label">{t("forwardModal.dmSection")}</div>
                  {filteredDms.map((ch) => {
                    const name = getChannelDisplayName(ch);
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        className="forward-channel-item"
                        onClick={() => handleSelect(ch.id)}
                        disabled={sending}
                      >
                        <Avatar name={name} size={28} />
                        <span className="forward-channel-name">{name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {filteredServerGroups.map((group) => (
                <div className="forward-section" key={group.serverId}>
                  <div className="forward-section-label">{group.serverName}</div>
                  {group.channels.map((ch) => {
                    const name = parseChannelName(ch.encrypted_meta);
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        className="forward-channel-item"
                        onClick={() => handleSelect(ch.id)}
                        disabled={sending}
                      >
                        <span className="forward-channel-hash">#</span>
                        <span className="forward-channel-name">{name}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {!hasResults && (
                <div className="forward-no-results">{t("forwardModal.noResults")}</div>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={onClose}>
                {t("forwardModal.cancel")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
