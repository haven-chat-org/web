import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.js";
import { type BanResponse } from "@haven-chat-org/core";

interface BansTabProps {
  serverId: string;
  bans: BanResponse[];
  setBans: React.Dispatch<React.SetStateAction<BanResponse[]>>;
  setError: (msg: string) => void;
}

export default function BansTab({
  serverId,
  bans,
  setBans,
  setError,
}: BansTabProps) {
  const { t } = useTranslation();
  const api = useAuthStore((s) => s.api);

  async function handleRevokeBan(userId: string) {
    try {
      await api.revokeBan(serverId, userId);
      setBans((prev) => prev.filter((b) => b.user_id !== userId));
    } catch (err: any) {
      setError(err.message || t("serverSettings.bans.failedRevoke"));
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">{t("serverSettings.bans.title")} ({bans.length})</div>
      {bans.map((ban) => (
        <div key={ban.id} className="server-member-row">
          <div className="server-member-avatar" style={{ background: "var(--red)" }}>
            {ban.username.charAt(0).toUpperCase()}
          </div>
          <div className="server-member-info">
            <span className="server-member-name">{ban.username}</span>
            {ban.reason && (
              <span className="server-member-username">{t("serverSettings.bans.reason")} {ban.reason}</span>
            )}
            <span className="server-member-username">
              {t("serverSettings.bans.banned")} {new Date(ban.created_at).toLocaleDateString()}
            </span>
          </div>
          <button
            className="btn-ghost"
            onClick={() => handleRevokeBan(ban.user_id)}
          >
            {t("serverSettings.bans.revoke")}
          </button>
        </div>
      ))}
      {bans.length === 0 && (
        <p className="settings-description">{t("serverSettings.bans.emptyMessage")}</p>
      )}
    </div>
  );
}
