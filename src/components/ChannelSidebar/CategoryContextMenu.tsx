import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useMenuKeyboard } from "../../hooks/useMenuKeyboard.js";
import { useContextMenuPosition } from "../../hooks/useContextMenuPosition.js";

export default function CategoryContextMenuPopup({
  x,
  y,
  onCreateChannel,
  onRenameCategory,
  onCreateCategory,
  onDeleteCategory,
}: {
  x: number;
  y: number;
  onCreateChannel: () => void;
  onRenameCategory: () => void;
  onCreateCategory: () => void;
  onDeleteCategory: () => void;
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
      aria-label={t("channelSidebar.category.contextMenu.ariaLabel")}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <button role="menuitem" tabIndex={-1} onClick={onCreateChannel}>
        {t("channelSidebar.category.contextMenu.createChannel")}
      </button>
      <button role="menuitem" tabIndex={-1} onClick={onRenameCategory}>
        {t("channelSidebar.category.contextMenu.renameCategory")}
      </button>
      <button role="menuitem" tabIndex={-1} onClick={onCreateCategory}>
        {t("channelSidebar.category.contextMenu.createCategory")}
      </button>
      <button role="menuitem" tabIndex={-1} className="danger" onClick={onDeleteCategory}>
        {t("channelSidebar.category.contextMenu.deleteCategory")}
      </button>
    </div>
  );
}
