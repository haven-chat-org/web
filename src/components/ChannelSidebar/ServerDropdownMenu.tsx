import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useUiStore } from "../../store/ui.js";
import { useMenuKeyboard } from "../../hooks/useMenuKeyboard.js";
import { useContextMenuPosition } from "../../hooks/useContextMenuPosition.js";

export default function ServerDropdownMenu({
  anchorRect,
  onInvite,
  onSettings,
  onCreateChannel,
  onCreateCategory,
  onLeave,
  canCreateInvites,
  canManageServer,
  canManageChannels,
  isOwner,
  onClose,
}: {
  anchorRect: DOMRect;
  onInvite: () => void;
  onSettings: () => void;
  onCreateChannel: () => void;
  onCreateCategory: () => void;
  onLeave: () => void;
  canCreateInvites: boolean;
  canManageServer: boolean;
  canManageChannels: boolean;
  isOwner: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const { handleKeyDown } = useMenuKeyboard(menuRef);
  const menuStyle = useContextMenuPosition(menuRef, anchorRect.left, anchorRect.bottom + 4);

  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="channel-context-menu"
      style={menuStyle}
      role="menu"
      aria-label={t("channelSidebar.server.contextMenu.ariaLabel")}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      {canCreateInvites && (
        <button role="menuitem" tabIndex={-1} onClick={() => { onClose(); onInvite(); }}>
          {t("channelSidebar.server.dropdown.invitePeople")}
        </button>
      )}
      {canManageServer && (
        <button role="menuitem" tabIndex={-1} onClick={() => { onClose(); onSettings(); }}>
          {t("channelSidebar.server.dropdown.serverSettings")}
        </button>
      )}
      {(canCreateInvites || canManageServer) && canManageChannels && (
        <div className="context-menu-divider" />
      )}
      {canManageChannels && (
        <button role="menuitem" tabIndex={-1} onClick={() => { onClose(); onCreateChannel(); }}>
          {t("channelSidebar.server.dropdown.createChannel")}
        </button>
      )}
      {canManageChannels && (
        <button role="menuitem" tabIndex={-1} onClick={() => { onClose(); onCreateCategory(); }}>
          {t("channelSidebar.server.dropdown.createCategory")}
        </button>
      )}
      <div className="context-menu-divider" />
      <button role="menuitem" tabIndex={-1} onClick={() => {
        const serverId = useUiStore.getState().selectedServerId;
        if (serverId) useUiStore.getState().openExportModal({ type: "server", id: serverId });
        onClose();
      }}>
        {t("export.trigger.exportServer")}
      </button>
      <div className="context-menu-divider" />
      <button role="menuitem" tabIndex={-1} className="context-menu-item-danger" onClick={() => { onClose(); onLeave(); }}>
        {t("channelSidebar.server.dropdown.leaveServer")}
      </button>
    </div>
  );
}
