import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "../../store/chat.js";
import { useAuthStore } from "../../store/auth.js";
import { useUiStore } from "../../store/ui.js";
import { useMenuKeyboard } from "../../hooks/useMenuKeyboard.js";
import { useContextMenuPosition } from "../../hooks/useContextMenuPosition.js";

export default function DmContextMenu({ channelId, channelType, x, y, onClose }: {
  channelId: string;
  channelType: string;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const ws = useChatStore((s) => s.ws);
  const api = useAuthStore((s) => s.api);
  const loadChannels = useChatStore((s) => s.loadChannels);
  const currentChannelId = useChatStore((s) => s.currentChannelId);
  const channels = useChatStore((s) => s.channels);
  const { handleKeyDown } = useMenuKeyboard(ref);

  // Export consent state — sync from store when other participant toggles
  const channel = channels.find((c) => c.id === channelId);
  const [exportAllowed, setExportAllowed] = useState(channel?.export_allowed ?? true);
  useEffect(() => {
    if (channel) setExportAllowed(channel.export_allowed);
  }, [channel?.export_allowed]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const style = useContextMenuPosition(ref, x, y);

  return (
    <div className="message-context-menu" style={style} ref={ref} role="menu" aria-label={t("channelSidebar.dm.contextMenu.ariaLabel")} tabIndex={-1} onKeyDown={handleKeyDown}>
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        className="context-menu-item"
        onClick={() => {
          if (ws) try { ws.markRead(channelId); } catch { /* */ }
          useChatStore.setState((s) => {
            const { [channelId]: _, ...rest } = s.unreadCounts;
            const { [channelId]: __, ...restM } = s.mentionCounts;
            return { unreadCounts: rest, mentionCounts: restM };
          });
          onClose();
        }}
      >
        {t("channelSidebar.dm.contextMenu.markAsRead")}
      </button>
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        className="context-menu-item"
        onClick={async () => {
          const newVal = !exportAllowed;
          setExportAllowed(newVal);
          try { await api.setExportConsent(channelId, newVal); } catch { setExportAllowed(!newVal); }
        }}
      >
        <span className="context-menu-toggle">
          <span>{t("export.consent.toggle")}</span>
          <span className={`context-toggle-indicator ${exportAllowed ? "active" : ""}`} />
        </span>
      </button>
      <div className="context-menu-separator" role="separator" />
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        className="context-menu-item"
        onClick={() => {
          useUiStore.getState().openExportModal({ type: "dm", id: channelId });
          onClose();
        }}
      >
        {t("export.trigger.exportDm")}
      </button>
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        className="context-menu-item"
        onClick={() => {
          useUiStore.getState().openAttachmentsModal({ type: "dm", id: channelId });
          onClose();
        }}
      >
        {t("attachments.trigger.downloadAttachments")}
      </button>
      <div className="context-menu-separator" role="separator" />
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        className="context-menu-item context-menu-item-danger"
        onClick={async () => {
          try {
            if (channelType === "group") {
              await api.leaveChannel(channelId);
            } else {
              await api.hideChannel(channelId);
            }
            if (currentChannelId === channelId) {
              useChatStore.setState({ currentChannelId: null });
              useUiStore.getState().selectServer(null);
            }
            await loadChannels();
          } catch { /* */ }
          onClose();
        }}
      >
        {channelType === "group" ? t("channelSidebar.dm.contextMenu.leaveGroup") : t("channelSidebar.dm.contextMenu.closeDm")}
      </button>
    </div>
  );
}
