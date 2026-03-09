import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useMenuKeyboard } from "../../hooks/useMenuKeyboard.js";
import { useContextMenuPosition } from "../../hooks/useContextMenuPosition.js";

export default function ServerHeaderContextMenu({
  x,
  y,
  canManageChannels,
  canCreateInvites,
  hideMutedChannels,
  onCreateChannel,
  onCreateCategory,
  onInvite,
  onToggleHideMuted,
}: {
  x: number;
  y: number;
  canManageChannels: boolean;
  canCreateInvites: boolean;
  hideMutedChannels: boolean;
  onCreateChannel: () => void;
  onCreateCategory: () => void;
  onInvite: () => void;
  onToggleHideMuted: () => void;
}) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const { handleKeyDown } = useMenuKeyboard(menuRef);
  const menuStyle = useContextMenuPosition(menuRef, x, y);

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
      <button role="menuitem" tabIndex={-1} className="context-menu-toggle" onClick={onToggleHideMuted}>
        {t("channelSidebar.server.contextMenu.hideMutedChannels")}
        <span className={`context-menu-check${hideMutedChannels ? " checked" : ""}`} />
      </button>
      {canManageChannels && (
        <>
          <div className="context-menu-separator" />
          <button role="menuitem" tabIndex={-1} onClick={onCreateChannel}>
            {t("channelSidebar.server.contextMenu.createChannel")}
          </button>
          <button role="menuitem" tabIndex={-1} onClick={onCreateCategory}>
            {t("channelSidebar.server.contextMenu.createCategory")}
          </button>
        </>
      )}
      {canCreateInvites && (
        <>
          <div className="context-menu-separator" />
          <button role="menuitem" tabIndex={-1} onClick={onInvite}>
            {t("channelSidebar.server.contextMenu.inviteToServer")}
          </button>
        </>
      )}
    </div>
  );
}
