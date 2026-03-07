import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { useAuthStore } from "../store/auth.js";
import { usePresenceStore, STATUS_CONFIG, type PresenceStatus } from "../store/presence.js";
import { useUiStore } from "../store/ui.js";
import Avatar from "./Avatar.js";

const STATUS_OPTIONS: PresenceStatus[] = ["online", "idle", "dnd", "invisible"];

const STATUS_DESCRIPTIONS: Partial<Record<PresenceStatus, string>> = {
  dnd: "userPanelPopup.dndDescription",
  invisible: "userPanelPopup.invisibleDescription",
};

interface UserPanelPopupProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onEditCustomStatus: () => void;
}

export default function UserPanelPopup({ anchorRef, onClose, onEditCustomStatus }: UserPanelPopupProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const ownStatus = usePresenceStore((s) => s.ownStatus);
  const setOwnStatus = usePresenceStore((s) => s.setOwnStatus);
  const setShowUserSettings = useUiStore((s) => s.setShowUserSettings);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);

  const statusConfig = STATUS_CONFIG[ownStatus] || STATUS_CONFIG.online;

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({
        left: rect.left,
        bottom: window.innerHeight - rect.top + 8,
      });
    }
  }, [anchorRef]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      // Ignore clicks inside the popup itself or on the anchor (toggle handled there)
      if (ref.current && !ref.current.contains(target) &&
          !(anchorRef.current && anchorRef.current.contains(target))) {
        onClose();
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showStatusMenu) {
          setShowStatusMenu(false);
          return;
        }
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose, showStatusMenu]);

  if (!user || !pos) return null;

  const displayName = user.display_name || user.username;

  const handleCopyId = () => {
    navigator.clipboard.writeText(user.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEditProfile = () => {
    setShowUserSettings(true, "profile");
    onClose();
  };

  const handleSetCustomStatus = () => {
    onEditCustomStatus();
    onClose();
  };

  return createPortal(
    <div
      className="user-panel-popup"
      ref={ref}
      style={{ left: pos.left, bottom: pos.bottom }}
      role="dialog"
      aria-label={t("userPanelPopup.ariaLabel")}
    >
      {/* Banner */}
      <div
        className={`profile-popup-banner${user.banner_url ? " has-image" : ""}`}
        style={user.banner_url ? { backgroundImage: `url(${user.banner_url})` } : undefined}
      />

      {/* Avatar */}
      <div className="profile-popup-avatar-row">
        <div className="profile-popup-avatar-wrap">
          <Avatar
            avatarUrl={user.avatar_url}
            name={displayName}
            size={72}
            className="profile-popup-avatar"
          />
          <span
            className="profile-popup-presence-dot"
            style={{ backgroundColor: statusConfig.color }}
            aria-label={statusConfig.label}
          />
        </div>
      </div>

      <div className="profile-popup-body">
        {/* Names */}
        <div className="profile-popup-names">
          <span className="profile-popup-displayname">{displayName}</span>
          <span className="profile-popup-username">{user.username}</span>
        </div>

        {/* Custom status */}
        {user.custom_status && (
          <div className="profile-popup-status">
            {user.custom_status_emoji && (
              <span className="profile-popup-status-emoji">{user.custom_status_emoji}</span>
            )}
            {user.custom_status}
          </div>
        )}

        {/* About me */}
        {user.about_me && (
          <div className="profile-popup-section">
            <div className="profile-popup-section-label">{t("profile.sectionAboutMe")}</div>
            <div className="profile-popup-about">{user.about_me}</div>
          </div>
        )}

        {/* Actions list */}
        <div className="user-panel-popup-actions">
          {/* Edit Profile */}
          <button className="user-panel-popup-item" onClick={handleEditProfile}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
            </svg>
            <span>{t("userPanelPopup.editProfile")}</span>
          </button>

          {/* Set Custom Status */}
          <button className="user-panel-popup-item" onClick={handleSetCustomStatus}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
            </svg>
            <span>{user.custom_status ? t("userPanelPopup.editCustomStatus") : t("userPanelPopup.setCustomStatus")}</span>
          </button>

          <div className="user-panel-popup-divider" />

          {/* Status row with submenu */}
          <div className="user-panel-popup-status-wrap" ref={statusMenuRef}>
            <button
              className="user-panel-popup-item"
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              aria-expanded={showStatusMenu}
            >
              <span className="status-dot" style={{ backgroundColor: statusConfig.color }} />
              <span>{statusConfig.label}</span>
              <svg
                className={`user-panel-popup-chevron${showStatusMenu ? " open" : ""}`}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              </svg>
            </button>
            {showStatusMenu && (
              <div className="user-panel-popup-status-menu" role="listbox" aria-label={t("statusSelector.ariaLabel")}>
                {STATUS_OPTIONS.map((status) => {
                  const config = STATUS_CONFIG[status];
                  const descKey = STATUS_DESCRIPTIONS[status];
                  return (
                    <button
                      key={status}
                      role="option"
                      aria-selected={status === ownStatus}
                      className={`user-panel-popup-status-item ${status === ownStatus ? "active" : ""}`}
                      onClick={() => {
                        setOwnStatus(status);
                        setShowStatusMenu(false);
                      }}
                    >
                      <span className="status-dot" style={{ backgroundColor: config.color }} />
                      <div className="user-panel-popup-status-info">
                        <span className="user-panel-popup-status-label">{config.label}</span>
                        {descKey && (
                          <span className="user-panel-popup-status-desc">{t(descKey)}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="user-panel-popup-divider" />

          {/* Copy User ID */}
          <button className="user-panel-popup-item" onClick={handleCopyId}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
            </svg>
            <span>{copied ? t("userPanelPopup.copied") : t("userPanelPopup.copyUserId")}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
