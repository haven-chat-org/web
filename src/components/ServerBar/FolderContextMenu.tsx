import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useMenuKeyboard } from "../../hooks/useMenuKeyboard.js";
import type { ServerFolder } from "./helpers.js";

interface FolderContextMenuProps {
  x: number;
  y: number;
  folder: ServerFolder;
  onEdit: () => void;
  onDelete: () => void;
}

export default function FolderContextMenu({
  x,
  y,
  folder,
  onEdit,
  onDelete,
}: FolderContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const { handleKeyDown } = useMenuKeyboard(menuRef);

  return (
    <div
      ref={menuRef}
      className="channel-context-menu"
      style={{ top: y, left: x }}
      role="menu"
      aria-label={t("serverBar.folderContextMenu.ariaLabel")}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <button role="menuitem" tabIndex={-1} className="context-menu-item" onClick={onEdit}>
        {t("serverBar.folderContextMenu.editFolder")}
      </button>
      <button role="menuitem" tabIndex={-1} className="context-menu-item-danger" onClick={onDelete}>
        {t("serverBar.folderContextMenu.deleteFolder")}
      </button>
    </div>
  );
}
