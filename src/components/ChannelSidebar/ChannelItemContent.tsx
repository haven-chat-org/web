import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "../../store/chat.js";
import { useUiStore } from "../../store/ui.js";
import { useVoiceStore } from "../../store/voice.js";
import type { ChannelResponse } from "@haven-chat-org/core";
import { parseChannelName } from "../../lib/channel-utils.js";
import VoiceChannelPreview from "../VoiceChannelPreview.js";

export default function ChannelItemContent({ ch, isOverlay, onContextMenu }: { ch: ChannelResponse; isOverlay?: boolean; onContextMenu?: (e: React.MouseEvent, chId: string) => void }) {
  const { t } = useTranslation();
  const currentChannelId = useChatStore((s) => s.currentChannelId);
  const selectChannel = useChatStore((s) => s.selectChannel);
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const mentionCounts = useChatStore((s) => s.mentionCounts);
  const isChannelMuted = useUiStore((s) => s.isChannelMuted);
  const channelNotifications = useUiStore((s) => s.channelNotifications);

  const isVoice = ch.channel_type === "voice";
  const muted = isChannelMuted(ch.id);
  const notifySetting = channelNotifications[ch.id] ?? "default";
  const rawUnread = unreadCounts[ch.id] ?? 0;
  const rawMentions = mentionCounts[ch.id] ?? 0;

  // Suppress indicators based on mute/notification settings
  const showUnreadDot = !muted && notifySetting !== "nothing" && notifySetting !== "mentions" && rawUnread > 0;
  const unread = muted || notifySetting === "nothing" ? 0 : rawUnread;
  const mentions = muted || notifySetting === "nothing" ? 0 : rawMentions;
  const voiceCurrentChannel = useVoiceStore.getState().currentChannelId;
  const isInThisVoice = voiceCurrentChannel === ch.id;

  const handleChannelClick = useCallback(() => {
    if (isVoice) {
      selectChannel(ch.id);
      if (!isInThisVoice) {
        useVoiceStore.getState().joinVoice(ch.id);
      }
    } else {
      selectChannel(ch.id);
    }
  }, [ch.id, isVoice, isInThisVoice, selectChannel]);

  return (
    <>
      <button
        className={`channel-item ${ch.id === currentChannelId ? "active" : ""} ${unread > 0 ? "unread" : ""} ${muted || notifySetting === "nothing" ? "muted" : ""} ${isInThisVoice ? "voice-active" : ""} ${isOverlay ? "drag-overlay" : ""}`}
        onClick={isOverlay ? undefined : handleChannelClick}
        onContextMenu={onContextMenu ? (e) => onContextMenu(e, ch.id) : undefined}
        data-roving-item
        tabIndex={ch.id === currentChannelId ? 0 : -1}
      >
        {showUnreadDot && mentions === 0 && unread > 0 && <span className="channel-unread-dot" />}
        {isVoice ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill={isInThisVoice ? "var(--green)" : "currentColor"} className="channel-type-icon">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        ) : ch.is_private ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="channel-type-icon" aria-label={t("channelSidebar.channel.privateAriaLabel")}>
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
          </svg>
        ) : (
          <span className="channel-hash">#</span>
        )}
        {parseChannelName(ch.encrypted_meta)}
        {muted && (
          <>
            <svg className="channel-muted-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M16.5 12A4.5 4.5 0 0 0 14 8.27V6.11l-4-4L8.59 3.52 20.48 15.41 21.89 14l-5.39-5.39V12zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.9 8.9 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            </svg>
            <span className="sr-only">{t("channelSidebar.channel.muted")}</span>
          </>
        )}
        {mentions > 0
          ? <span className="unread-badge" aria-label={`${mentions} mentions`}>{mentions}</span>
          : unread > 0 && !muted && notifySetting !== "nothing"
            ? <span className="unread-badge unread-badge-muted" aria-label={`${unread} unread messages`}>{unread}</span>
            : null}
      </button>
      {!isOverlay && isVoice && ch.server_id && <VoiceChannelPreview channelId={ch.id} serverId={ch.server_id} />}
    </>
  );
}
