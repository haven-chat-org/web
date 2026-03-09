import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.js";
import { type InviteResponse } from "@haven-chat-org/core";

interface InvitesTabProps {
  serverId: string;
  invites: InviteResponse[];
  setInvites: React.Dispatch<React.SetStateAction<InviteResponse[]>>;
  canManageInvites: boolean;
  setError: (msg: string) => void;
}

export default function InvitesTab({
  serverId,
  invites,
  setInvites,
  canManageInvites,
  setError,
}: InvitesTabProps) {
  const { t } = useTranslation();
  const api = useAuthStore((s) => s.api);
  const [createdCode, setCreatedCode] = useState("");

  async function handleCreateInvite() {
    setError("");
    setCreatedCode("");
    try {
      const invite = await api.createInvite(serverId, { expires_in_hours: 24 });
      setCreatedCode(invite.code);
      setInvites((prev) => [invite, ...prev]);
    } catch (err: any) {
      setError(err.message || t("serverSettings.invites.failedCreate"));
    }
  }

  async function handleDeleteInvite(inviteId: string) {
    try {
      await api.deleteInvite(serverId, inviteId);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (err: any) {
      setError(err.message || t("serverSettings.invites.failedRevoke"));
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">{t("serverSettings.invites.title")}</div>
      <div style={{ marginBottom: 16 }}>
        <button className="btn-primary" onClick={handleCreateInvite}>
          {t("serverSettings.invites.createInvite")}
        </button>
        {createdCode && (
          <div className="invite-created" style={{ marginTop: 8 }}>
            {t("serverSettings.invites.code")} <strong>{createdCode}</strong>
            <button
              className="btn-ghost"
              onClick={() => navigator.clipboard.writeText(createdCode)}
              style={{ marginLeft: 8 }}
            >
              {t("serverSettings.invites.copy")}
            </button>
          </div>
        )}
      </div>

      {invites.map((inv) => (
        <div key={inv.id} className="invite-row">
          <div className="invite-code">{inv.code}</div>
          <div className="invite-meta">
            {t("serverSettings.invites.uses")} {inv.use_count}{inv.max_uses ? `/${inv.max_uses}` : ""}
            {inv.expires_at && (
              <span> | {t("serverSettings.invites.expires")} {new Date(inv.expires_at).toLocaleString()}</span>
            )}
          </div>
          {canManageInvites && (
            <button
              className="btn-ghost"
              onClick={() => handleDeleteInvite(inv.id)}
            >
              {t("serverSettings.invites.revoke")}
            </button>
          )}
        </div>
      ))}
      {invites.length === 0 && (
        <p className="settings-description">
          {t("serverSettings.invites.emptyMessage")}
        </p>
      )}
    </div>
  );
}
