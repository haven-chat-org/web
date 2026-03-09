import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.js";
import type { BlockedUserResponse } from "@haven-chat-org/core";
import Avatar from "../Avatar.js";

export default function PrivacyTab() {
  const { t } = useTranslation();
  const api = useAuthStore((s) => s.api);
  const user = useAuthStore((s) => s.user);

  const [dmPrivacy, setDmPrivacy] = useState("everyone");
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getBlockedUsers(),
    ]).then(([blocked]) => {
      if (cancelled) return;
      setBlockedUsers(blocked);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [api]);

  async function handleDmPrivacyChange(value: string) {
    setDmPrivacy(value);
    try {
      await api.updateDmPrivacy({ dm_privacy: value });
    } catch { /* non-fatal */ }
  }

  async function handleUnblock(userId: string) {
    try {
      await api.unblockUser(userId);
      setBlockedUsers((prev) => prev.filter((b) => b.user_id !== userId));
    } catch { /* non-fatal */ }
  }

  if (loading) {
    return <div className="settings-section"><p className="settings-loading">{t("userSettings.privacy.loading")}</p></div>;
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">{t("userSettings.privacy.dmPrivacy")}</div>
      <p className="settings-description">
        {t("userSettings.privacy.dmPrivacyDesc")}
      </p>
      <div className="settings-select-group">
        {[
          { value: "everyone", label: t("userSettings.privacy.everyone") },
          { value: "friends_only", label: t("userSettings.privacy.friendsOnly") },
          { value: "server_members", label: t("userSettings.privacy.serverMembers") },
        ].map((opt) => (
          <label key={opt.value} className="settings-radio-label">
            <input
              type="radio"
              name="dm_privacy"
              value={opt.value}
              checked={dmPrivacy === opt.value}
              onChange={() => handleDmPrivacyChange(opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>

      <div className="settings-section-title" style={{ marginTop: 24 }}>
        {t("userSettings.privacy.blockedUsers")} {blockedUsers.length > 0 && `(${blockedUsers.length})`}
      </div>
      {blockedUsers.length === 0 ? (
        <p className="settings-description">{t("userSettings.privacy.noBlockedUsers")}</p>
      ) : (
        <div className="settings-blocked-list">
          {blockedUsers.map((b) => (
            <div key={b.user_id} className="settings-blocked-row">
              <Avatar
                avatarUrl={b.avatar_url}
                name={b.display_name || b.username}
                size={32}
              />
              <div className="settings-blocked-info">
                <span className="settings-blocked-name">{b.display_name || b.username}</span>
                <span className="settings-blocked-username">{b.username}</span>
              </div>
              <button
                className="btn-secondary settings-unblock-btn"
                onClick={() => handleUnblock(b.user_id)}
              >
                {t("userSettings.privacy.unblock")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
