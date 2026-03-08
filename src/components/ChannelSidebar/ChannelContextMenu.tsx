import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useUiStore } from "../../store/ui.js";
import { useMenuKeyboard } from "../../hooks/useMenuKeyboard.js";
import { useContextMenuPosition } from "../../hooks/useContextMenuPosition.js";

const MUTE_DURATIONS = [
  { key: "15min", ms: 15 * 60 * 1000 },
  { key: "1hour", ms: 60 * 60 * 1000 },
  { key: "3hours", ms: 3 * 60 * 60 * 1000 },
  { key: "8hours", ms: 8 * 60 * 60 * 1000 },
  { key: "24hours", ms: 24 * 60 * 60 * 1000 },
  { key: "untilTurnOff", ms: null as number | null },
];

const NOTIFICATION_OPTIONS: { key: string; value: "default" | "all" | "mentions" | "nothing"; descKey?: string }[] = [
  { key: "useCategoryDefault", value: "default", descKey: "allMessages" },
  { key: "allMessages", value: "all" },
  { key: "onlyMentions", value: "mentions" },
  { key: "nothing", value: "nothing" },
];

export default function ChannelContextMenu({
  channelId,
  x,
  y,
  submenu,
  canManageChannels,
  onPermissions,
  onDelete,
  onShowSubmenu,
  onClose,
}: {
  channelId: string;
  x: number;
  y: number;
  submenu?: "mute" | "notify";
  canManageChannels: boolean;
  onPermissions: () => void;
  onDelete: () => void;
  onShowSubmenu: (sub: "mute" | "notify" | undefined) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const muteChannel = useUiStore((s) => s.muteChannel);
  const unmuteChannel = useUiStore((s) => s.unmuteChannel);
  const isChannelMuted = useUiStore((s) => s.isChannelMuted);
  const setChannelNotification = useUiStore((s) => s.setChannelNotification);
  const channelNotifications = useUiStore((s) => s.channelNotifications);
  const menuRef = useRef<HTMLDivElement>(null);
  const { handleKeyDown } = useMenuKeyboard(menuRef);
  const menuStyle = useContextMenuPosition(menuRef, x, y);

  const muted = isChannelMuted(channelId);
  const currentNotify = channelNotifications[channelId] ?? "default";

  // Notification label for display
  const notifyLabel = t(`channelSidebar.channel.notification.${NOTIFICATION_OPTIONS.find((o) => o.value === currentNotify)?.key ?? "allMessages"}`);

  return (
    <div
      ref={menuRef}
      className="channel-context-menu"
      style={menuStyle}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
      role="menu"
      aria-label={t("channelSidebar.channel.contextMenu.ariaLabel")}
      tabIndex={-1}
    >
      {/* Mute Channel */}
      <div
        className="context-submenu-trigger"
        onMouseEnter={() => onShowSubmenu("mute")}
        onMouseLeave={() => onShowSubmenu(undefined)}
      >
        <button role="menuitem" tabIndex={-1} onClick={(e) => {
          e.stopPropagation();
          if (muted) {
            unmuteChannel(channelId);
            onClose();
          } else {
            onShowSubmenu(submenu === "mute" ? undefined : "mute");
          }
        }}>
          {muted ? t("channelSidebar.channel.contextMenu.unmuteChannel") : t("channelSidebar.channel.contextMenu.muteChannel")}
          {!muted && <span className="context-submenu-arrow">{"\u203A"}</span>}
        </button>
        {submenu === "mute" && !muted && (
          <div className="context-submenu" onMouseLeave={() => onShowSubmenu(undefined)}>
            {MUTE_DURATIONS.map((d) => (
              <button
                key={d.key}
                onClick={() => {
                  muteChannel(channelId, d.ms);
                  onClose();
                }}
              >
                {t(`channelSidebar.channel.muteDuration.${d.key}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Notification Settings */}
      <div
        className="context-submenu-trigger"
        onMouseEnter={() => onShowSubmenu("notify")}
        onMouseLeave={() => onShowSubmenu(undefined)}
      >
        <button role="menuitem" tabIndex={-1} onClick={(e) => {
          e.stopPropagation();
          onShowSubmenu(submenu === "notify" ? undefined : "notify");
        }}>
          <span className="context-btn-with-sub">
            <span>{t("channelSidebar.channel.contextMenu.notificationSettings")}</span>
            <span className="context-sub-label">{notifyLabel}</span>
          </span>
          <span className="context-submenu-arrow">{"\u203A"}</span>
        </button>
        {submenu === "notify" && (
          <div className="context-submenu" onMouseLeave={() => onShowSubmenu(undefined)}>
            {NOTIFICATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={currentNotify === opt.value ? "active" : ""}
                onClick={() => {
                  setChannelNotification(channelId, opt.value);
                  onClose();
                }}
              >
                <span className="context-btn-with-sub">
                  <span>{t(`channelSidebar.channel.notification.${opt.key}`)}</span>
                  {opt.descKey && <span className="context-sub-label">{t(`channelSidebar.channel.notification.${opt.descKey}`)}</span>}
                </span>
                <span className={`context-radio ${currentNotify === opt.value ? "context-radio-active" : ""}`} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Export */}
      <div className="context-divider" role="separator" />
      <button role="menuitem" tabIndex={-1} onClick={() => {
        useUiStore.getState().openExportModal({ type: "channel", id: channelId });
        onClose();
      }}>{t("export.trigger.exportChannel")}</button>
      <button role="menuitem" tabIndex={-1} onClick={() => {
        useUiStore.getState().openAttachmentsModal({ type: "channel", id: channelId });
        onClose();
      }}>{t("attachments.trigger.downloadAttachments")}</button>

      {/* Admin-only items */}
      {canManageChannels && (
        <>
          <div className="context-divider" role="separator" />
          <button role="menuitem" tabIndex={-1} onClick={onPermissions}>{t("channelSidebar.channel.contextMenu.editChannel")}</button>
          <button role="menuitem" tabIndex={-1} className="danger" onClick={onDelete}>{t("channelSidebar.channel.contextMenu.deleteChannel")}</button>
        </>
      )}
    </div>
  );
}
