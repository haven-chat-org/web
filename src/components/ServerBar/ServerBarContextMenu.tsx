import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMenuKeyboard } from "../../hooks/useMenuKeyboard.js";
import { useUiStore } from "../../store/ui.js";
import type { ServerFolder } from "./helpers.js";

const SERVER_MUTE_DURATIONS: { key: string; ms: number | null }[] = [
  { key: "15min", ms: 15 * 60 * 1000 },
  { key: "1hour", ms: 60 * 60 * 1000 },
  { key: "3hours", ms: 3 * 60 * 60 * 1000 },
  { key: "8hours", ms: 8 * 60 * 60 * 1000 },
  { key: "24hours", ms: 24 * 60 * 60 * 1000 },
  { key: "untilTurnOff", ms: null },
];

const SERVER_NOTIFICATION_OPTIONS: { key: string; value: "default" | "all" | "mentions" | "nothing"; descKey?: string }[] = [
  { key: "useDefault", value: "default", descKey: "onlyMentions" },
  { key: "allMessages", value: "all" },
  { key: "onlyMentions", value: "mentions" },
  { key: "nothing", value: "nothing" },
];

interface ServerBarContextMenuProps {
  x: number;
  y: number;
  serverId: string;
  isOwner: boolean;
  folders: ServerFolder[];
  currentFolderId: string | null;
  onLeave: () => void;
  onDelete: () => void;
  onCreateFolder: () => void;
  onAddToFolder: (folderId: string) => void;
  onRemoveFromFolder: () => void;
  onClose: () => void;
}

export default function ServerBarContextMenu({
  x,
  y,
  serverId,
  isOwner,
  folders,
  currentFolderId,
  onLeave,
  onDelete,
  onCreateFolder,
  onAddToFolder,
  onRemoveFromFolder,
  onClose,
}: ServerBarContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const { handleKeyDown } = useMenuKeyboard(menuRef);
  const [submenu, setSubmenu] = useState<"notify" | "mute" | undefined>(undefined);
  const serverNotifications = useUiStore((s) => s.serverNotifications);
  const setServerNotification = useUiStore((s) => s.setServerNotification);
  const muteServer = useUiStore((s) => s.muteServer);
  const unmuteServer = useUiStore((s) => s.unmuteServer);
  const isServerMuted = useUiStore((s) => s.isServerMuted);
  const muted = isServerMuted(serverId);
  const currentNotify = serverNotifications[serverId] ?? "default";
  const notifyLabel = t(`serverBar.contextMenu.notification.${SERVER_NOTIFICATION_OPTIONS.find((o) => o.value === currentNotify)?.key ?? "useDefault"}`);

  return (
    <div
      ref={menuRef}
      className="channel-context-menu"
      style={{ top: y, left: x }}
      role="menu"
      aria-label={t("serverBar.contextMenu.ariaLabel")}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Mute Server */}
      <div
        className="context-submenu-trigger"
        onMouseEnter={() => setSubmenu("mute")}
      >
        {muted ? (
          <button role="menuitem" tabIndex={-1} onClick={() => { unmuteServer(serverId); onClose(); }}>
            {t("serverBar.contextMenu.unmuteServer")}
          </button>
        ) : (
          <>
            <button role="menuitem" tabIndex={-1} onClick={(e) => {
              e.stopPropagation();
              setSubmenu(submenu === "mute" ? undefined : "mute");
            }}>
              <span>{t("serverBar.contextMenu.muteServer")}</span>
              <span className="context-submenu-arrow">&rsaquo;</span>
            </button>
            {submenu === "mute" && (
              <div className="context-submenu" onMouseLeave={() => setSubmenu(undefined)}>
                {SERVER_MUTE_DURATIONS.map((d) => (
                  <button
                    key={d.key}
                    onClick={() => {
                      muteServer(serverId, d.ms);
                      onClose();
                    }}
                  >
                    {t(`serverBar.contextMenu.muteDuration.${d.key}`)}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Notification Settings */}
      <div
        className="context-submenu-trigger"
        onMouseEnter={() => setSubmenu("notify")}
      >
        <button role="menuitem" tabIndex={-1} onClick={(e) => {
          e.stopPropagation();
          setSubmenu(submenu === "notify" ? undefined : "notify");
        }}>
          <span className="context-btn-with-sub">
            <span>{t("serverBar.contextMenu.notificationSettings")}</span>
            <span className="context-sub-label">{notifyLabel}</span>
          </span>
          <span className="context-submenu-arrow">&rsaquo;</span>
        </button>
        {submenu === "notify" && (
          <div className="context-submenu" onMouseLeave={() => setSubmenu(undefined)}>
            {SERVER_NOTIFICATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={currentNotify === opt.value ? "active" : ""}
                onClick={() => {
                  setServerNotification(serverId, opt.value);
                  onClose();
                }}
              >
                <span className="context-btn-with-sub">
                  <span>{t(`serverBar.contextMenu.notification.${opt.key}`)}</span>
                  {opt.descKey && <span className="context-sub-label">{t(`serverBar.contextMenu.notification.${opt.descKey}`)}</span>}
                </span>
                <span className={`context-radio ${currentNotify === opt.value ? "context-radio-active" : ""}`} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="context-menu-separator" />

      {currentFolderId ? (
        <button role="menuitem" tabIndex={-1} className="context-menu-item" onClick={onRemoveFromFolder}>
          {t("serverBar.contextMenu.removeFromFolder")}
        </button>
      ) : (
        <>
          <button role="menuitem" tabIndex={-1} className="context-menu-item" onClick={onCreateFolder}>
            {t("serverBar.contextMenu.createFolder")}
          </button>
          {folders.length > 0 && (
            <>
              <div className="context-menu-separator" />
              {folders.map((f) => (
                <button key={f.id} role="menuitem" tabIndex={-1} className="context-menu-item" onClick={() => onAddToFolder(f.id)}>
                  <span className="folder-menu-dot" style={{ backgroundColor: f.color }} />
                  {t("serverBar.contextMenu.addTo", { folderName: f.name })}
                </button>
              ))}
            </>
          )}
        </>
      )}
      <div className="context-menu-separator" />
      <button
        role="menuitem"
        tabIndex={-1}
        className="context-menu-item-danger"
        onClick={onLeave}
      >
        {t("serverBar.contextMenu.leaveServer")}
      </button>
      {isOwner && (
        <button
          role="menuitem"
          tabIndex={-1}
          className="context-menu-item-danger"
          onClick={onDelete}
        >
          {t("serverBar.contextMenu.deleteServer")}
        </button>
      )}
    </div>
  );
}
